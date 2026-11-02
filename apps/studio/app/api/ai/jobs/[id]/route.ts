import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET -> { id, kind, quality, status, credits, model, result, error }. Row-level security: only the owner sees a Job. 401 signed out, 404 unknown. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await supabaseServer();
  if (!(await db.auth.getUser()).data.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const { data } = await db.from("ai_jobs").select("id, kind, quality, status, credits, model, result, error").eq("id", id).maybeSingle();
  if (!data) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(data);
}
