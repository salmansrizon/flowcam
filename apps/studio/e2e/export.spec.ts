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

// Frame and look (#32).
const shots = (name: string) => (process.env.FLOWCAM_SCREENSHOTS ? { path: `${process.env.FLOWCAM_SCREENSHOTS}/${name}.png` } : undefined);

/** Records one short Clip and opens Review with it saved. */
async function recordAndReview(page: Page): Promise<string> {
  const id = await record(page, 1, 1500);
  await page.getByRole("link", { name: "Review and export" }).click();
  await expect(page.getByText(/s of silence found/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  return id;
}

/** Merges `patch` into the stored edits.json of a Recording; "$CLIP" becomes its first Clip's id. */
const patchEdits = (page: Page, id: string, patch: Record<string, unknown>) =>
  page.evaluate(
    async ([rid, p]) => {
      const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("recordings")).getDirectoryHandle(rid as string);
      const file = await dir.getFileHandle("edits.json");
      const edits = JSON.parse(await (await file.getFile()).text());
      const clipId = edits.segments[0].clipId;
      const next = JSON.parse(JSON.stringify({ ...edits, ...(p as object) }).replaceAll("$CLIP", clipId));
      const out = await file.createWritable();
      await out.write(JSON.stringify(next));
      await out.close();
    },
    [id, patch] as const,
  );

/** Exports from the standalone /export page and returns the video, seeked to its middle. */
async function exportVideo(page: Page, id: string) {
  await page.goto(`/export?recording=${id}`);
  await page.getByRole("button", { name: "Export MP4" }).click();
  const video = page.getByLabel("Exported video");
  await expect(video).toBeVisible({ timeout: 120_000 });
  await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 2) await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
    v.currentTime = v.duration / 2;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
  });
  return video;
}

/** Reads the exported video's current frame: RGB at `points`, and how many pixels satisfy the `test` expression of r, g, b. */
const pixels = (video: ReturnType<Page["getByLabel"]>, points: [number, number][], test: string) =>
  video.evaluate(
    (v: HTMLVideoElement, [pts, src]) => {
      const c = new OffscreenCanvas(v.videoWidth, v.videoHeight).getContext("2d")!;
      c.drawImage(v, 0, 0);
      const { data } = c.getImageData(0, 0, v.videoWidth, v.videoHeight);
      const match = new Function("r", "g", "b", `return ${src}`) as (r: number, g: number, b: number) => boolean;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (match(data[i], data[i + 1], data[i + 2])) n++;
      const at = (pts as [number, number][]).map(([x, y]) => Array.from(data.slice((y * v.videoWidth + x) * 4, (y * v.videoWidth + x) * 4 + 3)));
      return { n, at };
    },
    [points, test] as const,
  );

test("a 9:16 export is 1080x1920 with the Camera filling the bottom", async ({ page }) => {
  test.setTimeout(180_000);
  await recordAndReview(page);
  await page.getByRole("radio", { name: "9:16" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  await expect(page.getByLabel("Preview")).toHaveAttribute("width", "720");
  await expect(page.getByLabel("Preview")).toHaveAttribute("height", "1280");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export MP4" }).click();
  const video = page.getByLabel("Exported video");
  await expect(video).toBeVisible({ timeout: 120_000 });
  const size = await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 1) await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    return [v.videoWidth, v.videoHeight];
  });
  expect(size).toEqual([1080, 1920]);
  await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 2) await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
    v.currentTime = v.duration / 2;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
  });
  await video.screenshot(shots("aspect-9x16"));
  // The fake Camera is green and fills the bottom.
  const { at } = await pixels(video, [[540, 1700]], "true");
  expect(at[0][1]).toBeGreaterThan(at[0][0] + 40);
});

test("a text overlay and a custom gradient appear in the export", async ({ page }) => {
  test.setTimeout(180_000);
  const id = await recordAndReview(page);
  await patchEdits(page, id, {
    frame: { background: "slate", padding: 10, shadow: 0, gradient: { from: "#ff0000", to: "#0000ff", angle: 90 } },
    texts: [{ id: "t1", clipId: "$CLIP", start: 0, end: 600_000, text: "HELLO", x: 0.5, y: 0.5, size: 200, font: "sans", color: "#ff00ff", box: true }],
  });
  const video = await exportVideo(page, id);
  await video.screenshot(shots("text-overlay"));
  const { n, at } = await pixels(video, [[4, 540], [1915, 540]], "r > 200 && g < 60 && b > 200");
  expect(n).toBeGreaterThan(3000); // Magenta text; the Camera is green and the Board white.
  expect(at[0][0]).toBeGreaterThan(200); // Left edge: the red end of the gradient.
  expect(at[1][2]).toBeGreaterThan(200); // Right edge: the blue end.
});

test("the gradient editor, colour sliders and presets change the look", async ({ page }) => {
  test.setTimeout(180_000);
  await recordAndReview(page);
  const preview = page.getByLabel("Preview", { exact: true });
  const corner = () => preview.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext("2d")!.getImageData(3, 3, 1, 1).data.slice(0, 3)));
  await page.getByLabel("Padding").fill("10");

  // Gradient editor: the Custom swatch opens it, and the preview canvas follows.
  await page.getByRole("radio", { name: "custom" }).click();
  await page.getByLabel("Gradient from").fill("#00ff00");
  await page.getByLabel("Gradient to").fill("#ff00ff");
  await page.getByLabel("Gradient angle").fill("90");
  await expect(page.getByLabel("Gradient preview")).toBeVisible();
  await expect.poll(async () => (await corner()).map((v) => (v > 200 ? "hi" : v < 30 ? "lo" : "mid")).join()).toBe("lo,hi,lo"); // The green end of the gradient.
  await page.screenshot(shots("gradient-editor"));
  await page.getByRole("radio", { name: "blue" }).click(); // A preset swatch clears the gradient.
  await expect(page.getByLabel("Gradient preview")).toHaveCount(0);

  // Presets: save the blue look, change it, then apply the preset.
  await page.getByRole("button", { name: "Save current look…" }).click();
  await page.getByLabel("Preset name").fill("Blue look");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("radio", { name: "black" }).click();
  await expect.poll(corner).toEqual([0, 0, 0]);
  await page.getByLabel("Presets").selectOption("Blue look");
  await expect(page.getByRole("radio", { name: "blue" })).toHaveAttribute("data-state", "on");
  await expect.poll(corner).toEqual([28, 126, 214]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flowcam.presets")!)[0].name)).toBe("Blue look");
  // The same preset can be applied again after the look changes.
  await page.getByRole("radio", { name: "black" }).click();
  await expect.poll(corner).toEqual([0, 0, 0]);
  await page.getByRole("button", { name: "Apply preset again" }).click();
  await expect.poll(corner).toEqual([28, 126, 214]);
  await page.getByRole("button", { name: "Delete preset" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flowcam.presets")!))).toEqual([]);

  // Colour correction darkens the Camera in the preview.
  await page.getByRole("tab", { name: "layout" }).click();
  await page.getByLabel("Layout", { exact: true }).selectOption("camera-only");
  await page.getByRole("button", { name: "Set Layout" }).click();
  await page.getByRole("tab", { name: "camera" }).click();
  const centre = () => preview.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext("2d")!.getImageData(640, 360, 1, 1).data.slice(0, 3)));
  const sum = (px: number[]) => px.reduce((a, b) => a + b, 0);
  const before = sum(await centre());
  await page.getByLabel("brightness").fill("-80");
  await page.screenshot(shots("colour-sliders"));
  await expect.poll(async () => sum(await centre())).toBeLessThan(before);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("brightness")).toHaveValue("0");
});
