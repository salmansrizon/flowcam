import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

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

describe.skipIf(!key || !url)("credits against the dev database (skipped: SUPABASE_SECRET_KEY not set)", () => {
  const db = createClient(url ?? "http://localhost", key ?? "x", { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];

  async function user(confirmed = true) {
    const { data, error } = await db.auth.admin.createUser({
      email: `e2e+${crypto.randomUUID().slice(0, 12)}@flowcam.test`,
      password: crypto.randomUUID(),
      email_confirm: confirmed,
    });
    if (error) throw error;
    created.push(data.user.id);
    return data.user.id;
  }
  async function call<T = unknown>(fn: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  const balance = (uid: string) => call<number>("credit_balance", { uid });
  const lines = async (uid: string) => (await db.from("credit_ledger").select("*").eq("user_id", uid).order("id")).data!;
  const makePro = async (uid: string) => {
    const { error } = await db.from("subscriptions").insert({ user_id: uid, plan: "pro", status: "active", current_period_end: new Date(Date.now() + 864e5 * 30).toISOString() });
    if (error) throw error;
  };

  afterAll(async () => {
    // Users with ledger lines cannot be deleted: the append-only trigger also blocks the ON DELETE CASCADE (B0 issue).
    // ponytail: such throwaway e2e+ users leak until the trigger lets cascades through.
    for (const id of created) await db.auth.admin.deleteUser(id);
  });

  it("grants sign-up Credits once", async () => {
    const uid = await user();
    expect(await call("grant_signup_credits", { uid })).toBe(50);
    expect(await call("grant_signup_credits", { uid })).toBe(0);
    expect(await balance(uid)).toBe(50);
    expect((await lines(uid)).filter((l) => l.bucket === "signup")).toHaveLength(1);
  });

  it("does not grant sign-up Credits to an unconfirmed email", async () => {
    const uid = await user(false);
    expect(await call("grant_signup_credits", { uid })).toBe(0);
    expect(await balance(uid)).toBe(0);
  });

  it("grants trial Credits once", async () => {
    const uid = await user();
    expect(await call("grant_trial_credits", { uid })).toBe(200);
    expect(await call("grant_trial_credits", { uid })).toBe(0);
    expect(await balance(uid)).toBe(200);
  });

  it("grants monthly Credits only to Pro, once per period, and expires earlier ones", async () => {
    const uid = await user();
    const jan = "2026-01-01T00:00:00Z";
    const feb = "2026-02-01T00:00:00Z";
    expect(await call("grant_monthly_credits", { uid, period_start: jan })).toBe(0);
    await makePro(uid);
    expect(await call("grant_monthly_credits", { uid, period_start: jan })).toBe(1000);
    expect(await call("grant_monthly_credits", { uid, period_start: jan })).toBe(0);
    const hold = await call<number>("place_hold", { uid, amount: 300 });
    await call("charge_hold", { hold_id: hold });
    expect(await balance(uid)).toBe(700);
    expect(await call("grant_monthly_credits", { uid, period_start: feb })).toBe(1000);
    expect(await balance(uid)).toBe(1000);
    expect((await lines(uid)).filter((l) => l.kind === "expiry").map((l) => l.amount)).toEqual([-700]);
  });

  it("round-trips a Hold through charge, and through release back to the same buckets", async () => {
    const uid = await user();
    await call("grant_signup_credits", { uid });
    const h1 = await call<number>("place_hold", { uid, amount: 20 });
    expect(await balance(uid)).toBe(30);
    await call("charge_hold", { hold_id: h1 });
    expect(await balance(uid)).toBe(30);
    await expect(call("charge_hold", { hold_id: h1 })).rejects.toThrow(/already settled/);
    await expect(call("release_hold", { hold_id: h1 })).rejects.toThrow(/already settled/);

    const h2 = await call<number>("place_hold", { uid, amount: 10 });
    expect(await balance(uid)).toBe(20);
    await call("release_hold", { hold_id: h2 });
    expect(await balance(uid)).toBe(30);
    await expect(call("release_hold", { hold_id: h2 })).rejects.toThrow(/already settled/);
    await expect(call("place_hold", { uid, amount: 31 })).rejects.toThrow(/insufficient_credits/);
  });

  it("spends monthly, then sign-up and trial, then bonus, then top-up, and release restores each bucket", async () => {
    const uid = await user();
    await makePro(uid);
    await call("grant_monthly_credits", { uid, period_start: "2026-03-01T00:00:00Z" }); // 1000
    await call("grant_signup_credits", { uid }); // 50
    await db.from("credit_ledger").insert([
      { user_id: uid, kind: "grant", bucket: "bonus", amount: 30 },
      { user_id: uid, kind: "grant", bucket: "topup", amount: 100 },
    ]);
    const perBucket = async () => {
      const out: Record<string, number> = {};
      for (const l of await lines(uid)) out[l.bucket] = (out[l.bucket] ?? 0) + l.amount;
      return out;
    };
    const before = await perBucket();
    const hold = await call<number>("place_hold", { uid, amount: 1060 });
    expect(await perBucket()).toEqual({ monthly: 0, signup: 0, bonus: 20, topup: 100 });
    await call("release_hold", { hold_id: hold });
    expect(await perBucket()).toEqual(before);
    const h2 = await call<number>("place_hold", { uid, amount: 1180 });
    expect(await perBucket()).toEqual({ monthly: 0, signup: 0, bonus: 0, topup: 0 });
    await call("release_hold", { hold_id: h2 });
  });

  it("serialises concurrent Holds: never negative, successes fit the balance", async () => {
    const uid = await user();
    await call("grant_signup_credits", { uid }); // 50
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => call<number>("place_hold", { uid, amount: 12 })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(4); // 4 x 12 = 48 <= 50 < 5 x 12
    expect(await balance(uid)).toBe(50 - ok * 12);
    expect(await balance(uid)).toBeGreaterThanOrEqual(0);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason)).toMatch(/insufficient_credits/);
  });

  it("cannot be called by a signed-in client", async () => {
    const anon = createClient(url!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error } = await anon.rpc("grant_trial_credits", { uid: crypto.randomUUID() });
    expect(error).not.toBeNull();
  });
});
