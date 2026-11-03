import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { billing, demoEvent } from "@/modules/billing/billing";
import { deliverDemoEvent } from "@/modules/billing/webhook";

export const runtime = "nodejs";

/** POST -> { ok }. Demo only: emits a subscription_cancelled event through the webhook path. Real accounts cancel in the Lemon Squeezy portal. */
export async function POST() {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    if (billing().name !== "demo") return Response.json({ error: "Cancel in the billing portal." }, { status: 404 });
    const { data: sub } = await supabaseAdmin().from("subscriptions").select("provider_subscription_id,current_period_end").eq("user_id", data.user.id).maybeSingle();
    if (!sub?.provider_subscription_id) return Response.json({ error: "No subscription to cancel." }, { status: 409 });
    const r = await deliverDemoEvent(demoEvent("subscription_cancelled", data.user.id, { dataId: sub.provider_subscription_id, attributes: { status: "cancelled", ends_at: sub.current_period_end } }));
    return r.status === 200 ? Response.json({ ok: true }) : Response.json(r.body, { status: 500 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
