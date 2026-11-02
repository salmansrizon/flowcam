import { hostFor } from "@/modules/share/host";
import { getShare, isPlayable } from "@/modules/share/links";
import { verifyPassword } from "@/modules/share/password";

/** The video URL and Presentation, only for a correct password (or none set). The one place they leave the server. */
export async function POST(req: Request, ctx: RouteContext<"/api/share/[id]/unlock">) {
  const link = await getShare((await ctx.params).id);
  if (!link || !(await isPlayable(link))) return Response.json({ error: "Not found." }, { status: 404 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (link.password_hash && !(typeof password === "string" && verifyPassword(password, link.password_hash))) {
    return Response.json({ error: "Wrong password." }, { status: 403 });
  }
  return Response.json({ url: await hostFor(link).playbackUrl(link), presentation: link.presentation });
}
