import { expect, test } from "@playwright/test";

test("signed-out /credits shows a sign-in prompt", async ({ page }) => {
  await page.goto("/credits");
  await expect(page.getByText("Sign in to see your Credits")).toBeVisible();
  const res = await page.request.get("/api/credits");
  expect(res.status()).toBe(401);
});
