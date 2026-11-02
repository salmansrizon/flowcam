import { supabaseServer } from "@/lib/supabase/server";
import { billing, demoPaymentEvent, readDemoSession } from "@/modules/billing/billing";
import { deliverDemoEvent } from "@/modules/billing/webhook";

export const runtime = "nodejs";

/** POST { session } -> { next }. The demo "Pay" button: sends the signed event a real provider would. */
export async function POST(req: Request) {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    if (billing().name !== "demo") return Response.json({ error: "Demo billing is off." }, { status: 404 });
    const b = (await req.json().catch(() => null)) as { session?: string } | null;
    const s = readDemoSession(b?.session);
    if (!s || s.uid !== data.user.id) return Response.json({ error: "This checkout expired. Start again." }, { status: 400 });
    const r = await deliverDemoEvent(demoPaymentEvent(s));
    return r.status === 200 ? Response.json({ next: s.kind === "topup" ? "/credits" : "/" }) : Response.json(r.body, { status: 500 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
