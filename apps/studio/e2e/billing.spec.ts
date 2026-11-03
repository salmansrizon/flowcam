import { expect, test } from "@playwright/test";
import { signedInPage } from "./auth";

// Billing end to end with the demo adapter (LEMONSQUEEZY_API_KEY=demo): checkout page, signed webhook, plan and Credits.
// Needs the secret key to create a user, so CI without secrets skips it.
test.skip(!process.env.SUPABASE_SECRET_KEY, "SKIPPED: SUPABASE_SECRET_KEY is not set, so test users cannot be created.");

test("Start Trial gives Trial with 200 Credits, a Top-up adds 1,000, and cancelling keeps the plan", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("flowcam.onboarding", "done"));
  const { cleanup } = await signedInPage(page);
  try {
    const balance = async () => ((await (await page.request.get("/api/credits")).json()) as { balance: number }).balance;

    // Upgrade panel -> Start Trial -> demo checkout -> Pay.
    await page.goto("/");
    await page.getByRole("button", { name: "Share" }).click();
    await page.getByRole("dialog", { name: /Share/ }).getByRole("button", { name: "Start Trial" }).click();
    await expect(page).toHaveURL(/\/billing\/demo-checkout\?session=/);
    await expect(page.getByTestId("item")).toContainText("7-day Trial");
    await page.waitForLoadState("networkidle"); // hydrated: an early click would do nothing
    await page.getByRole("button", { name: "Pay (demo)" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByTestId("plan")).toHaveText("Trial");
    await expect(page.getByRole("link", { name: /200 Credits/ })).toBeVisible();
    expect(await balance()).toBe(200);
    await page.keyboard.press("Escape");

    // The Trial is once only.
    expect((await page.request.post("/api/billing/checkout", { data: { kind: "trial", interval: "month" } })).status()).toBe(409);

    // A Top-up from /credits.
    await page.goto("/credits");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Top up/ }).click();
    await expect(page.getByTestId("item")).toContainText("1000 Credits");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Pay (demo)" }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByTestId("balance")).toHaveText("1200");

    // A webhook with a bad signature is refused and changes nothing.
    expect((await page.request.post("/api/billing/webhook", { data: "{}", headers: { "X-Signature": "bad" } })).status()).toBe(401);
    expect(await balance()).toBe(1200);

    // Cancel from /billing keeps the plan and shows the date.
    await page.goto("/billing");
    await expect(page.getByTestId("billing-plan")).toHaveText("Trial");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Cancel subscription" }).click();
    await expect(page.getByText(/^Cancels on /)).toBeVisible();
    await expect(page.getByTestId("billing-plan")).toHaveText("Trial");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByTestId("plan-note")).toContainText("Cancels on");
  } finally {
    await cleanup();
  }
});

test("the checkout API needs a signed-in user", async ({ request }) => {
  expect((await request.post("/api/billing/checkout", { data: { kind: "topup" } })).status()).toBe(401);
});
