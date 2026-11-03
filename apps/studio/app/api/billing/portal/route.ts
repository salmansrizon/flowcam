import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { billing } from "@/modules/billing/billing";

export const runtime = "nodejs";

/** GET -> { url }: the Lemon Squeezy customer portal, or the local /billing page in demo mode. */
export async function GET() {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { data: sub } = await supabaseAdmin().from("subscriptions").select("provider_subscription_id").eq("user_id", data.user.id).maybeSingle();
    return Response.json({ url: (await billing().portalUrl(sub?.provider_subscription_id ?? null)) ?? "/billing" });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
