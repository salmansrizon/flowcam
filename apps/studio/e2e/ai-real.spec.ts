import { expect, test } from "@playwright/test";
import { signedInPage } from "./auth";

// The AI features end to end against the real routes, queue, worker and Credit Ledger, with the demo provider
// (OPENROUTER_API_KEY=demo). Needs the secret key to create a user, so CI without secrets skips it.
test.skip(!process.env.SUPABASE_SECRET_KEY, "SKIPPED: SUPABASE_SECRET_KEY is not set, so test users cannot be created.");

test("a signed-in user generates a Presentation from a topic and pays its Credits", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("flowcam.onboarding", "done"));
  const { cleanup } = await signedInPage(page);
  try {
    // The 50 sign-up Credits, as the account menu would grant them.
    expect((await page.request.post("/api/credits/grant-signup")).ok()).toBe(true);
    const before = (await (await page.request.get("/api/credits")).json()).balance as number;
    expect(before).toBe(50);

    await page.goto("/library");
    await page.getByRole("button", { name: "New" }).click();
    await page.getByRole("menuitem", { name: "Generate from a topic…" }).click();
    const dialog = page.getByRole("dialog", { name: "Generate from a topic" });
    await dialog.getByLabel("Topic").fill("How volcanoes erupt");
    await dialog.getByRole("button", { name: /^Generate/ }).click();

    // The demo provider titles the Presentation from the topic; Standard costs 5 Credits (ai_job_config).
    await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
    await expect(page.getByLabel("Presentation title")).toHaveValue(/volcanoes/i);
    await expect.poll(async () => (await (await page.request.get("/api/credits")).json()).balance, { timeout: 30_000 }).toBe(before - 5);
  } finally {
    await cleanup();
  }
});
