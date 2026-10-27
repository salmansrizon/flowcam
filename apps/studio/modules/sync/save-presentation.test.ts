import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the shared dev database (save_presentation, migration 20261027000300). Needs the secret key to make users.
const envFile = new URL("../../.env.local", import.meta.url).pathname;
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!secret) console.warn("SKIPPED save_presentation tests: SUPABASE_SECRET_KEY is not set.");

describe.skipIf(!secret || !url || !publishable)("save_presentation", () => {
  const admin = createClient(url!, secret!, { auth: { persistSession: false } });
  const created: string[] = [];
  const doc = (title: string) => ({ version: 1, title, boards: [] });

  async function user(pro: boolean): Promise<SupabaseClient> {
    const email = `e2e+${crypto.randomUUID()}@flowcam.test`;
    const password = crypto.randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    created.push(data.user.id);
    if (pro) {
      const end = new Date(Date.now() + 30 * 864e5).toISOString();
      const up = await admin.from("subscriptions").upsert({ user_id: data.user.id, plan: "pro", status: "active", current_period_end: end });
      if (up.error) throw up.error;
    }
    const sb = createClient(url!, publishable!, { auth: { persistSession: false } });
    const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    return sb;
  }

  const save = (sb: SupabaseClient, id: string, base: number, title: string) =>
    sb.rpc("save_presentation", { p_id: id, p_base_version: base, p_data: doc(title) });

  let pro: SupabaseClient;
  let other: SupabaseClient;
  let free: SupabaseClient;
  beforeAll(async () => {
    [pro, other, free] = await Promise.all([user(true), user(true), user(false)]);
  }, 60_000);
  afterAll(async () => {
    await Promise.all(created.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it("creates, updates with the right version, and refuses a stale version", async () => {
    const id = crypto.randomUUID();
    expect((await save(pro, id, 0, "one")).data).toEqual({ status: "saved", version: 1 });
    expect((await save(pro, id, 1, "two")).data).toEqual({ status: "saved", version: 2 });
    const stale = await save(pro, id, 1, "stale");
    expect(stale.error).toBeNull();
    expect(stale.data).toEqual({ status: "conflict", version: 2 });
    expect((await save(pro, id, 0, "again")).data).toEqual({ status: "conflict", version: 2 });
    const row = await pro.from("presentations").select("version,data").eq("id", id).single();
    expect(row.data).toMatchObject({ version: 2, data: { title: "two" } });
  });

  it("refuses another user and leaves the row untouched", async () => {
    const id = crypto.randomUUID();
    await save(pro, id, 0, "mine");
    for (const base of [0, 1]) {
      const res = await save(other, id, base, "theirs");
      expect(res.error?.message).toContain("not_found_or_not_owner");
    }
    expect((await pro.from("presentations").select("data").eq("id", id).single()).data).toMatchObject({ data: { title: "mine" } });
  });

  it("refuses a Free user", async () => {
    const res = await save(free, crypto.randomUUID(), 0, "free");
    expect(res.error?.message).toContain("pro_required");
  });
});
