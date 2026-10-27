import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
/** Returns the Hold id; throws "insufficient_credits" when the amount exceeds the balance. */
export const placeHold = (uid: string, amount: number, note?: string) => rpc<number>("place_hold", { uid, amount, note: note ?? null });
export const chargeHold = (holdId: number) => rpc<null>("charge_hold", { hold_id: holdId });
export const releaseHold = (holdId: number) => rpc<null>("release_hold", { hold_id: holdId });
