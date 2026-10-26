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

/** Seconds of video the Clips' logs say were recorded. */
const recordedSeconds = (page: Page, recordingId: string) =>
  page.evaluate(async (id) => {
    const rec = await (await navigator.storage.getDirectory()).getDirectoryHandle("recordings").then((d) => d.getDirectoryHandle(id));
    const read = async (dir: FileSystemDirectoryHandle, name: string) => JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text());
    const { clips } = await read(rec, "recording.json");
    const clipsDir = await rec.getDirectoryHandle("clips");
    let ms = 0;
    for (const c of clips) ms += (await read(await clipsDir.getDirectoryHandle(c), "log.json")).durationMs;
    return ms / 1000;
  }, recordingId);

async function exportAndCheck(page: Page, recordingId: string, minSeconds: number) {
  expect(await recordedSeconds(page, recordingId)).toBeGreaterThanOrEqual(minSeconds);
  // Stop leads to Review, which trims dead air by default: the MP4 is as long as the edited timeline.
  await page.getByRole("link", { name: "Review and export" }).click();
  await expect(page.getByText(/s of silence found/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  const expectedSeconds = Number(await page.getByTestId("edited-duration").textContent());
  expect(expectedSeconds).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
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
  expect(Math.abs(meta.duration - expectedSeconds)).toBeLessThan(0.2);
}

test.beforeEach(async ({ page }) => {
  // Captions are on by default; an empty stub Transcript keeps Whisper's model download out of these tests.
  await page.addInitScript(() => {
    window.flowcamTranscribe = async () => ({ version: 1, clips: {} });
  });
});

test("a three-Clip Recording exports a playable 1080p MP4, and exporting twice gives identical frames", async ({ page }) => {
  test.setTimeout(180_000);
  const recordingId = await record(page, 3, 1500);
  await exportAndCheck(page, recordingId, 4.5);

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
  const recordingId = await record(page, 3, 20_000);
  await exportAndCheck(page, recordingId, 60);
});

test("Board Images appear in the exported video", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/record");
  // A Presentation whose only Element is a red Image, stored the way Authoring stores it.
  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(64, 64);
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#ff0000";
    c.fillRect(0, 0, 64, 64);
    const bytes = await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
    const id = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    const root = await navigator.storage.getDirectory();
    const write = async (dir: FileSystemDirectoryHandle, name: string, data: BufferSource | string) => {
      const out = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await out.write(data);
      await out.close();
    };
    await write(await root.getDirectoryHandle("assets", { create: true }), id, bytes);
    const image = {
      id: "img", type: "image", x: 300, y: 200, width: 800, height: 500, strokeColor: "#171717", fillStyle: "none",
      strokeWidth: 2, strokeStyle: "solid", roughness: 0.85, fontFamily: "hand", fontSize: 28, text: "", seed: 1, imageId: id,
    };
    const presentation = { version: 1, id: "p-img", title: "Image", themeId: "paper", boards: [{ id: "b-img", elements: [image], steps: [] }] };
    await write(root, "presentation.json", JSON.stringify(presentation));
  });
  await page.reload();
  await page.getByRole("button", { name: "Start" }).click();
  await phase(page, "recording");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop" }).click();
  await phase(page, "done");

  await page.getByRole("link", { name: "Review and export" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export MP4" }).click();
  const video = page.getByLabel("Exported video");
  await expect(video).toBeVisible({ timeout: 120_000 });
  const red = await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 2) await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
    v.currentTime = v.duration / 2;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    const c = new OffscreenCanvas(v.videoWidth, v.videoHeight).getContext("2d")!;
    c.drawImage(v, 0, 0);
    const { data } = c.getImageData(0, 0, v.videoWidth, v.videoHeight);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) n++;
    return n;
  });
  // Without the Image the frame has no strong red: the Board is white and the fake camera is green.
  expect(red).toBeGreaterThan(50_000);
});
