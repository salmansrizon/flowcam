import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiProvider } from "./types";

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
delete process.env.OPENROUTER_TEST_MODEL; // These Jobs run on the demo provider, image and voiceover included.

// The app code imports "server-only" and the "@/" alias, which plain Vitest does not know; point it at the real admin client.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
}));

describe.skipIf(!key || !url)("AI Jobs against the dev database (skipped: SUPABASE_SECRET_KEY not set)", () => {
  let db: SupabaseClient;
  let enqueueJob: typeof import("./jobs").enqueueJob;
  let JobError: typeof import("./jobs").JobError;
  let runJob: typeof import("./worker").runJob;
  let demoProvider: AiProvider;
  const created: string[] = [];

  beforeAll(async () => {
    db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    ({ enqueueJob, JobError } = await import("./jobs"));
    ({ runJob } = await import("./worker"));
    ({ demoProvider } = await import("./demo"));
  });
  afterAll(async () => {
    // Ledger lines go with the deleted user (migration 20261027000400).
    for (const id of created) await db.auth.admin.deleteUser(id);
  });

  async function user() {
    const { data, error } = await db.auth.admin.createUser({ email: `e2e+${crypto.randomUUID().slice(0, 12)}@flowcam.test`, password: crypto.randomUUID(), email_confirm: true });
    if (error) throw error;
    created.push(data.user.id);
    const g = await db.rpc("grant_signup_credits", { uid: data.user.id });
    if (g.error) throw new Error(g.error.message);
    return data.user.id;
  }
  const balance = async (uid: string) => (await db.rpc("credit_balance", { uid })).data as number;
  const jobRow = async (id: string) => (await db.from("ai_jobs").select("*").eq("id", id).single()).data!;

  it("runs a script Job with the demo provider and charges the Hold", async () => {
    const uid = await user(); // 50 Credits
    const id = await enqueueJob(uid, { kind: "script", quality: "standard", input: { stepLabels: ["Intro", "Outro"] } });
    expect(await balance(uid)).toBe(49); // Held
    await runJob(id, demoProvider);
    const row = await jobRow(id);
    expect(row).toMatchObject({ status: "succeeded", model: "demo", credits: 1 });
    expect(row.result.scripts).toHaveLength(2);
    expect(await balance(uid)).toBe(49); // Charged: the balance stays down by the price
    const hold = (await db.from("credit_ledger").select("kind").eq("id", row.hold_id).single()).data;
    expect(hold).not.toBeNull();
    await runJob(id, demoProvider); // idempotent
    expect(await balance(uid)).toBe(49);
  });

  it("prices voiceover per started minute and runs a presentation Job", async () => {
    const uid = await user();
    const v = await enqueueJob(uid, { kind: "voiceover", quality: "standard", input: { text: "word ".repeat(200) } }); // 2 minutes x 1
    expect((await jobRow(v)).credits).toBe(2);
    expect(await balance(uid)).toBe(48);
    await runJob(v, demoProvider);
    expect((await jobRow(v)).status).toBe("succeeded");
    const p = await enqueueJob(uid, { kind: "presentation", quality: "standard", input: { topic: "Tides" } });
    await runJob(p, demoProvider);
    expect((await jobRow(p)).status).toBe("succeeded");
    expect(await balance(uid)).toBe(50 - 2 - 5);
  });

  it("releases the Hold when the provider keeps failing, restoring the balance", async () => {
    const uid = await user();
    const id = await enqueueJob(uid, { kind: "script", quality: "standard", input: { stepLabels: ["a"] } });
    expect(await balance(uid)).toBe(49);
    const failing: AiProvider = { name: "demo", run: async () => { throw new Error("forced failure"); } };
    await runJob(id, failing);
    expect(await jobRow(id)).toMatchObject({ status: "failed", error: "forced failure", attempts: 3 });
    expect(await balance(uid)).toBe(50);
    await runJob(id, failing); // idempotent
    expect(await balance(uid)).toBe(50);
  });

  it("refuses with 402 when Credits are insufficient, and queues nothing", async () => {
    const uid = await user();
    await expect(enqueueJob(uid, { kind: "voiceover", quality: "standard", input: { text: "word ".repeat(9000) } })).rejects.toMatchObject({ status: 402 });
    expect(await balance(uid)).toBe(50);
    expect((await db.from("ai_jobs").select("id").eq("user_id", uid)).data).toHaveLength(0);
    expect(JobError).toBeDefined();
  });

  it("limits a Free account to one Job at a time (429)", async () => {
    const uid = await user();
    await enqueueJob(uid, { kind: "script", quality: "standard", input: { stepLabels: ["a"] } });
    await expect(enqueueJob(uid, { kind: "script", quality: "standard", input: { stepLabels: ["a"] } })).rejects.toMatchObject({ status: 429 });
  });
});
