/** A Lemon Squeezy webhook event reduced to what Flowcam uses. Pure: no I/O. */
export interface BillingEvent {
  /** Stable per delivery of the same event, so a repeat is recognised (Lemon Squeezy sends no event id). */
  id: string;
  name: string;
  userId: string | null;
  /** The subscription this event is about (for payment events, the invoice's subscription). */
  subscriptionId: string | null;
  customerId: string | null;
  status: string | null;
  interval: "month" | "year" | null;
  kind: "trial" | "pro" | "topup" | null;
  renewsAt: Date | null;
  endsAt: Date | null;
  orderId: string | null;
}

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : null);
const date = (v: unknown) => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** Null when the body is not an event we can identify. */
export function parseEvent(body: unknown): BillingEvent | null {
  const b = body as { meta?: { event_name?: unknown; custom_data?: Record<string, unknown> }; data?: { id?: unknown; attributes?: Record<string, unknown> } } | null;
  const name = str(b?.meta?.event_name);
  const dataId = str(b?.data?.id);
  if (!name || !dataId) return null;
  const a = b?.data?.attributes ?? {};
  const custom = b?.meta?.custom_data ?? {};
  const isPayment = name.startsWith("subscription_payment_");
  const interval = custom.interval === "year" ? "year" : custom.interval === "month" ? "month" : null;
  const kind = custom.kind === "trial" || custom.kind === "pro" || custom.kind === "topup" ? custom.kind : null;
  return {
    id: `${name}:${dataId}:${str(a.updated_at) ?? str(a.created_at) ?? ""}`,
    name,
    userId: str(custom.user_id),
    subscriptionId: isPayment ? str(a.subscription_id) : name.startsWith("subscription_") ? dataId : null,
    customerId: str(a.customer_id),
    status: str(a.status),
    interval,
    kind,
    renewsAt: date(a.renews_at),
    endsAt: date(a.ends_at),
    orderId: name === "order_created" ? dataId : null,
  };
}

/** The start of the period that ends at `end`, one interval earlier: the stable key for that period's Credits. */
export function periodStart(end: Date, interval: "month" | "year"): Date {
  const d = new Date(end);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() - 1);
  else d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}
