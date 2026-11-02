import { timingSafeEqual } from "node:crypto";
import { sweep } from "@/modules/ai/worker";

export const runtime = "nodejs";

/**
 * POST with header `x-worker-secret: $FLOWCAM_WORKER_SECRET` (e.g. from a cron every minute): re-queues Jobs stuck
 * "running" for over 5 minutes, fails those out of attempts, and runs up to 10 queued Jobs. Returns { ran }.
 * 503 if the secret is not configured (the route stays closed), 401 on a wrong secret.
 */
export async function POST(req: Request) {
  const secret = process.env.FLOWCAM_WORKER_SECRET;
  if (!secret) return Response.json({ error: "FLOWCAM_WORKER_SECRET is not set." }, { status: 503 });
  const got = Buffer.from(req.headers.get("x-worker-secret") ?? "");
  const want = Buffer.from(secret);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  return Response.json({ ran: await sweep() });
}
