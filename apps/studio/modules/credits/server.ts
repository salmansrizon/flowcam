import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isActive } from "../account/plan";
import { dueMonth } from "../billing/events";

/** Server-side wrappers over the credit functions (supabase/migrations/20261027000200). Admin client only. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const creditBalance = (uid: string) => rpc<number>("credit_balance", { uid });
export const grantSignupCredits = (uid: string) => rpc<number>("grant_signup_credits", { uid });
export const grantTrialCredits = (uid: string) => rpc<number>("grant_trial_credits", { uid });
export const grantMonthlyCredits = (uid: string, periodStart: Date) =>
  rpc<number>("grant_monthly_credits", { uid, period_start: periodStart.toISOString() });
export const grantTopupCredits = (uid: string, amount: number, ref: string) => rpc<number>("grant_topup_credits", { uid, amount, ref });
/** Returns the Hold id; throws "insufficient_credits" when the amount exceeds the balance. */
export const placeHold = (uid: string, amount: number, note?: string) => rpc<number>("place_hold", { uid, amount, note: note ?? null });
export const chargeHold = (holdId: number) => rpc<null>("charge_hold", { hold_id: holdId });
export const releaseHold = (holdId: number) => rpc<null>("release_hold", { hold_id: holdId });

/**
 * Yearly Pro gets monthly Credits every month, but the provider only sends events once a year. Grants the month now
 * due (on a balance read and before a Hold); repeats do nothing. The first grant comes with the subscription event.
 */
export async function grantYearlyMonth(uid: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: s, error } = await db.from("subscriptions").select("plan,status,current_period_end,billing_interval").eq("user_id", uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!s || s.plan !== "pro" || s.billing_interval !== "year" || !isActive(s)) return;
  const { data: last, error: e2 } = await db.from("credit_ledger").select("note").eq("user_id", uid).eq("kind", "grant").eq("bucket", "monthly")
    .like("note", "period:%").order("id", { ascending: false }).limit(1).maybeSingle();
  if (e2) throw new Error(e2.message);
  const start = last ? new Date(last.note.slice("period:".length)) : null;
  if (!start || Number.isNaN(start.getTime())) return;
  const due = dueMonth(start, new Date(), new Date(s.current_period_end));
  if (due) await grantMonthlyCredits(uid, due);
}
