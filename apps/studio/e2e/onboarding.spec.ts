import { expect, test, type Page } from "@playwright/test";

const title = (page: Page) => page.getByLabel("Presentation title");
const steps = (page: Page) => page.getByRole("complementary", { name: "Steps" }).getByRole("listitem");

test("a fresh browser lands in a sample Presentation whose call to action opens /record", async ({ page }) => {
  await page.goto("/");
  await expect(title(page)).toHaveValue(/Welcome to Flowcam/);
  await expect(steps(page).first()).toBeVisible();
  await page.getByRole("link", { name: "Try presenting" }).click();
  await expect(page).toHaveURL(/\/record$/);
});

test("Start from appears after dismissal, Blank gives an empty Board, and it is not shown again", async ({ page }) => {
  await page.goto("/");
  await expect(title(page)).toHaveValue(/Welcome to Flowcam/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Dismiss" }).click();

  const dialog = page.getByRole("dialog", { name: "Start from" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Generate from a topic/ })).toBeEnabled();
  await expect(dialog).toContainText("Uses AI Credits");
  await dialog.getByRole("button", { name: "Blank" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(title(page)).toHaveValue("Untitled");
  await expect(steps(page)).toHaveCount(0);

  await page.reload();
  await expect(title(page)).toHaveValue("Untitled");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Try presenting" })).toHaveCount(0);
});

test("leaving through Try presenting offers Start from on return, and a Template can be picked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try presenting" }).click();
  await expect(page).toHaveURL(/\/record$/);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Start from" });
  await dialog.getByRole("button", { name: "Template" }).click();
  await dialog.getByRole("button", { name: "How Browsers Work" }).click();
  await expect(title(page)).toHaveValue("How Browsers Work");
  await expect(steps(page).first()).toBeVisible();
});

test("a returning user who already has a Presentation sees no onboarding", async ({ page }) => {
  await page.goto("/");
  await expect(title(page)).toHaveValue(/Welcome to Flowcam/);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Blank" }).click();
  await title(page).fill("Mine");
  // Forget the onboarding flag, as if this were an older browser profile that has Presentations.
  await page.reload(); // proves "Mine" was saved
  await expect(title(page)).toHaveValue("Mine");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(title(page)).toHaveValue("Mine");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Try presenting" })).toHaveCount(0);
});

test("Share opens the upgrade panel with prices from the config", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Share" }).click();
  const panel = page.getByRole("dialog", { name: /Share/ });
  await expect(panel).toContainText("$17/month");
  await expect(panel).toContainText("$20/month");
  await expect(panel).toContainText("7-day Trial");
  await expect(panel).toContainText("200 Credits");
  await expect(panel.getByRole("button", { name: "Start Trial" })).toBeEnabled();
});

for (const [name, body] of [["invalid", { currency: "usd", list_monthly_cents: -1 }], ["missing", null]] as const) {
  test(`the panel shows no numbers when the pricing config is ${name}`, async ({ page }) => {
    await page.route("**/rest/v1/pricing*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
    await page.goto("/");
    await page.getByRole("button", { name: "Share" }).click();
    const panel = page.getByRole("dialog", { name: /Share/ });
    await expect(panel).toContainText("Pricing is not available right now");
    await expect(panel).not.toContainText("$");
  });
}
