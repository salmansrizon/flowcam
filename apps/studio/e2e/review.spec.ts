import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const phase = (page: Page, name: string) => expect(page.locator(`main[data-phase="${name}"]`)).toBeVisible({ timeout: 15_000 });
const shot = (name: string) => (process.env.FLOWCAM_SCREENSHOTS ? { path: `${process.env.FLOWCAM_SCREENSHOTS}/${name}.png` } : undefined);

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

/** Reads a JSON file beside the Recording in OPFS. */
const readOpfs = (page: Page, recordingId: string, name: string) =>
  page.evaluate(
    async ([id, file]) => {
      const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("recordings")).getDirectoryHandle(id);
      return JSON.parse(await (await (await dir.getFileHandle(file)).getFile()).text());
    },
    [recordingId, name],
  );

const editedSeconds = async (page: Page) => Number(await page.getByTestId("edited-duration").textContent());
const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");

test.beforeEach(async ({ page }) => {
  // Chromium's fake microphone beeps rather than speaks, and Whisper's model is too big for every run:
  // a stub Transcript drives the caption pipeline end to end instead.
  await page.addInitScript(() => {
    window.flowcamTranscribe = async (clips) => ({
      version: 1,
      clips: Object.fromEntries(clips.map((c) => [c.clipId, [{ start: 0, end: Math.min(1500, c.durationMs), text: "Stub caption line" }]])),
    });
  });
});

test("Review trims dead air and captions; Timeline edits persist and export at the edited length", async ({ page }) => {
  test.setTimeout(240_000);
  const recordingId = await record(page, 2, 2500);

  // Review: dead air found, captions made, both on by default.
  await page.getByRole("link", { name: "Review and export" }).click();
  await expect(page.locator('main[data-mode="review"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/s of silence found/)).toBeVisible({ timeout: 30_000 });
  await saved(page);
  const trimDeadAir = page.getByLabel("Trim dead air");
  await expect(trimDeadAir).toBeChecked();
  await expect(page.getByLabel("Show captions")).toBeChecked();
  await expect(page.getByTestId("caption-cues")).toHaveAttribute("data-count", "2");
  expect((await readOpfs(page, recordingId, "transcript.json")).clips).toBeTruthy();
  await page.screenshot(shot("review"));

  // The preview plays the edited Recording.
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => parseFloat((await page.getByTestId("preview-time").textContent())!), { timeout: 10_000 }).toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "Pause" }).click();

  // Dead-air trimming is reversible. The fake microphone may have no silence, so give the first Clip some.
  const edits = await readOpfs(page, recordingId, "edits.json");
  expect(Array.isArray(edits.deadAir)).toBe(true);
  if (edits.deadAir.length === 0) {
    edits.deadAir = [{ clipId: edits.segments[0].clipId, start: 300, end: 1100 }];
    await page.evaluate(
      async ([id, json]) => {
        const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("recordings")).getDirectoryHandle(id);
        const out = await (await dir.getFileHandle("edits.json")).createWritable();
        await out.write(json);
        await out.close();
      },
      [recordingId, JSON.stringify(edits)],
    );
    await page.reload();
    await saved(page);
  }
  const trimmed = await editedSeconds(page);
  await trimDeadAir.uncheck();
  const untrimmed = await editedSeconds(page);
  expect(untrimmed).toBeGreaterThan(trimmed);
  await trimDeadAir.check();
  expect(await editedSeconds(page)).toBe(trimmed);

  // Timeline: Clips in order with their Steps; split, change speed, undo.
  await page.getByRole("link", { name: "Edit on Timeline" }).click();
  await expect(page.locator('main[data-mode="timeline"]')).toBeVisible();
  const parts = page.getByTestId("timeline-part");
  const before = await parts.count();
  expect(before).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("timeline-step")).toHaveCount(2);

  await page.getByLabel("Playhead", { exact: true }).fill("1500");
  await page.getByRole("button", { name: "Split at playhead" }).click();
  await expect(parts).toHaveCount(before + 1);
  await parts.first().click({ position: { x: 4, y: 10 } });
  await page.getByLabel("Speed").selectOption("2");
  const edited = await editedSeconds(page);
  // The first part played 0–1.5 s; at 2x it takes 0.75 s.
  expect(edited).toBeCloseTo(trimmed - 0.75, 1);

  await page.getByLabel("Range start").fill("0");
  await page.getByLabel("Range end").fill("0.5");
  await page.getByRole("button", { name: "Delete range" }).click();
  expect(await editedSeconds(page)).toBeCloseTo(edited - 0.5, 1);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await editedSeconds(page)).toBe(edited);
  // The Layout at playhead tool opens the Layout tab.
  await page.getByRole("button", { name: "Layout at playhead" }).click();
  await page.getByLabel("Layout", { exact: true }).selectOption("side-by-side");
  await page.getByRole("button", { name: "Set Layout" }).click();
  await page.getByRole("tab", { name: "Background" }).click();
  await page.getByLabel("Padding").fill("6");
  await page.getByRole("radio", { name: "sunset" }).click();
  await saved(page);
  await page.screenshot(shot("timeline"));

  // Reload: the edits come back from edits.json.
  await page.reload();
  await expect(page.locator('main[data-mode="timeline"]')).toBeVisible();
  await expect(parts).toHaveCount(before + 1);
  expect(await editedSeconds(page)).toBe(edited);
  await expect(page.getByLabel("Speed")).toHaveValue("2");
  const persisted = await readOpfs(page, recordingId, "edits.json");
  expect(persisted.version).toBe(1);
  expect(persisted.layouts).toHaveLength(1);

  // Export: the MP4 is as long as the edited timeline.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export MP4" }).click();
  const video = page.getByLabel("Exported video");
  await expect(video).toBeVisible({ timeout: 180_000 });
  await page.screenshot(shot("export-dialog"));
  const meta = await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 1) await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    v.currentTime = 0.3;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  });
  if (process.env.FLOWCAM_SCREENSHOTS) {
    // A full-size frame from the MP4, for looking at by eye.
    const png = await video.evaluate((v: HTMLVideoElement) => {
      const c = document.createElement("canvas");
      [c.width, c.height] = [v.videoWidth, v.videoHeight];
      c.getContext("2d")!.drawImage(v, 0, 0);
      return c.toDataURL("image/png").split(",")[1];
    });
    writeFileSync(`${process.env.FLOWCAM_SCREENSHOTS}/exported-frame.png`, Buffer.from(png, "base64"));
  }
  expect(meta.width).toBe(1920);
  expect(meta.height).toBe(1080);
  // The MP4 lasts as long as its longer track: video rounds up to a whole frame (up to 33 ms) and the
  // audio encoder pads its last frame (about 20–50 ms), so a run can land just over 0.1 s.
  expect(Math.abs(meta.duration - edited)).toBeLessThan(0.15);
});

