import { expect, test, type Page } from "@playwright/test";
import { parseClipLog } from "@flowcam/domain";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("flowcam.onboarding", "done");
    window.flowcamTranscribe = async () => ({ version: 1, clips: {} });
  });
});

async function draw(page: Page, tool: string, from: [number, number], to: [number, number]) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const box = (await page.getByLabel("Board", { exact: true }).boundingBox())!;
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 5 });
  await page.mouse.up();
}

test("a voice Narration and a silence become a narrated Recording that reviews and exports", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await draw(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await draw(page, "Ellipse", [0.6, 0.1], [0.8, 0.3]);
  const steps = page.getByRole("complementary", { name: "Steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(2);

  await page.getByRole("tab", { name: "Steps" }).click();
  await steps.nth(0).click();
  await page.getByRole("tab", { name: "Script" }).click();
  await page.getByRole("textbox", { name: "Script" }).fill("Here is the first box.");

  // Building is refused until every Step has a Narration.
  const make = page.getByRole("button", { name: "Make narrated video" });
  await expect(page.getByRole("alert", { name: "Steps without a Narration" })).toContainText("Step 2");
  await expect(make).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("missing.png") });

  await page.getByRole("button", { name: "Record narration" }).click();
  await expect(page.getByRole("dialog", { name: "Recording narration" })).toContainText("Here is the first box.");
  await expect(page.getByRole("meter", { name: "Microphone level" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("recording.png") });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText(/^Voice, /)).toBeVisible();
  await expect(page.getByLabel("Narration playback")).toBeVisible();

  await page.getByRole("tab", { name: "Steps" }).click();
  await steps.nth(1).click();
  await page.getByRole("tab", { name: "Script" }).click();
  await page.getByLabel("Silence for").fill("2");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByText("Silence, 2.0 s")).toBeVisible();
  await expect(page.getByRole("alert", { name: "Steps without a Narration" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("narration.png") });

  // Undo goes through the editor's history.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("alert", { name: "Steps without a Narration" })).toContainText("Step 2"); // Undo removed it.
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByRole("alert", { name: "Steps without a Narration" })).toHaveCount(0);

  await make.click();
  await page.waitForURL(/\/review\?recording=/, { timeout: 60_000 });
  const recordingId = new URL(page.url()).searchParams.get("recording")!;

  const log = parseClipLog(
    await page.evaluate(async (id) => {
      const rec = await (await navigator.storage.getDirectory()).getDirectoryHandle("recordings").then((d) => d.getDirectoryHandle(id));
      const read = async (dir: FileSystemDirectoryHandle, name: string) => JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text());
      const { clips } = await read(rec, "recording.json");
      if (clips.length !== 1) throw new Error(`expected one Clip, got ${clips.length}`);
      return read(await (await rec.getDirectoryHandle("clips")).getDirectoryHandle(clips[0]), "log.json");
    }, recordingId),
  );
  const voiceMs = log.events[1].t; // Step 2 starts when Narration 1 ends.
  expect(voiceMs).toBeGreaterThan(1300);
  expect(voiceMs).toBeLessThan(2500);
  expect(log.events).toEqual([
    { t: 0, type: "step", index: 1 },
    { t: voiceMs, type: "step", index: 2 },
  ]);
  const sum = (voiceMs + 2000) / 1000;
  expect(log.durationMs / 1000).toBeCloseTo(sum, 3);

  await expect(page.getByTestId("edited-duration")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  expect(Math.abs(Number(await page.getByTestId("edited-duration").textContent()) - sum)).toBeLessThan(0.2);
  await page.screenshot({ path: test.info().outputPath("review.png") });

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export MP4" }).click();
  const video = page.getByLabel("Exported video");
  await expect(video).toBeVisible({ timeout: 600_000 });
  const duration = await video.evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 1) await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    return v.duration;
  });
  expect(Math.abs(duration - sum)).toBeLessThan(0.2);
});
