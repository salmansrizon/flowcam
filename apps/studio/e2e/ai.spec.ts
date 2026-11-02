import { expect, test } from "@playwright/test";
import { deleteLeftoverTestUsers, signedInPage } from "./auth";

test.skip(!process.env.SUPABASE_SECRET_KEY, "needs SUPABASE_SECRET_KEY");

test("signed-out AI Job requests are refused", async ({ request }) => {
  expect((await request.post("/api/ai/jobs", { data: { kind: "script", quality: "standard", input: { stepLabels: ["a"] } } })).status()).toBe(401);
});

test("a signed-in user runs a script AI Job and polls until it succeeds", async ({ page }) => {
  const { cleanup } = await signedInPage(page);
  try {
    // Sign-up Credits are granted by the app after sign-in; make sure they exist before spending.
    await page.evaluate(() => fetch("/api/credits/grant-signup", { method: "POST" }));
    const post = await page.evaluate(async () => {
      const r = await fetch("/api/ai/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "script", quality: "standard", input: { stepLabels: ["Intro", "Demo", "Wrap up"] } }),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(post.status).toBe(200);
    const id: string = post.body.id;

    await expect
      .poll(async () => (await page.request.get(`/api/ai/jobs/${id}`)).json().then((j) => j.status), { timeout: 30_000 })
      .toBe("succeeded");
    const job = await (await page.request.get(`/api/ai/jobs/${id}`)).json();
    expect(job.result.scripts).toHaveLength(3);
    expect(job.credits).toBe(1);
  } finally {
    await cleanup().catch(() => {}); // Users with ledger lines may not be deletable yet; the sweep below catches them later.
    await deleteLeftoverTestUsers();
  }
});
