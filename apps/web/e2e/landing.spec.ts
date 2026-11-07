import { expect, test } from "@playwright/test";

const studio = new RegExp(`^http://localhost:${Number(process.env.PORT ?? 3000)}/?$`);

test("the landing sends visitors to the free Studio and Pro to the waitlist", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const hero = page.locator("#top");
  await expect(hero.getByRole("link", { name: "Try Flowcam free" })).toHaveAttribute("href", studio);
  await expect(page.getByRole("banner").getByRole("link", { name: "Try Flowcam free" })).toHaveAttribute("href", studio);
  await expect(hero.locator("video")).toHaveAttribute("src", "/product/hero.mp4");
  // The real-UI screenshots load.
  for (const img of await page.locator('img[src*="product"]').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  await hero.getByRole("link", { name: "Get notified for Pro" }).click();
  await expect(page).toHaveURL(/\/waitlist$/);
  expect(errors).toEqual([]);
});

test("the three.js scene starts behind the hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("boards-scene")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
  await expect(page.getByTestId("boards-scene").locator("canvas")).toHaveCount(1);
});
