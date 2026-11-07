import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Load apps/studio/.env.local without printing it; real environment variables win.
try {
  for (const line of readFileSync(resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // No .env.local: the suite skips below.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
}));

describe.skipIf(!key || !url)("Share Link password attempts against the dev database (skipped: SUPABASE_SECRET_KEY not set)", () => {
  let db: SupabaseClient;
  let links: typeof import("./links");
  let uid: string;

  beforeAll(async () => {
    db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    links = await import("./links");
    const { data, error } = await db.auth.admin.createUser({ email: `e2e+${crypto.randomUUID().slice(0, 12)}@flowcam.test`, password: crypto.randomUUID(), email_confirm: true });
    if (error) throw error;
    uid = data.user.id;
  });
  afterAll(async () => {
    if (uid) await db.auth.admin.deleteUser(uid); // links and attempts go with the user
  });

  async function link() {
    const id = links.newShareId();
    const { error } = await db.from("share_links").insert({ id, owner_id: uid, title: "t", presentation: {} });
    if (error) throw error;
    return id;
  }

  it("allows 10 tries per link and client in 15 minutes, then refuses; other clients and links are separate", async () => {
    const id = await link();
    for (let i = 0; i < 10; i++) expect(await links.allowUnlockAttempt(id, "198.51.100.1")).toBe(true);
    expect(await links.allowUnlockAttempt(id, "198.51.100.1")).toBe(false);
    expect(await links.allowUnlockAttempt(id, "198.51.100.2")).toBe(true);
    expect(await links.allowUnlockAttempt(await link(), "198.51.100.1")).toBe(true);
  });

  it("starts a fresh window once 15 minutes have passed, and never stores the raw IP", async () => {
    const id = await link();
    for (let i = 0; i < 11; i++) await links.allowUnlockAttempt(id, "198.51.100.3");
    const { data: rows } = await db.from("share_unlock_attempts").select("client").eq("share_id", id);
    expect(rows).toHaveLength(1);
    expect(rows![0].client).not.toContain("198.51");
    await db.from("share_unlock_attempts").update({ window_start: new Date(Date.now() - 16 * 60_000).toISOString() }).eq("share_id", id);
    expect(await links.allowUnlockAttempt(id, "198.51.100.3")).toBe(true);
  });

  it("a correct password clears the count for that client only", async () => {
    const id = await link();
    for (let i = 0; i < 9; i++) await links.allowUnlockAttempt(id, "198.51.100.4");
    for (let i = 0; i < 10; i++) await links.allowUnlockAttempt(id, "198.51.100.5");
    await links.clearUnlockAttempts(id, "198.51.100.4");
    for (let i = 0; i < 10; i++) expect(await links.allowUnlockAttempt(id, "198.51.100.4")).toBe(true);
    expect(await links.allowUnlockAttempt(id, "198.51.100.5")).toBe(false);
  });
});
