export type PlanLabel = "Free" | "Trial" | "Pro";

/** The plan to show for a `subscriptions` row: only an active, unexpired one counts (mirrors `is_pro`). */
export function planLabel(row: { plan: string; status: string; current_period_end: string } | null): PlanLabel {
  if (!row || row.status !== "active" || new Date(row.current_period_end) <= new Date()) return "Free";
  return row.plan === "trial" ? "Trial" : "Pro";
}

/** "Cancels on <date>" for a Pro or Trial that will not renew, else null. */
export function cancelNote(row: { cancel_at_period_end?: boolean; current_period_end: string } | null, label: PlanLabel): string | null {
  return row?.cancel_at_period_end && label !== "Free" ? `Cancels on ${new Date(row.current_period_end).toLocaleDateString()}` : null;
}
