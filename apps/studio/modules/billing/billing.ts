import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { foundingOpen, parsePricing, type Pricing } from "../onboarding/pricing";
import { sign, verifySignature } from "./signature";

export type Item = { kind: "trial" | "pro"; interval: "month" | "year" } | { kind: "topup"; interval?: undefined };

/** The payment provider. `checkout` returns the URL to send the user to; `portalUrl` is where they manage billing, or null for the local /billing page. */
export interface Billing {
  name: "demo" | "lemonsqueezy";
  checkout(userId: string, email: string | undefined, item: Item): Promise<string>;
  portalUrl(providerSubscriptionId: string | null): Promise<string | null>;
}

/** The active `pricing` row, or null if missing or invalid. Server side (admin client), so webhooks and checkout agree on prices. */
export async function loadPricingServer(): Promise<Pricing | null> {
  const { data, error } = await supabaseAdmin().from("pricing").select("*").eq("active", true).maybeSingle();
  return error ? null : parsePricing(data);
}

function secret(): string {
  const s = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!s) throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is not set (see apps/studio/.env.example).");
  return s;
}

/** Lemon Squeezy when a real key is set; the local demo adapter for "demo" (production refuses it unless FLOWCAM_ALLOW_DEMO_BILLING=1). */
export function billing(): Billing {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key || key === "demo") {
    if (process.env.NODE_ENV === "production" && process.env.FLOWCAM_ALLOW_DEMO_BILLING !== "1") {
      throw new Error("LEMONSQUEEZY_API_KEY is not set. Set it, or FLOWCAM_ALLOW_DEMO_BILLING=1 to allow fake payments in production.");
    }
    return demoBilling;
  }
  return lemonSqueezy(key);
}

export const billingProvider = (): "demo" | "lemonsqueezy" => (!process.env.LEMONSQUEEZY_API_KEY || process.env.LEMONSQUEEZY_API_KEY === "demo" ? "demo" : "lemonsqueezy");

// ---- Demo: a local checkout page whose "Pay" sends the same signed event a real provider would.

export interface DemoSession { uid: string; kind: Item["kind"]; interval?: "month" | "year"; exp: number }

export function makeDemoSession(s: Omit<DemoSession, "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + 30 * 60_000 })).toString("base64url");
  return `${body}.${sign(body, secret())}`;
}

export function readDemoSession(token: string | null | undefined): DemoSession | null {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !verifySignature(body, sig ?? null, process.env.LEMONSQUEEZY_WEBHOOK_SECRET)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as DemoSession;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

const demoBilling: Billing = {
  name: "demo",
  async checkout(userId, _email, item) {
    return `/billing/demo-checkout?session=${makeDemoSession({ uid: userId, kind: item.kind, interval: item.interval })}`;
  },
  async portalUrl() {
    return null;
  },
};

// ---- Lemon Squeezy REST API (https://docs.lemonsqueezy.com/api), plain fetch.

const LS = "https://api.lemonsqueezy.com/v1";

function variantFor(item: Item, founding: boolean): string {
  const name = item.kind === "topup" ? "TOPUP" : item.kind === "trial" ? "TRIAL" : `${founding ? "FOUNDING" : "PRO"}_${item.interval === "year" ? "YEARLY" : "MONTHLY"}`;
  const v = process.env[`LEMONSQUEEZY_VARIANT_${name}`];
  if (!v) throw new Error(`LEMONSQUEEZY_VARIANT_${name} is not set (see apps/studio/.env.example).`);
  return v;
}

function lemonSqueezy(key: string): Billing {
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" };
  return {
    name: "lemonsqueezy",
    async checkout(userId, email, item) {
      const pricing = await loadPricingServer();
      if (!pricing) throw new Error("Pricing is not available.");
      const store = process.env.LEMONSQUEEZY_STORE_ID;
      if (!store) throw new Error("LEMONSQUEEZY_STORE_ID is not set (see apps/studio/.env.example).");
      const res = await fetch(`${LS}/checkouts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "checkouts",
            attributes: { checkout_data: { email, custom: { user_id: userId, kind: item.kind, interval: item.interval ?? "" } } },
            relationships: { store: { data: { type: "stores", id: store } }, variant: { data: { type: "variants", id: variantFor(item, foundingOpen(pricing)) } } },
          },
        }),
      });
      if (!res.ok) throw new Error(`Lemon Squeezy checkout failed (${res.status}).`);
      const url = ((await res.json()) as { data?: { attributes?: { url?: string } } }).data?.attributes?.url;
      if (!url) throw new Error("Lemon Squeezy returned no checkout URL.");
      return url;
    },
    async portalUrl(subId) {
      if (!subId) return null;
      const res = await fetch(`${LS}/subscriptions/${encodeURIComponent(subId)}`, { headers });
      if (!res.ok) return null;
      const j = (await res.json()) as { data?: { attributes?: { urls?: { customer_portal?: string } } } };
      return j.data?.attributes?.urls?.customer_portal ?? null;
    },
  };
}

// ---- Events the demo adapter sends, shaped like Lemon Squeezy's.

export function demoEvent(name: string, uid: string, opts: { kind?: string; interval?: string; attributes?: Record<string, unknown>; dataId?: string } = {}) {
  return {
    meta: { event_name: name, custom_data: { user_id: uid, kind: opts.kind ?? "", interval: opts.interval ?? "" } },
    data: { id: opts.dataId ?? `demo_${uid}`, attributes: { customer_id: `demo_cus_${uid}`, updated_at: new Date().toISOString(), ...opts.attributes } },
  };
}

/** The event a demo payment produces: the subscription (Trial or Pro) or the Top-up order. */
export function demoPaymentEvent(s: DemoSession) {
  if (s.kind === "topup") return demoEvent("order_created", s.uid, { kind: "topup", dataId: `demo_order_${crypto.randomUUID()}`, attributes: { status: "paid" } });
  const interval = s.interval ?? "month";
  const renews = new Date();
  if (interval === "year") renews.setUTCFullYear(renews.getUTCFullYear() + 1);
  else renews.setUTCMonth(renews.getUTCMonth() + 1);
  return demoEvent("subscription_created", s.uid, { kind: s.kind, interval, attributes: { status: s.kind === "trial" ? "on_trial" : "active", renews_at: renews.toISOString() } });
}
