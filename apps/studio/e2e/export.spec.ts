import { expect, test, type Page } from "@playwright/test";

const phase = (page: Page, name: string) => expect(page.locator(`main[data-phase="${name}"]`)).toBeVisible({ timeout: 15_000 });

/** Records Clips of `clipMs` each with one Step per Clip, then stops. Returns the Recording id. */
async function record(page: Page, clips: number, clipMs: number): Promise<string> {
  await page.goto("/record");
  await page.getByRole("button", { name: "Start" }).click();
  for (let i = 0; i < clips; i++) {
    await phase(page, "recording");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(clipMs);
    if (i < clips - 1) {
      await page.keyboard.press(" ");
      await phase(page, "paused");
      await page.keyboard.press(" ");
    }
  }
  await page.getByRole("button", { name: "Stop" }).click();
  await phase(page, "done");
  return (await page.getByTestId("recording-id").textContent())!;
}

async function exportAndCheck(page: Page, expectedSeconds: number) {
  await page.getByRole("link", { name: "Export MP4" }).click();
  await page.getByRole("button", { name: "Export MP4" }).click();
  const video = page.getByLabel("Exported video");
  await expect(video).toBeVisible({ timeout: 600_000 });
  const meta = await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 1) await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 1000));
    v.pause();
    const audioBytes = (v as HTMLVideoElement & { webkitAudioDecodedByteCount: number }).webkitAudioDecodedByteCount;
    v.currentTime = v.duration / 2;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, audioBytes };
  });
  if (process.env.FLOWCAM_SCREENSHOT) await video.screenshot({ path: process.env.FLOWCAM_SCREENSHOT });
  expect(meta.audioBytes).toBeGreaterThan(0);
  expect(meta.width).toBe(1920);
  expect(meta.height).toBe(1080);
  expect(Math.abs(meta.duration - expectedSeconds)).toBeLessThan(1);
}

test("a three-Clip Recording exports a playable 1080p MP4, and exporting twice gives identical frames", async ({ page }) => {
  test.setTimeout(180_000);
  const recordingId = await record(page, 3, 1500);
  await exportAndCheck(page, 4.5);

  const [a, b] = [
    await page.evaluate((id) => window.flowcamExportFrameHashes!(id), recordingId),
    await page.evaluate((id) => window.flowcamExportFrameHashes!(id), recordingId),
  ];
  expect(a.length).toBeGreaterThan(100);
  expect(b).toEqual(a);
  expect(new Set(a).size).toBeGreaterThan(1); // Frames actually change over time.
});

// Milestone 1 acceptance: run with FLOWCAM_ACCEPTANCE=1.
test("a 60-second, three-Clip Recording exports a playable MP4", async ({ page }) => {
  test.skip(!process.env.FLOWCAM_ACCEPTANCE, "slow; set FLOWCAM_ACCEPTANCE=1");
  test.setTimeout(900_000);
  await record(page, 3, 20_000);
  await exportAndCheck(page, 60);
});
