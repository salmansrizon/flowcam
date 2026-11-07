import { expect, test } from "@playwright/test";

// Before the Pro launch (browser clock moved before NEXT_PUBLIC_PRO_LAUNCH_AT=2000-01-01): the Free Studio works, while
// sign-in, Trial and AI point to the waitlist. Server-side closing is in proxy.test.ts.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("1999-06-01T00:00:00Z"));
  await page.addInitScript(() => localStorage.setItem("flowcam.onboarding", "done"));
});

test("no sign-in, and AI offers the waitlist instead of running", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "New" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("menuitem", { name: "Generate from a topic…" }).click();
  const dialog = page.getByRole("dialog", { name: "Generate from a topic" });
  await expect(dialog).toContainText("AI arrives with Pro");
  await expect(dialog.getByRole("link", { name: "Get notified" })).toHaveAttribute("href", /\/waitlist$/);
  await expect(dialog.getByRole("button", { name: /^Generate/ })).toHaveCount(0);
});

test("upgrade panels link to the waitlist, not the Trial", async ({ page }) => {
  await page.goto("/export?recording=none");
  await page.getByRole("button", { name: "Share link" }).click();
  const dialog = page.getByRole("dialog", { name: /Share links/ });
  await expect(dialog.getByRole("link", { name: "Get notified" })).toHaveAttribute("href", /\/waitlist$/);
  await expect(dialog.getByRole("button", { name: "Start Trial" })).toHaveCount(0);
});
