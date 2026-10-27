import type { Presentation } from "@flowcam/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "../../lib/supabase/client";
import { imageIdsOf, readAsset, sha256Hex, writeAsset } from "../presentation/assets";
import { clearMeta, readLocal, readMeta, writeLocal, writeMeta } from "../presentation/local";

// Sync (ADR 0005): only for a signed-in Pro user. Everyone else makes no Sync network calls.
// Local saves are pushed after a debounce with the cloud version they were based on; a stale push is refused
// by save_presentation and surfaces as a conflict the user resolves. Nothing is overwritten silently.

export type SyncState = "off" | "synced" | "syncing" | "offline" | "conflict";
export interface Cloud {
  id: string;
  version: number;
  data: Presentation;
}
export interface SyncSnapshot {
  state: SyncState;
  conflict: Cloud | null;
}

const DEBOUNCE_MS = 800;
const RETRY_MS = 3000;
const PRO_TTL_MS = 5 * 60_000;

let snap: SyncSnapshot = { state: "off", conflict: null };
const listeners = new Set<() => void>();
const set = (s: Partial<SyncSnapshot>) => {
  snap = { ...snap, ...s };
  listeners.forEach((l) => l());
};
export const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const getSnapshot = () => snap;
const serverSnap: SyncSnapshot = { state: "off", conflict: null };
export const getServerSnapshot = () => serverSnap;

// ponytail: one serial chain for every Sync step; a queue per Presentation if the editor ever holds several.
let chain: Promise<unknown> = Promise.resolve();
const enqueue = <T>(f: () => Promise<T>) => {
  const next = chain.then(f, f);
  chain = next.catch(() => {});
  return next;
};
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pro: { value: boolean; at: number; uid: string } | null = null;

type Ctx = { sb: SupabaseClient; uid: string };

const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(v);
/** Key-order-independent digest: the cloud's jsonb does not keep key order. */
const digest = (p: Presentation) => sha256Hex(new TextEncoder().encode(canon(p)).buffer as ArrayBuffer);

/** The Sync context, "off" when definitely local-only, or "unknown" when Pro status could not be checked (offline). */
async function context(): Promise<Ctx | "off" | "unknown"> {
  try {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getSession(); // reads the stored session; no network unless the token needs refreshing
    const uid = data.session?.user.id;
    if (!uid) return "off";
    if (!pro || pro.uid !== uid || Date.now() - pro.at > PRO_TTL_MS) {
      const { data: row, error } = await sb.from("subscriptions").select("status,current_period_end").maybeSingle();
      if (error) return pro?.uid === uid ? (pro.value ? { sb, uid } : "off") : "unknown";
      pro = { uid, at: Date.now(), value: !!row && row.status === "active" && new Date(row.current_period_end) > new Date() };
    }
    return pro.value ? { sb, uid } : "off";
  } catch {
    return "unknown";
  }
}

