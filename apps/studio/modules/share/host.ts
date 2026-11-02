import "server-only";
import { supabaseAdmin } from "../../lib/supabase/admin";

/** Where a Share Link's video lives. `demo` keeps the MP4 in the private `shares` bucket; `mux` uses Mux. */
export interface VideoHost {
  name: "demo" | "mux";
  /** Stores the MP4; returns the columns to save on the share_links row. */
  upload(ownerId: string, id: string, video: Uint8Array): Promise<{ video_path?: string; mux_asset_id?: string; mux_playback_id?: string }>;
  /** A URL the browser can play; only handed out after any password check. */
  playbackUrl(link: { video_path: string | null; mux_playback_id: string | null }): Promise<string>;
  remove(link: { video_path: string | null; mux_asset_id: string | null }): Promise<void>;
}

/** Which host the environment selects. Mirrors modules/ai/provider.ts: demo for "demo" (or no id), never silently in production. */
export function chooseHost(env: Record<string, string | undefined>): "demo" | "mux" {
  const demo = !env.MUX_TOKEN_ID || env.MUX_TOKEN_ID === "demo";
  if (demo && env.NODE_ENV === "production" && env.FLOWCAM_ALLOW_DEMO_SHARE !== "1") {
    throw new Error("MUX_TOKEN_ID is not set. Set it, or FLOWCAM_ALLOW_DEMO_SHARE=1 to keep Share Link videos in demo storage in production.");
  }
  return demo ? "demo" : "mux";
}

const demoHost: VideoHost = {
  name: "demo",
  async upload(ownerId, id, video) {
    const path = `${ownerId}/${id}.mp4`;
    const { error } = await supabaseAdmin().storage.from("shares").upload(path, video, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return { video_path: path };
  },
  async playbackUrl({ video_path }) {
    if (!video_path) throw new Error("No video stored.");
    const { data, error } = await supabaseAdmin().storage.from("shares").createSignedUrl(video_path, 3600);
    if (error || !data) throw new Error(`Signed URL failed: ${error?.message}`);
    return data.signedUrl;
  },
  async remove({ video_path }) {
    if (video_path) await supabaseAdmin().storage.from("shares").remove([video_path]);
  },
};

const MUX = "https://api.mux.com/video/v1";
const muxAuth = () => `Basic ${Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64")}`;
async function mux<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MUX}${path}`, { ...init, headers: { authorization: muxAuth(), "content-type": "application/json" } });
  if (!res.ok) throw new Error(`Mux ${init.method ?? "GET"} ${path} failed: HTTP ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

const muxHost: VideoHost = {
  name: "mux",
  async upload(_owner, _id, video) {
    const up = await mux<{ id: string; url: string }>("/uploads", {
      method: "POST",
      body: JSON.stringify({ new_asset_settings: { playback_policy: ["public"], video_quality: "basic" }, cors_origin: "*" }),
    });
    const put = await fetch(up.url, { method: "PUT", body: video as BodyInit, headers: { "content-type": "video/mp4" } });
    if (!put.ok) throw new Error(`Mux upload failed: HTTP ${put.status}`);
    // ponytail: poll up to ~30 s for the asset; a Mux webhook is the upgrade for long videos.
    for (let i = 0; i < 30; i++) {
      const u = await mux<{ asset_id?: string }>(`/uploads/${up.id}`);
      if (u.asset_id) {
        const a = await mux<{ playback_ids?: { id: string }[] }>(`/assets/${u.asset_id}`);
        const playback = a.playback_ids?.[0]?.id;
        if (playback) return { mux_asset_id: u.asset_id, mux_playback_id: playback };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Mux did not create the asset in time.");
  },
  async playbackUrl({ mux_playback_id }) {
    if (!mux_playback_id) throw new Error("No playback id.");
    return `https://stream.mux.com/${mux_playback_id}.m3u8`;
  },
  async remove({ mux_asset_id }) {
    if (mux_asset_id) await fetch(`${MUX}/assets/${mux_asset_id}`, { method: "DELETE", headers: { authorization: muxAuth() } });
  },
};

/** The host for new uploads, chosen by the environment. */
export function videoHost(): VideoHost {
  return chooseHost(process.env) === "demo" ? demoHost : muxHost;
}

/** Playback and removal follow how a row was stored, not the current env. */
export function hostFor(link: { mux_playback_id: string | null }): VideoHost {
  return link.mux_playback_id ? muxHost : demoHost;
}
