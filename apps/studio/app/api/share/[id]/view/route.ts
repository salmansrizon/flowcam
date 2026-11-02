import { supabaseAdmin } from "@/lib/supabase/admin";
import { getShare, isPlayable } from "@/modules/share/links";

/** Counts one visit. The page calls it once per browser session (sessionStorage guard). */
export async function POST(_req: Request, ctx: RouteContext<"/api/share/[id]/view">) {
  const link = await getShare((await ctx.params).id);
  if (!link || !(await isPlayable(link))) return Response.json({ error: "Not found." }, { status: 404 });
  // ponytail: read-then-write can lose a count under a race; a SQL increment function is the upgrade.
  await supabaseAdmin().from("share_links").update({ views: link.views + 1 }).eq("id", link.id);
  return Response.json({ views: link.views + 1 });
}
