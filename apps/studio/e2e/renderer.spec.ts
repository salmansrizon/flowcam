import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, t: number) {
  await page.goto(`/dev/renderer?t=${t}`);
  await page.locator("#board[data-ready=true]").waitFor();
}
const dataUrl = (page: Page) => page.locator("#board").evaluate((c) => (c as HTMLCanvasElement).toDataURL());

test.describe("renderer golden frames", () => {
  let errors: string[];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test("same Board, view and time draw identical pixels, across redraws and page loads", async ({ page }) => {
    await open(page, 1500);
    const first = await dataUrl(page);
    expect(await page.evaluate(() => window.renderAt!(1500))).toBe(first);
    await open(page, 1500);
    expect(await dataUrl(page)).toBe(first);
  });

  test("a different time draws a different image while Flow is on", async ({ page }) => {
    await open(page, 1500);
    const a = await dataUrl(page);
    await open(page, 2300);
    expect(await dataUrl(page)).not.toBe(a);
  });

  test("the frame is not blank", async ({ page }) => {
    await open(page, 1500);
    const nonWhite = await page.locator("#board").evaluate((c) => {
      const { data } = (c as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1920, 1080);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) n++;
      return n;
    });
    expect(nonWhite).toBeGreaterThan(1000);
  });
});
