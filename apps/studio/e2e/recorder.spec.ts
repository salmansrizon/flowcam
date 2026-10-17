import { expect, test, type Page } from "@playwright/test";
import { parseClipLog } from "@flowcam/domain";

const phase = (page: Page, name: string) => expect(page.locator(`main[data-phase="${name}"]`)).toBeVisible({ timeout: 15_000 });

test("records three Clips with Steps, Ink and a Retake into OPFS", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/record");

  // Pre-flight, then 3-2-1.
  await expect(page.getByLabel("Camera preview")).toBeVisible();
  await expect(page.getByLabel("Microphone level")).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("3", { exact: true })).toBeVisible();
  await phase(page, "recording");

  // Clip 1: two Steps, one Ink stroke, some pointer moves.
  const board = (await page.getByLabel("Board").boundingBox())!;
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("i");
  await page.mouse.move(board.x + 100, board.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(board.x + 100 + i * 20, board.y + 100 + i * 10);
  await page.mouse.up();
  await page.keyboard.press("i");
  for (let i = 1; i <= 10; i++) await page.mouse.move(board.x + 300 + i * 10, board.y + 200);
  await page.waitForTimeout(1500);
  await page.keyboard.press(" ");
  await phase(page, "paused");

  // Clip 2 starts at Step 2, advances, then is retaken and must resume from Step 2.
  await page.keyboard.press(" ");
  await phase(page, "recording");
  const retakenId = await page.locator("main").getAttribute("data-clip-id");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await page.keyboard.press("r");
  await phase(page, "countdown");
  await phase(page, "recording");
  expect(await page.locator("main").getAttribute("data-clip-id")).not.toBe(retakenId);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(2000);
  await page.keyboard.press(" ");
  await phase(page, "paused");

  // Clip 3 starts at Step 3, goes back one, then Stop.
  await page.keyboard.press(" ");
  await phase(page, "recording");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Stop" }).click();
  await phase(page, "done");
  const recordingId = (await page.getByTestId("recording-id").textContent())!;

  const saved = await page.evaluate(async (id) => {
    const readJson = async (dir: FileSystemDirectoryHandle, name: string) =>
      JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text());
    const root = await navigator.storage.getDirectory();
    const rec = await (await root.getDirectoryHandle("recordings")).getDirectoryHandle(id);
    const manifest = await readJson(rec, "recording.json");
    const clipsDir = await rec.getDirectoryHandle("clips");
    const dirs: string[] = [];
    for await (const [name] of clipsDir as unknown as AsyncIterable<[string, FileSystemHandle]>) dirs.push(name);

    const clips = [];
    for (const clipId of manifest.clips as string[]) {
      const dir = await clipsDir.getDirectoryHandle(clipId);
      const media = await (await dir.getFileHandle("media.mp4")).getFile();
      const video = document.createElement("video");
      video.muted = true;
      video.src = URL.createObjectURL(media);
      await new Promise((ok, fail) => {
        video.onloadedmetadata = ok;
        video.onerror = () => fail(new Error(`${clipId}/media.mp4 does not load: ${video.error?.message}`));
      });
      await video.play();
      await new Promise((r) => setTimeout(r, 400));
      video.pause();
      const counts = video as unknown as { webkitAudioDecodedByteCount: number; webkitVideoDecodedByteCount: number };
      clips.push({
        log: await readJson(dir, "log.json"),
        duration: video.duration,
        videoWidth: video.videoWidth,
        audioBytes: counts.webkitAudioDecodedByteCount,
        videoBytes: counts.webkitVideoDecodedByteCount,
      });
    }
    return { manifest, dirs, clips };
  }, recordingId);

  expect(saved.manifest).toMatchObject({ version: 1, id: recordingId, presentationId: "fixture", boardId: "board_fixture" });
  expect(saved.manifest.clips).toHaveLength(3);
  // The retaken Clip's files are gone: only the three listed Clips are on disk.
  expect(saved.dirs.sort()).toEqual([...saved.manifest.clips].sort());
  expect(saved.dirs).not.toContain(retakenId);

  const logs = saved.clips.map((c) => parseClipLog(c.log));
  expect(logs.map((l) => l.clipId)).toEqual(saved.manifest.clips);
  expect(logs.map((l) => l.startStep)).toEqual([0, 2, 3]);
  expect(logs[0].events.filter((e) => e.type === "step").map((e) => e.type === "step" && e.index)).toEqual([1, 2]);
  expect(logs[0].events.some((e) => e.type === "ink" && e.points.length > 5)).toBe(true);
  expect(logs[0].events.some((e) => e.type === "pointer")).toBe(true);
  expect(logs[1].events.filter((e) => e.type === "step").map((e) => e.type === "step" && e.index)).toEqual([3]);
  expect(logs[2].events.filter((e) => e.type === "step").map((e) => e.type === "step" && e.index)).toEqual([2]);

  for (const [i, clip] of saved.clips.entries()) {
    expect(clip.duration).toBeGreaterThan(0);
    expect(Number.isFinite(clip.duration)).toBe(true);
    // Log and media share a timeline, so their lengths agree closely.
    expect(Math.abs(clip.duration * 1000 - logs[i].durationMs)).toBeLessThan(500);
    expect(clip.videoWidth).toBeGreaterThan(0);
    expect(clip.videoBytes).toBeGreaterThan(0);
    expect(clip.audioBytes).toBeGreaterThan(0);
  }
});

test("a Clip's media reaches disk while it is still recording", async ({ page }) => {
  await page.goto("/record");
  await page.getByRole("button", { name: "Start" }).click();
  await phase(page, "recording");
  const clipId = (await page.locator("main").getAttribute("data-clip-id"))!;
  await page.waitForTimeout(3000);

  // Without stopping, read what is on disk: a crash now would leave these bytes.
  const head = await page.evaluate(async (clipId) => {
    const recordings = await (await navigator.storage.getDirectory()).getDirectoryHandle("recordings");
    for await (const rec of recordings.values()) {
      if (rec.kind !== "directory") continue;
      const clips = await (rec as FileSystemDirectoryHandle).getDirectoryHandle("clips");
      const file = await (await (await clips.getDirectoryHandle(clipId)).getFileHandle("media.mp4")).getFile();
      return { size: file.size, box: new TextDecoder().decode(await file.slice(4, 8).arrayBuffer()) };
    }
    return null;
  }, clipId);
  expect(head?.box).toBe("ftyp");
  expect(head!.size).toBeGreaterThan(10_000);
});
