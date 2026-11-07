import { hostFor } from "@/modules/share/host";
import { allowUnlockAttempt, clearUnlockAttempts, getShare, isPlayable, UNLOCK_WINDOW_MINUTES } from "@/modules/share/links";
import { verifyPassword } from "@/modules/share/password";

/** The video URL and Presentation, only for a correct password (or none set). The one place they leave the server. */
export async function POST(req: Request, ctx: RouteContext<"/api/share/[id]/unlock">) {
  const link = await getShare((await ctx.params).id);
  if (!link || !(await isPlayable(link))) return Response.json({ error: "Not found." }, { status: 404 });
  if (link.password_hash) {
    // Vercel overwrites x-forwarded-for with the client's IP, so the client cannot pick its own key there.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
    if (!(await allowUnlockAttempt(link.id, ip))) {
      return Response.json({ error: `Too many tries. Wait ${UNLOCK_WINDOW_MINUTES} minutes and try again.` }, { status: 429 });
    }
    const { password } = (await req.json().catch(() => ({}))) as { password?: string };
    if (!(typeof password === "string" && (await verifyPassword(password, link.password_hash)))) {
      return Response.json({ error: "Wrong password." }, { status: 403 });
    }
    await clearUnlockAttempts(link.id, ip);
  }
  return Response.json({ url: await hostFor(link).playbackUrl(link), presentation: link.presentation });
}