test("the multi-track Timeline: rows, zoom, and a Text track that persists", async ({ page }) => {
  test.setTimeout(90_000);
  const recordingId = await record(page, 1, 2500);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto(`/review?recording=${recordingId}&edit=1`);
  const timeline = page.getByRole("group", { name: "Timeline", exact: true });
  await expect(page.getByTestId("timeline-part").first()).toBeVisible({ timeout: 30_000 });
  for (const label of ["Clips", "Steps", "Captions", "Layout", "Text"]) await expect(timeline.getByText(label, { exact: true })).toBeVisible();
  await saved(page);
  await page.screenshot(shot("timeline-rows"));

  // Zooming in makes the ruler finer.
  const ruler = page.getByTestId("ruler");
  const before = await ruler.textContent();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(ruler).not.toHaveText(before!);
  await expect(page.getByTestId("timeline-zoom")).not.toHaveText("100%");

  // Add text at the playhead, change its text and size; it persists.
  await page.getByRole("button", { name: "Zoom out" }).click({ clickCount: 3 });
  await page.getByLabel("Playhead", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Add text" }).click();
  const block = page.getByTestId("timeline-text");
  await expect(block).toHaveCount(1);
  await expect(block).toHaveAttribute("data-start", "500");
  await page.getByLabel("Text", { exact: true }).fill("Hello there");
  await page.getByLabel("Size", { exact: true }).fill("90");
  await saved(page);
  await page.screenshot(shot("timeline-text"));
  await page.reload();
  await expect(block).toHaveCount(1);
  await block.click({ position: { x: 20, y: 10 } });
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Hello there");
  await expect(page.getByLabel("Size", { exact: true })).toHaveValue("90");
  const stored = (await readOpfs(page, recordingId, "edits.json")).texts[0];
  expect(stored).toMatchObject({ text: "Hello there", size: 90, font: "sans", color: "#ffffff", box: true });

  // Dragging the block moves it in time (it ends at the Clip end, so it can only go earlier); Undo puts it back.
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  const start = Number(await block.getAttribute("data-start"));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await block.getAttribute("data-start"))).toBeLessThan(start);
  await saved(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(block).toHaveAttribute("data-start", String(start));

  // Typing is one Undo step, not one per keystroke.
  await page.waitForTimeout(500);
  await page.getByLabel("Text", { exact: true }).focus();
  await page.keyboard.press("End");
  await page.getByLabel("Text", { exact: true }).pressSequentially(" again", { delay: 30 });
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Hello there again");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Hello there");

  // Delete removes it.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(block).toHaveCount(0);
});

test("the Review in dark mode has the settings tabs", async ({ page }) => {
  test.setTimeout(60_000);
  const recordingId = await record(page, 1, 1000);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/review?recording=${recordingId}`);
  await expect(page.locator("html")).toHaveClass(/dark/);
  for (const name of ["Background", "Camera", "Audio", "Captions", "Layout"]) {
    await expect(page.getByRole("tab", { name })).toBeVisible({ timeout: 30_000 });
  }
  await page.screenshot(shot("review-dark"));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`/review?recording=${recordingId}&edit=1`);
  await expect(page.getByTestId("timeline-part").first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot(shot("timeline-dark"));
});

test("4K export is shown as Pro and cannot be chosen", async ({ page }) => {
  test.setTimeout(60_000);
  const recordingId = await record(page, 1, 1000);
  await page.goto(`/review?recording=${recordingId}`);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("option", { name: "4K (Pro)" })).toHaveJSProperty("disabled", true);
  await expect(page.getByText("Pro", { exact: true })).toBeVisible();
});

// Real on-device Whisper: downloads the model on first run. Run with FLOWCAM_WHISPER=1.
test("Whisper makes a Transcript on the device", async ({ page }) => {
  test.skip(!process.env.FLOWCAM_WHISPER, "downloads the Whisper model; set FLOWCAM_WHISPER=1");
  test.setTimeout(600_000);
  await page.addInitScript(() => delete window.flowcamTranscribe);
  const recordingId = await record(page, 1, 3000);
  await page.goto(`/review?recording=${recordingId}`);
  await expect(page.getByTestId("caption-cues")).toBeVisible({ timeout: 540_000 });
  const transcript = await readOpfs(page, recordingId, "transcript.json");
  expect(transcript.version).toBe(1);
  expect(Object.keys(transcript.clips)).toHaveLength(1);
});
