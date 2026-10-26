import { expect, test, type Page } from "@playwright/test";
import { parseClipLog, type Element, type Presentation } from "@flowcam/domain";

const phase = (page: Page, name: string) => expect(page.locator(`main[data-phase="${name}"]`)).toBeVisible({ timeout: 15_000 });

const box = (id: string, x: number): Element => ({
  id,
  type: "rectangle",
  x,
  y: 200,
  width: 300,
  height: 200,
  strokeColor: "#1e1e1e",
  fillStyle: "none",
  strokeWidth: 3,
  strokeStyle: "solid",
  roughness: 1,
  fontFamily: "hand",
  fontSize: 32,
  text: "",
  seed: 7,
});

const twoBoards: Presentation = {
  version: 1,
  id: "two-boards",
  title: "Two Boards",
  themeId: "paper",
  boards: [
    {
      id: "b1",
      elements: [box("a", 200), box("b", 700)],
      steps: [
        { id: "s1", kind: "reveal", elementIds: ["a"], script: "Welcome to the first Board." },
        { id: "s2", kind: "reveal", elementIds: ["b"] },
      ],
    },
    {
      id: "b2",
      elements: [box("c", 200), box("d", 700)],
      steps: [
        { id: "s3", kind: "reveal", elementIds: ["c"], script: "Now the server answers." },
        { id: "s4", kind: "reveal", elementIds: ["d"], layout: "side-by-side", script: "Side by side now.\nWith a second line." },
      ],
    },
  ],
};

/** RGB of one pixel of the Presenter View's Board canvas, in canvas (Board) units. */
const pixel = (page: Page, x: number, y: number) =>
  page.getByLabel("Board", { exact: true }).evaluate((c: HTMLCanvasElement, [x, y]) => [...c.getContext("2d")!.getImageData(x, y, 1, 1).data.slice(0, 3)], [x, y]);

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

  expect(saved.manifest).toMatchObject({ version: 1, id: recordingId, presentationId: "fixture" });
  // Each Clip's log says which Board it began on, so the Recording names no Board.
  expect(saved.manifest).not.toHaveProperty("boardId");
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

test("moves between Boards with the Teleprompter and the Step's Layout in the Presenter View", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/record");
  await page.evaluate(async (json) => {
    const out = await (await (await navigator.storage.getDirectory()).getFileHandle("presentation.json", { create: true })).createWritable();
    await out.write(json);
    await out.close();
  }, JSON.stringify(twoBoards));
  await page.reload();
  await expect(page.getByText("Presenting “Two Boards”.")).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  await phase(page, "recording");

  // Clip 1: both Steps of Board 1, past its end into Board 2, then into the side-by-side Step.
  const teleprompter = page.getByLabel("Teleprompter");
  const place = (text: string) => expect(page.getByText(text)).toBeVisible();
  await expect(teleprompter).toHaveText("No Script for this Step");
  await page.keyboard.press("ArrowRight");
  await expect(teleprompter).toHaveText("Welcome to the first Board.");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await place("Board 2 of 2 · Step 0 of 2");
  await expect(page.getByText("Next: Now the server answers.")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(teleprompter).toHaveText("Now the server answers.");
  await expect(page.getByText("Next: Side by side now.")).toBeVisible();
  // Camera Bubble Layout: the top-left corner is the white Board.
  await expect.poll(() => pixel(page, 10, 10)).toEqual([255, 255, 255]);
  await page.keyboard.press("ArrowRight");
  // Side by side: the same corner is the Layout's dark background.
  await expect.poll(() => pixel(page, 10, 10)).toEqual([0x16, 0x18, 0x1b]);
  await expect(teleprompter).toContainText("With a second line.");
  if (process.env.FLOWCAM_PRESENTER_SCREENSHOT) await page.screenshot({ path: process.env.FLOWCAM_PRESENTER_SCREENSHOT });
  await page.waitForTimeout(500);
  await page.keyboard.press(" ");
  await phase(page, "paused");

  // Clip 2 begins on Board 2 and goes back to Board 1, whose Steps are still shown.
  await page.keyboard.press(" ");
  await phase(page, "recording");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await place("Board 1 of 2 · Step 2 of 2");
  await expect.poll(() => pixel(page, 10, 10)).toEqual([255, 255, 255]);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Stop" }).click();
  await phase(page, "done");
  const recordingId = (await page.getByTestId("recording-id").textContent())!;

  const raw = await page.evaluate(async (id) => {
    const rec = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("recordings")).getDirectoryHandle(id);
    const read = async (dir: FileSystemDirectoryHandle, name: string) => JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text());
    const manifest = await read(rec, "recording.json");
    const clips = await rec.getDirectoryHandle("clips");
    return { manifest, logs: await Promise.all((manifest.clips as string[]).map(async (c) => read(await clips.getDirectoryHandle(c), "log.json"))) };
  }, recordingId);

  expect(raw.manifest).toMatchObject({ presentationId: "two-boards" });
  const logs = raw.logs.map(parseClipLog);
  const moves = (i: number) => logs[i].events.flatMap((e) => (e.type === "step" || e.type === "board" ? [`${e.type} ${e.index}`] : []));
  expect(logs.map((l) => [l.startBoard, l.startStep])).toEqual([
    [0, 0],
    [1, 2],
  ]);
  expect(moves(0)).toEqual(["step 1", "step 2", "board 1", "step 1", "step 2"]);
  expect(moves(1)).toEqual(["step 1", "step 0", "board 0"]);
});

test("pre-flight shows the key cheat-sheet and follows the system dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/record");
  const sheet = page.getByLabel("Key cheat-sheet");
  await expect(sheet).toBeVisible();
  for (const key of ["→", "←", "I", "Space", "R"]) await expect(sheet.locator("kbd", { hasText: new RegExp(`^${key}$`) })).toBeVisible();
  const [r, g, b] = await page.evaluate(() => {
    const c = document.createElement("canvas").getContext("2d")!;
    c.fillStyle = getComputedStyle(document.body).backgroundColor;
    c.fillRect(0, 0, 1, 1);
    return [...c.getImageData(0, 0, 1, 1).data];
  });
  expect(r + g + b).toBeLessThan(150);
});
