import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { planLabel } from "@/modules/account/plan";
import { billing, type Item } from "@/modules/billing/billing";

export const runtime = "nodejs";

/** POST { kind: "trial"|"pro", interval: "month"|"year" } or { kind: "topup" } -> { url }. 401 signed out, 400 bad input, 409 not allowed. */
export async function POST(req: Request) {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { kind?: unknown; interval?: unknown } | null;
  let item: Item;
  if (b?.kind === "topup") item = { kind: "topup" };
  else if ((b?.kind === "trial" || b?.kind === "pro") && (b.interval === "month" || b.interval === "year")) item = { kind: b.kind, interval: b.interval };
  else return Response.json({ error: "Send kind trial, pro or topup, and an interval for plans." }, { status: 400 });
  try {
    if (item.kind !== "topup") {
      const { data: sub } = await supabaseAdmin().from("subscriptions").select("plan,status,current_period_end").eq("user_id", data.user.id).maybeSingle();
      if (item.kind === "trial" && sub) return Response.json({ error: "The Trial is for accounts that have never subscribed." }, { status: 409 });
      if (item.kind === "pro" && planLabel(sub) === "Pro") return Response.json({ error: "You are already on Pro." }, { status: 409 });
    }
    return Response.json({ url: await billing().checkout(data.user.id, data.user.email, item) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
