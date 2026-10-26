import { expect, test } from "@playwright/test";

test("studio loads and fake camera and microphone are available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Flowcam Studio" })).toBeVisible();
  const tracks = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return stream.getTracks().map((t) => t.kind).sort();
  });
  expect(tracks).toEqual(["audio", "video"]);
});
