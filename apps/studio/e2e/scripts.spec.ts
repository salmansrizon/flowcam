import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("flowcam.onboarding", "done"));
});

async function draw(page: Page, from: [number, number], to: [number, number]) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const box = (await page.getByLabel("Board", { exact: true }).boundingBox())!;
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 5 });
  await page.mouse.up();
}

async function threeSteps(page: Page) {
  await page.goto("/");
  await draw(page, [0.1, 0.1], [0.25, 0.25]);
  await draw(page, [0.4, 0.1], [0.55, 0.25]);
  await draw(page, [0.7, 0.1], [0.85, 0.25]);
  await expect(page.getByRole("complementary", { name: "Steps" }).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("tab", { name: "Script" }).click();
}

const upload = (page: Page, text: string) =>
  page.getByLabel("Script file").setInputFiles({ name: "script.txt", mimeType: "text/plain", buffer: Buffer.from(text) });

async function scriptOf(page: Page, n: number) {
  await page.getByRole("tab", { name: "Steps" }).click();
  await page.getByRole("complementary", { name: "Steps" }).getByRole("listitem").nth(n).getByRole("button").first().click();
  await page.getByRole("tab", { name: "Script" }).click();
  return page.getByRole("textbox", { name: "Script", exact: true });
}

test("upload a Script across Steps, then Undo in one step", async ({ page }) => {
  await threeSteps(page);
  await page.getByRole("button", { name: "Upload Script" }).click();
  await upload(page, "Hello there.\r\nStill first.\r\n\r\nSecond.\r\n---\r\nThird.");
  await expect(page.getByTestId("passage")).toHaveText(["Hello there. Still first.", "Second.", "Third."]);
  await page.screenshot({ path: test.info().outputPath("dialog.png") });
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(await scriptOf(page, 0)).toHaveValue("Hello there. Still first.");
  await expect(await scriptOf(page, 1)).toHaveValue("Second.");
  await expect(await scriptOf(page, 2)).toHaveValue("Third.");

  await page.getByRole("button", { name: "Undo" }).click();
  for (const n of [0, 1, 2]) await expect(await scriptOf(page, n)).toHaveValue("");
});

test("extra passages join the last Step with a warning; dividers move text", async ({ page }) => {
  await threeSteps(page);
  await page.getByRole("button", { name: "Upload Script" }).click();
  await page.getByLabel("Pasted Script").fill("One.\n\nTwo.\n\nThree. Three b.\n\nFour.\n\nFive.");
  await expect(page.getByRole("alert")).toContainText("More passages than Steps");
  await expect(page.getByTestId("passage")).toHaveText(["One.", "Two.", "Three. Three b. Four. Five."]);

  await page.getByRole("button", { name: "Move to previous Step (Step 3)" }).click();
  await expect(page.getByTestId("passage").nth(1)).toHaveText("Two. Three.");

  const divider = page.getByRole("separator", { name: "Divider between Step 2 and Step 3" });
  const b = (await divider.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("passage").nth(1)).toHaveText("Two. Three. Three b.");
  await page.screenshot({ path: test.info().outputPath("dialog-warning.png") });

  await page.getByRole("button", { name: "Apply" }).click();
  await expect(await scriptOf(page, 2)).toHaveValue("Four. Five.");
});

test("fewer passages than Steps warn and keep later Scripts", async ({ page }) => {
  await threeSteps(page);
  await (await scriptOf(page, 2)).fill("Keep me");
  await page.getByRole("button", { name: "Upload Script" }).click();
  await page.getByLabel("Pasted Script").fill("Only one.");
  await expect(page.getByRole("alert")).toContainText("Fewer passages than Steps");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(await scriptOf(page, 0)).toHaveValue("Only one.");
  await expect(await scriptOf(page, 2)).toHaveValue("Keep me");
});
