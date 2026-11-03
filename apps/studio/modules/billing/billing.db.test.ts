import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { planLabel } from "../account/plan";
import { foundingOpen } from "../onboarding/pricing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Load apps/studio/.env.local without printing it; real environment variables win.
try {
  for (const line of readFileSync(resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // No .env.local: the suite skips below.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
// The demo adapter with a known secret, whatever .env.local says.
process.env.LEMONSQUEEZY_API_KEY = "demo";
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "test-secret";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
}));

describe.skipIf(!key || !url)("Billing webhooks against the dev database (skipped: SUPABASE_SECRET_KEY not set)", () => {
  let db: SupabaseClient;
  let b: typeof import("./billing");
  let w: typeof import("./webhook");
  let sig: typeof import("./signature");
  const created: string[] = [];

  beforeAll(async () => {
    db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    b = await import("./billing");
    w = await import("./webhook");
    sig = await import("./signature");
  });
  afterAll(async () => {
    // Subscriptions, ledger lines and (user_id set null) events go with the deleted user.
    for (const id of created) await db.auth.admin.deleteUser(id);
  });

  async function user() {
    const { data, error } = await db.auth.admin.createUser({ email: `e2e+${crypto.randomUUID().slice(0, 12)}@flowcam.test`, password: crypto.randomUUID(), email_confirm: true });
    if (error) throw error;
    created.push(data.user.id);
    return data.user.id;
  }
  const balance = async (uid: string) => (await db.rpc("credit_balance", { uid })).data as number;
  const sub = async (uid: string) => (await db.from("subscriptions").select("*").eq("user_id", uid).single()).data!;
  // is_pro() reads auth.uid(), so check the same rule on the row.
  const isPro = async (uid: string) => planLabel(await sub(uid)) !== "Free";
  let session = 0; // Each pay is its own checkout session (event ids are stable per session).
  const pay = (uid: string, kind: "trial" | "pro" | "topup", interval: "month" | "year" = "month") => w.deliverDemoEvent(b.demoPaymentEvent({ uid, kind, interval, exp: Date.now() + ++session }));
  const pricing = async () => (await b.loadPricingServer())!;

  it("rejects a bad signature with 401 and records nothing", async () => {
    const uid = await user();
    const raw = JSON.stringify(b.demoPaymentEvent({ uid, kind: "trial", interval: "month", exp: 0 }));
    expect((await w.handleWebhook(raw, sig.sign(raw, "wrong"))).status).toBe(401);
    expect((await w.handleWebhook(raw, null)).status).toBe(401);
    expect((await db.from("subscriptions").select("user_id").eq("user_id", uid)).data).toHaveLength(0);
  });

  it("starts a Trial: plan Trial for trial_days and 200 Credits", async () => {
    const uid = await user();
    const p = await pricing();
    expect((await pay(uid, "trial")).status).toBe(200);
    const s = await sub(uid);
    expect(s).toMatchObject({ plan: "trial", status: "active", provider: "demo", paid_once: false });
    const days = (Date.parse(s.current_period_end) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(p.trialDays - 0.1);
    expect(days).toBeLessThanOrEqual(p.trialDays);
    expect(await isPro(uid)).toBe(true);
    expect(await balance(uid)).toBe(p.trialCredits);
  });

  it("a Pro subscription is paid, monthly Credits granted and Founding set while the window is open", async () => {
    const uid = await user();
    const p = await pricing();
    await pay(uid, "pro", "year");
    expect(await sub(uid)).toMatchObject({ plan: "pro", paid_once: true, billing_interval: "year", founding: foundingOpen(p) });
    expect(await balance(uid)).toBe(p.monthlyCredits);
  });

  it("a Top-up adds topup_credits that stay in the topup bucket", async () => {
    const uid = await user();
    const p = await pricing();
    expect((await pay(uid, "topup")).status).toBe(200);
    expect(await balance(uid)).toBe(p.topupCredits);
    expect((await db.from("credit_ledger").select("bucket").eq("user_id", uid)).data).toEqual([{ bucket: "topup" }]);
  });

  it("a repeated webhook changes nothing", async () => {
    const uid = await user();
    const ev = b.demoPaymentEvent({ uid, kind: "trial", interval: "month", exp: 0 });
    expect((await w.deliverDemoEvent(ev)).body.duplicate).toBeUndefined();
    const before = { s: await sub(uid), bal: await balance(uid), n: (await db.from("billing_events").select("id").eq("user_id", uid)).data!.length };
    const again = await w.deliverDemoEvent(ev);
    expect(again).toMatchObject({ status: 200, body: { duplicate: true } });
    expect(await sub(uid)).toEqual(before.s);
    expect(await balance(uid)).toBe(before.bal);
    expect((await db.from("billing_events").select("id").eq("user_id", uid)).data).toHaveLength(before.n);
  });

  it("cancel keeps Pro until the period ends; expiry ends it", async () => {
    const uid = await user();
    await pay(uid, "pro");
    const end = (await sub(uid)).current_period_end;
    const subId = (await sub(uid)).provider_subscription_id;
    await w.deliverDemoEvent(b.demoEvent("subscription_cancelled", uid, { dataId: subId, attributes: { status: "cancelled", ends_at: end } }));
    expect(await sub(uid)).toMatchObject({ status: "active", cancel_at_period_end: true });
    expect(Date.parse((await sub(uid)).current_period_end)).toBe(Date.parse(end));
    expect(await isPro(uid)).toBe(true);
    await w.deliverDemoEvent(b.demoEvent("subscription_expired", uid, { dataId: subId, attributes: { status: "expired" } }));
    expect(await sub(uid)).toMatchObject({ status: "expired", paid_once: true });
    expect(await isPro(uid)).toBe(false);
  });

  it("replaying one checkout session pays once", async () => {
    const uid = await user();
    const before = await balance(uid);
    const s = { uid, kind: "topup" as const, exp: Date.now() };
    await w.deliverDemoEvent(b.demoPaymentEvent(s));
    expect((await w.deliverDemoEvent(b.demoPaymentEvent(s))).body.duplicate).toBe(true);
    expect(await balance(uid)).toBe(before + (await pricing()).topupCredits);
  });

  it("an older subscription's events never change the current one", async () => {
    const uid = await user();
    await pay(uid, "trial"); // subscription demo_<uid>
    const renews = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await w.deliverDemoEvent(b.demoEvent("subscription_created", uid, { kind: "pro", interval: "month", dataId: `new_${uid}`, attributes: { status: "active", renews_at: renews } }));
    const r = await w.deliverDemoEvent(b.demoEvent("subscription_expired", uid, { dataId: `demo_${uid}`, attributes: { status: "expired" } }));
    expect(r.body.ignored).toBe(true);
    expect(await sub(uid)).toMatchObject({ plan: "pro", status: "active", provider_subscription_id: `new_${uid}` });
    // A second Trial never replaces a subscription.
    await pay(uid, "trial");
    expect((await sub(uid)).plan).toBe("pro");
  });

  it("records an unknown event and answers 200", async () => {
    const uid = await user();
    const r = await w.deliverDemoEvent(b.demoEvent("license_key_created", uid));
    expect(r).toMatchObject({ status: 200, body: { ignored: true } });
    expect((await db.from("billing_events").select("type").eq("user_id", uid)).data).toEqual([{ type: "license_key_created" }]);
  });
});
