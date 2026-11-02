import { handleWebhook } from "@/modules/billing/webhook";

export const runtime = "nodejs";

/** Lemon Squeezy webhook (also what the demo adapter calls). The signature covers the raw body, so read it as text. */
export async function POST(req: Request) {
  const r = await handleWebhook(await req.text(), req.headers.get("x-signature"));
  return Response.json(r.body, { status: r.status });
}
