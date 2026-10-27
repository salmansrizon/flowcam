export type PlanLabel = "Free" | "Trial" | "Pro";

/** The plan to show for a `subscriptions` row: only an active, unexpired one counts (mirrors `is_pro`). */
export function planLabel(row: { plan: string; status: string; current_period_end: string } | null): PlanLabel {
  if (!row || row.status !== "active" || new Date(row.current_period_end) <= new Date()) return "Free";
  return row.plan === "trial" ? "Trial" : "Pro";
}
