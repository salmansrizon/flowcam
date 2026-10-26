import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, t: number, query = "") {
  await page.goto(`/dev/renderer?t=${t}${query}`);
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

  // Pixels in a Board-space region that differ from the page's background colour.
  const inkIn = (page: Page, x: number, y: number, w: number, h: number) =>
    page.locator("#board").evaluate(
      (c, r) => {
        const ctx = (c as HTMLCanvasElement).getContext("2d")!;
        const bg = ctx.getImageData(2, 2, 1, 1).data;
        const { data } = ctx.getImageData(r[0], r[1], r[2], r[3]);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] !== bg[0] || data[i + 1] !== bg[1] || data[i + 2] !== bg[2]) n++;
        return n;
      },
      [x, y, w, h],
    );

  test("effects scene is deterministic across page loads and not blank", async ({ page }) => {
    await open(page, 4200, "&scene=effects");
    const first = await dataUrl(page);
    await open(page, 4200, "&scene=effects");
    expect(await dataUrl(page)).toBe(first);
    expect(await inkIn(page, 0, 0, 1920, 1080)).toBeGreaterThan(5000);
  });

  test("draw-on is partly drawn at mid-time and complete after 800 ms", async ({ page }) => {
    // The draw-on rectangle spans x 120..520, y 480..700 and is revealed at 1000 ms (before the 2000 ms morph).
    const count = async (t: number) => {
      await open(page, t, "&scene=effects");
      return inkIn(page, 100, 460, 440, 260);
    };
    const start = await count(1000);
    const mid = await count(1400);
    const done = await count(1800);
    const later = await count(1900);
    expect(start).toBe(0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(done);
    expect(later).toBe(done);
  });

  test("highlight fades in and morph moves the Element", async ({ page }) => {
    await open(page, 4000, "&scene=effects");
    const none = await dataUrl(page);
    expect(await page.evaluate(() => window.renderAt!(4300))).not.toBe(none);
    await open(page, 1900, "&scene=effects");
    const before = await dataUrl(page);
    expect(await page.evaluate(() => window.renderAt!(2300))).not.toBe(before);
  });

  test("transition scene is deterministic and a mid transition frame differs from both ends", async ({ page }) => {
    for (const kind of ["fade", "slide"]) {
      const q = `&scene=transition&kind=${kind}`;
      await open(page, 500, q);
      const a = await dataUrl(page);
      const mid = await page.evaluate(() => window.renderAt!(1300));
      const b = await page.evaluate(() => window.renderAt!(2000));
      expect(mid).not.toBe(a);
      expect(mid).not.toBe(b);
      expect(a).not.toBe(b);
      await open(page, 1300, q);
      expect(await dataUrl(page)).toBe(mid);
    }
  });

  test("a transition of kind none cuts", async ({ page }) => {
    await open(page, 1300, "&scene=transition&kind=none");
    const cut = await dataUrl(page);
    expect(await page.evaluate(() => window.renderAt!(2000))).toBe(cut);
  });

  test("a theme change changes the background pixel", async ({ page }) => {
    const bgPixel = () => page.locator("#board").evaluate((c) => Array.from((c as HTMLCanvasElement).getContext("2d")!.getImageData(2, 2, 1, 1).data));
    await open(page, 1500, "&scene=effects&theme=paper");
    const paper = await bgPixel();
    await open(page, 1500, "&scene=effects&theme=chalkboard");
    const chalk = await bgPixel();
    expect(paper).toEqual([255, 255, 255, 255]);
    expect(chalk).toEqual([0x1f, 0x3a, 0x2e, 255]);
  });
});
