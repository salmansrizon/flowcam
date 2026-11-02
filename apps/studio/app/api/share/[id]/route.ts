import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { hostFor } from "@/modules/share/host";
import { getShare } from "@/modules/share/links";
import { hashPassword } from "@/modules/share/password";

async function owned(ctx: RouteContext<"/api/share/[id]">) {
  const { id } = await ctx.params;
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  const link = await getShare(id);
  if (!link || link.owner_id !== user.id) return { error: Response.json({ error: "Not found." }, { status: 404 }) };
  return { link };
}

/** Sets (string) or removes (empty/null) the password. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/share/[id]">) {
  const r = await owned(ctx);
  if (r.error) return r.error;
  const { password } = (await req.json().catch(() => ({}))) as { password?: string | null };
  await supabaseAdmin().from("share_links").update({ password_hash: password ? hashPassword(password) : null }).eq("id", r.link.id);
  return Response.json({ ok: true });
}

/** Soft-deletes the link and removes the stored video. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/share/[id]">) {
  const r = await owned(ctx);
  if (r.error) return r.error;
  await supabaseAdmin().from("share_links").update({ deleted_at: new Date().toISOString() }).eq("id", r.link.id);
  await hostFor(r.link).remove(r.link).catch(() => {});
  return Response.json({ ok: true });
}
