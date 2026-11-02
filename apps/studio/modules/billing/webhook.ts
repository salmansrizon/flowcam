import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { foundingOpen } from "../onboarding/pricing";
import { billing, billingProvider, loadPricingServer } from "./billing";
import { parseEvent, periodStart, type BillingEvent } from "./events";
import { sign, verifySignature } from "./signature";

export type Result = { status: number; body: { ok?: boolean; error?: string; duplicate?: boolean; ignored?: boolean } };

/** Handles one webhook delivery: verify, record once in `billing_events`, then apply it. Repeats do nothing. */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<Result> {
  // The "demo" secret is public: refuse it unless demo billing is allowed (billing() refuses demo in production).
  try {
    if (billing().name !== "demo" && process.env.LEMONSQUEEZY_WEBHOOK_SECRET === "demo") throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is still demo.");
  } catch (e) {
    return { status: 500, body: { error: (e as Error).message } };
  }
  if (!verifySignature(rawBody, signature, process.env.LEMONSQUEEZY_WEBHOOK_SECRET)) return { status: 401, body: { error: "Bad signature." } };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Not JSON." } };
  }
  const ev = parseEvent(json);
  if (!ev) return { status: 400, body: { error: "Unrecognised event." } };

  const db = supabaseAdmin();
  const uid = ev.userId ?? (await userBySubscription(ev.subscriptionId));
  const { error: dup } = await db.from("billing_events").insert({ id: ev.id, provider: billingProvider(), type: ev.name, user_id: uid, payload: json });
  if (dup?.code === "23505") return { status: 200, body: { ok: true, duplicate: true } };
  if (dup) return { status: 500, body: { error: dup.message } };
  try {
    const applied = uid ? await apply(ev, uid) : false;
    return { status: 200, body: { ok: true, ignored: !applied } }; // Unknown events are recorded and acknowledged.
  } catch (e) {
    await db.from("billing_events").delete().eq("id", ev.id); // So the provider's retry is processed, not skipped as a repeat.
    return { status: 500, body: { error: (e as Error).message } };
  }
}

/** What the demo adapter does instead of an HTTP call: sign the event and run it through the same handler. */
export function deliverDemoEvent(event: unknown) {
  const raw = JSON.stringify(event);
  return handleWebhook(raw, sign(raw, process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? ""));
}

async function userBySubscription(subId: string | null): Promise<string | null> {
  if (!subId) return null;
  const { data } = await supabaseAdmin().from("subscriptions").select("user_id").eq("provider", billingProvider()).eq("provider_subscription_id", subId).maybeSingle();
  return data?.user_id ?? null;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw new Error(error.message);
}

async function update(uid: string, fields: Record<string, unknown>) {
  const { error } = await supabaseAdmin().from("subscriptions").update({ ...fields, updated_at: new Date().toISOString() }).eq("user_id", uid);
  if (error) throw new Error(error.message);
}

/** Returns false when the event needs no change (not an error). */
async function apply(ev: BillingEvent, uid: string): Promise<boolean> {
  const db = supabaseAdmin();
  const provider = billingProvider();
  switch (ev.name) {
    case "subscription_created": {
      const pricing = await loadPricingServer();
      if (!pricing) throw new Error("Pricing is not available.");
      const trial = ev.status === "on_trial" || ev.kind === "trial";
      const interval = ev.interval ?? "month";
      const end = trial ? new Date(Date.now() + pricing.trialDays * 86_400_000) : (ev.renewsAt ?? new Date(Date.now() + 31 * 86_400_000));
      const { data: before } = await db.from("subscriptions").select("paid_once, founding").eq("user_id", uid).maybeSingle();
      const { error } = await db.from("subscriptions").upsert({
        user_id: uid,
        plan: trial ? "trial" : "pro",
        status: "active",
        current_period_end: end.toISOString(),
        founding: (before?.founding ?? false) || (!trial && foundingOpen(pricing)),
        provider,
        provider_customer_id: ev.customerId,
        provider_subscription_id: ev.subscriptionId,
        billing_interval: interval,
        cancel_at_period_end: false,
        paid_once: (before?.paid_once ?? false) || !trial,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      if (trial) await rpc("grant_trial_credits", { uid });
      else await rpc("grant_monthly_credits", { uid, period_start: periodStart(end, interval).toISOString() });
      return true;
    }
    case "subscription_updated":
    case "subscription_resumed": {
      if (ev.status === "expired") return apply({ ...ev, name: "subscription_expired" }, uid);
      if (ev.status === "cancelled") return apply({ ...ev, name: "subscription_cancelled" }, uid);
      if (ev.status !== "active" || !ev.renewsAt) return false;
      const { data: sub } = await db.from("subscriptions").select("billing_interval").eq("user_id", uid).maybeSingle();
      const interval = ev.interval ?? (sub?.billing_interval as "month" | "year" | null) ?? "month";
      await update(uid, { plan: "pro", status: "active", current_period_end: ev.renewsAt.toISOString(), cancel_at_period_end: false, paid_once: true, billing_interval: interval });
      await rpc("grant_monthly_credits", { uid, period_start: periodStart(ev.renewsAt, interval).toISOString() });
      return true;
    }
    case "subscription_payment_success":
      await update(uid, { paid_once: true });
      return true;
    case "subscription_cancelled":
      // Stays Pro until the period ends (ADR 0005); the period end only moves if the provider says when access ends.
      await update(uid, { cancel_at_period_end: true, ...(ev.endsAt ? { current_period_end: ev.endsAt.toISOString() } : {}) });
      return true;
    case "subscription_expired":
      await update(uid, { status: "expired" });
      return true;
    case "order_created": {
      if (ev.kind !== "topup" || ev.status !== "paid" || !ev.orderId) return false;
      const pricing = await loadPricingServer();
      if (!pricing) throw new Error("Pricing is not available.");
      await rpc("grant_topup_credits", { uid, amount: pricing.topupCredits, ref: ev.orderId });
      return true;
    }
    default:
      return false;
  }
}
