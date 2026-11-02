import { parsePresentation } from "@flowcam/domain";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { videoHost } from "@/modules/share/host";
import { isProNow, newShareId } from "@/modules/share/links";
import { hashPassword } from "@/modules/share/password";

const MAX_BYTES = 500 * 1024 * 1024;

/** Creates a Share Link from a multipart body: video (MP4), title, presentation (JSON), optional password. Pro only. */
export async function POST(req: Request) {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!(await isProNow(user.id))) return Response.json({ error: "Share Links are a Pro feature." }, { status: 403 });

  const form = await req.formData();
  const video = form.get("video");
  const title = String(form.get("title") ?? "").trim().slice(0, 200) || "Untitled";
  const password = String(form.get("password") ?? "");
  if (!(video instanceof Blob) || video.size === 0 || video.size > MAX_BYTES) return Response.json({ error: "A video up to 500 MB is required." }, { status: 400 });
  let presentation;
  try {
    presentation = parsePresentation(JSON.parse(String(form.get("presentation"))));
  } catch {
    return Response.json({ error: "The Presentation is not valid." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const id = newShareId();
  const { error } = await db.from("share_links").insert({ id, owner_id: user.id, title, presentation, password_hash: password ? await hashPassword(password) : null });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  try {
    const host = videoHost();
    const stored = await host.upload(user.id, id, video);
    const done = await db.from("share_links").update({ ...stored, status: "ready" }).eq("id", id);
    if (done.error) throw new Error(done.error.message);
  } catch (e) {
    await db.from("share_links").update({ status: "failed" }).eq("id", id);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  return Response.json({ id, url: `${new URL(req.url).origin}/s/${id}` });
}
