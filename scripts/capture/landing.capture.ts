import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Drives the real Studio through the sample Presentation in the Board-only Layout and saves what the landing shows:
// a hero loop (MP4 + poster) and screenshots of the editor, Presenter View, Review, Timeline and Export.
const OUT = resolve(__dirname, "../../apps/web/public/product");
const TMP = resolve(__dirname, "../../test-results/capture-video");
const SIZE = { width: 1280, height: 720 };
const STEP_MS = 1400;

const phase = (page: Page, name: string) => expect(page.locator(`main[data-phase="${name}"]`)).toBeVisible({ timeout: 20_000 });
const jpg = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.jpg`), type: "jpeg", quality: 85 });

/** First visit: the Studio makes its sample Presentation; every Step then uses the Board-only Layout. */
async function sample(page: Page) {
  await page.addInitScript(() => {
    // Hide the Next.js dev badge.
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(s);
    });
    window.flowcamTranscribe = async (clips) => ({
      version: 1,
      clips: Object.fromEntries(clips.map((c) => [c.clipId, [{ start: 0, end: Math.min(2500, c.durationMs), text: "First the browser asks DNS for the address" }]])),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Try presenting" })).toBeVisible({ timeout: 30_000 });
  // The sample is saved shortly after it shows.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.storage.getDirectory()).getFileHandle("current.json").then(() => true, () => false)), { timeout: 15_000 })
    .toBe(true);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const { id } = JSON.parse(await (await (await root.getFileHandle("current.json")).getFile()).text());
    const dir = await root.getDirectoryHandle("presentations");
    const file = await dir.getFileHandle(`${id}.json`);
    const p = JSON.parse(await (await file.getFile()).text());
    p.boards[0].steps[0].layout = "board-only";
    const out = await file.createWritable();
    await out.write(JSON.stringify(p));
    await out.close();
    localStorage.setItem("flowcam.onboarding", "done");
  });
  await page.reload();
}

/** Presents every Step of the sample, then stops. Returns the Recording id; `mark` hears when the first Step shows and before Stop. */
async function present(page: Page, mark?: (at: "first-step" | "stop") => void): Promise<string> {
  await page.goto("/record");
  await page.getByRole("button", { name: "Start" }).click();
  await phase(page, "recording");
  const steps = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const { id } = JSON.parse(await (await (await root.getFileHandle("current.json")).getFile()).text());
    const p = JSON.parse(await (await (await (await root.getDirectoryHandle("presentations")).getFileHandle(`${id}.json`)).getFile()).text());
    return p.boards[0].steps.length as number;
  });
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(i ? STEP_MS : 600);
    await page.keyboard.press("ArrowRight");
    if (i === 0) mark?.("first-step"); // Board only starts here
    if (i === Math.floor(steps / 2) && !mark) await jpg(page, "presenter");
  }
  await page.waitForTimeout(STEP_MS * 1.5);
  mark?.("stop");
  await page.getByRole("button", { name: "Stop" }).click();
  await phase(page, "done");
  return (await page.getByTestId("recording-id").textContent())!;
}

async function screenshots(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await sample(page);
  await expect(page.getByRole("complementary", { name: "Steps" })).toBeVisible();
  await page.waitForTimeout(1000);
  await jpg(page, "editor");
  const id = await present(page);
  // Timeline: Board only from the start on a gradient, with the playhead near the end so the Board is drawn.
  await page.goto(`/review?recording=${id}&edit=1`);
  await expect(page.getByTestId("timeline-part").first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Playhead", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Layout at playhead" }).click();
  await page.getByLabel("Layout", { exact: true }).selectOption("board-only");
  await page.getByRole("button", { name: "Set Layout" }).click();
  await page.getByRole("tab", { name: "Background" }).click();
  await page.getByLabel("Padding").fill("6");
  await page.getByRole("radio", { name: "sunset" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  const nearEnd = async () => String(Math.round(Number(await page.getByTestId("edited-duration").textContent()) * 1000 - 600));
  await page.getByLabel("Playhead", { exact: true }).fill(await nearEnd());
  await page.waitForTimeout(1500);
  await jpg(page, "timeline");
  await page.goto(`/review?recording=${id}`);
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved", { timeout: 30_000 });
  await page.getByLabel("Playhead", { exact: true }).fill(await nearEnd());
  await page.waitForTimeout(1500);
  await jpg(page, "review");
  await page.goto(`/export?recording=${id}`);
  await expect(page.getByRole("button", { name: "Export MP4" })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  // Just the dialog: the page behind it is a blank, dimmed backdrop.
  await page.getByRole("dialog").screenshot({ path: join(OUT, "export.jpg"), type: "jpeg", quality: 90 });
  await context.close();
}

async function heroVideo(browser: Browser) {
  rmSync(TMP, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: TMP, size: SIZE } });
  const page = await context.newPage();
  const t0 = Date.now();
  await sample(page);
  let start = 0;
  let end = 0;
  await present(page, (at) => {
    if (at === "first-step") start = (Date.now() - t0) / 1000;
    else end = (Date.now() - t0) / 1000;
  });
  await context.close(); // finishes the .webm
  const webm = join(TMP, readdirSync(TMP).find((f) => f.endsWith(".webm"))!);
  const ss = String(start + 0.4); // after the Layout change has drawn
  const t = String(end - start - 0.6);
  // H.264 MP4 for every browser; muted loop, so no audio track. The poster is the loop's first frame.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", ss, "-i", webm, "-t", t, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, "hero.mp4")]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(OUT, "hero.mp4"), "-frames:v", "1", "-q:v", "3", join(OUT, "hero-poster.jpg")]);
}

test("capture the Studio for the landing page", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  await screenshots(browser);
  await heroVideo(browser);
});