function sniffType(b: Uint8Array): string {
  const is = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (is(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (is(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (is(0x47, 0x49, 0x46)) return "image/gif";
  if (is(0x52, 0x49, 0x46, 0x46)) return "image/webp";
  return "image/svg+xml";
}

async function uploadImages({ sb, uid }: Ctx, p: Presentation) {
  const ids = imageIdsOf(p);
  if (!ids.length) return;
  const { data, error } = await sb.from("assets").select("sha256").in("sha256", ids);
  if (error) throw error;
  const have = new Set(data.map((r) => r.sha256));
  for (const id of ids.filter((i) => !have.has(i))) {
    const bytes = new Uint8Array(await (await readAsset(id)).arrayBuffer());
    const type = sniffType(bytes);
    const up = await sb.storage.from("assets").upload(`${uid}/${id}`, bytes, { contentType: type });
    if (up.error && !/already exists|Duplicate/i.test(up.error.message)) throw up.error;
    const ins = await sb.from("assets").insert({ owner_id: uid, sha256: id, bytes: bytes.length, content_type: type });
    if (ins.error && ins.error.code !== "23505") throw ins.error;
  }
}

async function downloadImages({ sb, uid }: Ctx, p: Presentation) {
  for (const id of imageIdsOf(p)) {
    try {
      await readAsset(id);
    } catch {
      const { data, error } = await sb.storage.from("assets").download(`${uid}/${id}`);
      if (error) throw error;
      await writeAsset(data);
    }
  }
}

async function fetchCloud({ sb }: Ctx, id?: string): Promise<Cloud | null> {
  let q = sb.from("presentations").select("id,version,data").is("deleted_at", null);
  q = id ? q.eq("id", id) : q.order("updated_at", { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data as Cloud | null;
}

async function adopt(ctx: Ctx, c: Cloud) {
  await downloadImages(ctx, c.data);
  await writeLocal(c.data);
  await writeMeta({ id: c.id, baseVersion: c.version, dirty: false, hash: await digest(c.data) });
}

/** Called by the store after every local save. Cheap and network-free unless Sync is on. */
export function afterLocalSave(p: Presentation) {
  seq++;
  void enqueue(async () => {
    const ctx = await context();
    if (ctx === "off") {
      // Edits made while not syncing must not later look "already synced".
      set({ state: "off" });
      return clearMeta();
    }
    if (ctx === "unknown") return set({ state: "offline" });
    const meta = await readMeta();
    if (meta?.id === p.id && !meta.dirty && meta.hash === (await digest(p))) return; // unchanged since the last sync
    await writeMeta({ id: p.id, baseVersion: meta?.id === p.id ? meta.baseVersion : 0, dirty: true, hash: meta?.hash });
    if (snap.state !== "conflict") schedulePush();
  });
}

function schedulePush(delay = DEBOUNCE_MS) {
  clearTimeout(timer);
  set({ state: "syncing" });
  timer = setTimeout(() => void enqueue(push), delay);
}

function retryLater() {
  set({ state: "offline" });
  clearTimeout(timer);
  timer = setTimeout(() => void enqueue(push), RETRY_MS);
}

async function push() {
  if (!navigator.onLine) return retryLater(); // skip the client's slow network retries
  if (snap.conflict) return;
  const ctx = await context();
  if (ctx === "off") return set({ state: "off" });
  if (ctx === "unknown") return retryLater();
  const seen = seq;
  try {
    const local = await readLocal();
    const meta = await readMeta();
    if (!local || (meta?.id === local.id && !meta.dirty)) return set({ state: "synced" });
    const base = meta?.id === local.id ? meta.baseVersion : 0;
    await uploadImages(ctx, local);
    const { data, error } = await ctx.sb.rpc("save_presentation", { p_id: local.id, p_base_version: base, p_data: local });
    if (error) {
      if (error.message.includes("pro_required")) return (pro = null), set({ state: "off" });
      throw error;
    }
    const res = data as { status: "saved" | "conflict"; version: number };
    if (res.status === "conflict") {
      const cloud = await fetchCloud(ctx, local.id);
      if (!cloud) throw new Error("conflict without a cloud copy");
      return set({ state: "conflict", conflict: cloud });
    }
    await writeMeta({ id: local.id, baseVersion: res.version, dirty: seq !== seen, hash: await digest(local) });
    set({ state: "synced" });
  } catch {
    retryLater();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (snap.state === "offline") schedulePush(0);
  });
}

/** Pulls the cloud copy when it is newer. Returns the Presentation to open (the local one unless replaced). */
export function pullOnLoad(local: Presentation | null): Promise<Presentation | null> {
  return enqueue(async () => {
    const ctx = await context();
    if (ctx === "off") return set({ state: "off" }), local;
    if (ctx === "unknown") return set({ state: "offline" }), local;
    set({ state: "syncing" });
    try {
      const cloud = await fetchCloud(ctx, local?.id);
      const meta = await readMeta();
      if (!cloud) {
        if (local) schedulePush(0);
        else set({ state: "synced" });
        return local;
      }
      const synced = !!local && meta?.id === local.id;
      if (!local || (synced && !meta.dirty && meta.baseVersion < cloud.version)) {
        await adopt(ctx, cloud);
        set({ state: "synced" });
        return cloud.data;
      }
      if (synced && meta.baseVersion === cloud.version) {
        if (meta.dirty) schedulePush(0);
        else set({ state: "synced" });
        return local;
      }
      if (JSON.stringify(local) === JSON.stringify(cloud.data)) {
        await writeMeta({ id: cloud.id, baseVersion: cloud.version, dirty: false, hash: await digest(cloud.data) });
        set({ state: "synced" });
        return local;
      }
      set({ state: "conflict", conflict: cloud });
      return local;
    } catch {
      retryLater();
      return local;
    }
  });
}

/** Resolves the open conflict. Callers reload afterwards so the editor shows what is now stored locally. */
export function resolveConflict(choice: "keep-both" | "use-cloud"): Promise<void> {
  return enqueue(async () => {
    const cloud = snap.conflict;
    const ctx = await context();
    if (!cloud || typeof ctx === "string") throw new Error("Sync is unavailable; try again when you are online.");
    if (choice === "keep-both") {
      const local = await readLocal();
      if (local) {
        const copy = { ...local, id: crypto.randomUUID(), title: `${local.title} (copy)` };
        await uploadImages(ctx, copy);
        const { error } = await ctx.sb.rpc("save_presentation", { p_id: copy.id, p_base_version: 0, p_data: copy });
        if (error) throw error;
      }
    }
    await adopt(ctx, cloud);
    set({ state: "synced", conflict: null });
  });
}
