import { supabaseAdmin } from "@/lib/supabase/admin";
import { getShare, isPlayable } from "@/modules/share/links";

/** Counts one visit. The page calls it once per browser session (sessionStorage guard). */
export async function POST(_req: Request, ctx: RouteContext<"/api/share/[id]/view">) {
  const link = await getShare((await ctx.params).id);
  if (!link || !(await isPlayable(link))) return Response.json({ error: "Not found." }, { status: 404 });
  const { data, error } = await supabaseAdmin().rpc("count_share_view", { link_id: link.id });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ views: data as number });
}
