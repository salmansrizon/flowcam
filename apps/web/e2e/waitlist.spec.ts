import { expect, test } from "@playwright/test";

// The web server runs with NEXT_PUBLIC_PRO_LAUNCH_AT=2030-01-01T00:00:00Z; the browser clock moves around it.
const studio = new RegExp(`^http://localhost:${Number(process.env.PORT ?? 3000)}/?$`);

test("counts down to the Pro launch", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2029-12-30T21:58:57Z"));
  await page.goto("/waitlist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pro launches in");
  const timer = page.getByRole("timer", { name: "Time until Pro launches" });
  for (const [unit, v] of [["days", "01"], ["hours", "02"], ["minutes", "01"], ["seconds", "03"]]) await expect(timer.locator(`[data-unit="${unit}"]`)).toHaveText(v);
});

test("at zero it becomes 'Pro is here' with the Trial", async ({ page }) => {
  await page.clock.install({ time: new Date("2029-12-31T23:59:58Z") });
  await page.goto("/waitlist");
  await expect(page.getByRole("timer")).toBeVisible();
  await page.clock.runFor(3000);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pro is here");
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start your 7-day Trial" })).toHaveAttribute("href", studio);
});

test("joins the waitlist from /waitlist, recorded with source 'waitlist'", async ({ page }) => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  test.skip(!url || !key, "SKIPPED: no Supabase secret key, so the row cannot be checked and removed.");
  const email = `e2e+${crypto.randomUUID().slice(0, 12)}@flowcam.test`;
  const headers = { apikey: key!, ...(key!.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }) };
  // Node's fetch, not Playwright's request: Supabase refuses secret keys from a browser User-Agent.
  const rows = (method = "GET") => fetch(`${url}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}&select=source,consent`, { method, headers });
  try {
    await page.goto("/waitlist");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Notify me" }).click();
    await expect(page.getByRole("status")).toContainText("You're on the list");
    expect(await (await rows()).json()).toEqual([{ source: "waitlist", consent: true }]);
  } finally {
    await rows("DELETE");
  }
});

test("the consent links to the privacy page", async ({ page }) => {
  await page.goto("/waitlist");
  await page.getByRole("link", { name: "Privacy" }).first().click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
  await expect(page.getByRole("link", { name: "salmansrizon2016@gmail.com" })).toBeVisible();
});
