import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isActive } from "../account/plan";

export const newShareId = () => randomBytes(12).toString("base64url"); // 16 chars of [A-Za-z0-9_-]
export const validShareId = (id: string) => /^[A-Za-z0-9_-]{10,32}$/.test(id);

/** The owner's subscription row, read with the secret key. */
async function subscription(uid: string) {
  const { data } = await supabaseAdmin().from("subscriptions").select("status,current_period_end,paid_once").eq("user_id", uid).maybeSingle();
  return data;
}
export async function isProNow(uid: string): Promise<boolean> {
  return isActive(await subscription(uid));
}

const COLUMNS = "id,owner_id,title,presentation,status,video_path,mux_asset_id,mux_playback_id,password_hash,views,created_at";
export type ShareRow = {
  id: string;
  owner_id: string;
  title: string;
  presentation: unknown;
  status: "processing" | "ready" | "failed";
  video_path: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  password_hash: string | null;
  views: number;
  created_at: string;
};

/** A live (not deleted) link by id, or null. Never use the result's password_hash outside the server. */
export async function getShare(id: string): Promise<ShareRow | null> {
  if (!validShareId(id)) return null;
  const { data } = await supabaseAdmin().from("share_links").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as ShareRow | null) ?? null;
}

/** ADR 0005: a link plays while its owner is Pro/Trial, or once they have paid; an unpaid ended Trial stops it. */
export async function isPlayable(link: ShareRow): Promise<boolean> {
  if (link.status !== "ready") return false;
  const s = await subscription(link.owner_id);
  return !!s && (s.paid_once || isActive(s));
}

export const UNLOCK_MAX_ATTEMPTS = 10;
export const UNLOCK_WINDOW_MINUTES = 15;

/** The client key for one link: an HMAC of the IP with a server secret, so stored keys cannot be reversed. */
const clientKey = (ip: string) => createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "").update(ip).digest("hex");

/**
 * Counts one password attempt for this link from this IP; false once over the limit in the window.
 * ponytail: per link and IP, so IP rotation gets more guesses; add a per-link cap if abused.
 */
export async function allowUnlockAttempt(linkId: string, ip: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("share_unlock_attempt", {
    link_id: linkId, client_key: clientKey(ip), max_attempts: UNLOCK_MAX_ATTEMPTS, window_seconds: UNLOCK_WINDOW_MINUTES * 60,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** A correct password clears the count, so viewers who know it are never locked out by their own visits. */
export async function clearUnlockAttempts(linkId: string, ip: string): Promise<void> {
  const { error } = await supabaseAdmin().from("share_unlock_attempts").delete().eq("share_id", linkId).eq("client", clientKey(ip));
  if (error) throw new Error(error.message);
}
