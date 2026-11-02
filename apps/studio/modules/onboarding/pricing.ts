export interface Pricing {
  currency: string;
  listMonthlyCents: number;
  listYearlyCents: number;
  foundingMonthlyCents: number;
  foundingYearlyCents: number;
  /** Null until launch: the Founding window is open. */
  foundingUntil: Date | null;
  foundingMaxSubscribers: number;
  trialDays: number;
  trialCredits: number;
  monthlyCredits: number;
  topupCents: number;
  topupCredits: number;
}

const INT = ["list_monthly_cents", "list_yearly_cents", "founding_monthly_cents", "founding_yearly_cents", "founding_max_subscribers", "trial_days", "trial_credits", "monthly_credits", "topup_cents", "topup_credits"] as const;
const POSITIVE = ["list_monthly_cents", "list_yearly_cents", "founding_monthly_cents", "founding_yearly_cents", "trial_days", "topup_cents", "topup_credits"] as const;

/** Validates a `pricing` row. Anything missing or malformed gives null, so the UI shows no numbers rather than wrong ones. */
export function parsePricing(row: unknown): Pricing | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  for (const k of INT) if (!Number.isInteger(r[k]) || (r[k] as number) < 0) return null;
  if (POSITIVE.some((k) => (r[k] as number) === 0)) return null;
  if (typeof r.currency !== "string" || !/^[A-Z]{3}$/.test(r.currency)) return null;
  let until: Date | null = null;
  if (r.founding_until !== null && r.founding_until !== undefined) {
    if (typeof r.founding_until !== "string") return null;
    until = new Date(r.founding_until);
    if (Number.isNaN(until.getTime())) return null;
  }
  return {
    currency: r.currency,
    listMonthlyCents: r.list_monthly_cents as number,
    listYearlyCents: r.list_yearly_cents as number,
    foundingMonthlyCents: r.founding_monthly_cents as number,
    foundingYearlyCents: r.founding_yearly_cents as number,
    foundingUntil: until,
    foundingMaxSubscribers: r.founding_max_subscribers as number,
    trialDays: r.trial_days as number,
    trialCredits: r.trial_credits as number,
    monthlyCredits: r.monthly_credits as number,
    topupCents: r.topup_cents as number,
    topupCredits: r.topup_credits as number,
  };
}

// ponytail: the 500-subscriber cap is shown but not enforced here; checking it needs a subscriber count (billing work).
export const foundingOpen = (p: Pricing, now = new Date()) => p.foundingUntil === null || p.foundingUntil > now;

export function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

/** What a Pro plan costs now: the Founding Price while its window is open, the list price after (ADR 0008). */
export function proPriceCents(p: Pricing, interval: "month" | "year", now = new Date()): number {
  const founding = foundingOpen(p, now);
  if (interval === "month") return founding ? p.foundingMonthlyCents : p.listMonthlyCents;
  return founding ? p.foundingYearlyCents : p.listYearlyCents;
}
