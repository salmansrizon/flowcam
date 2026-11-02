import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const newShareId = () => randomBytes(12).toString("base64url"); // 16 chars of [A-Za-z0-9_-]
export const validShareId = (id: string) => /^[A-Za-z0-9_-]{10,32}$/.test(id);

/** Same rule as the database's is_pro: an active, unexpired subscription (Trial included). Checked with the secret key. */
async function subscription(uid: string) {
  const { data } = await supabaseAdmin().from("subscriptions").select("status,current_period_end,paid_once").eq("user_id", uid).maybeSingle();
  return data;
}
export async function isProNow(uid: string): Promise<boolean> {
  const s = await subscription(uid);
  return !!s && s.status === "active" && new Date(s.current_period_end) > new Date();
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
  return !!s && (s.paid_once || (s.status === "active" && new Date(s.current_period_end) > new Date()));
}
