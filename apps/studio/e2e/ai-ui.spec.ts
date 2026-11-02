import { expect, test, type Page, type Route } from "@playwright/test";

// The /api/ai/jobs routes are stubbed: these tests cover the UI only.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PRICES = [
  { kind: "presentation", quality: "standard", credits: 5, unit: "job" },
  { kind: "presentation", quality: "best", credits: 15, unit: "job" },
  { kind: "script", quality: "standard", credits: 1, unit: "job" },
  { kind: "script", quality: "best", credits: 6, unit: "job" },
  { kind: "image", quality: "standard", credits: 12, unit: "job" },
  { kind: "image", quality: "best", credits: 45, unit: "job" },
  { kind: "voiceover", quality: "standard", credits: 1, unit: "minute" },
  { kind: "voiceover", quality: "best", credits: 6, unit: "minute" },
];
const deck = { version: 1, id: "from-server", title: "AI Generated Deck", themeId: "paper", boards: [{ id: "b1", elements: [], steps: [] }] };

type Stub = { post?: { status: number; body: unknown }; result?: unknown; statuses?: string[] };

const json = (r: Route, status: number, body: unknown) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function stubApi(page: Page, s: Stub) {
  await page.route("**/rest/v1/ai_job_config*", (r) => json(r, 200, PRICES));
  const polls = [...(s.statuses ?? ["queued", "running", "succeeded"])];
  await page.route("**/api/ai/jobs", (r) => (s.post ? json(r, s.post.status, s.post.body) : json(r, 200, { id: "job-1" })));
  await page.route("**/api/ai/jobs/*", (r) => {
    const status = polls.length > 1 ? polls.shift()! : polls[0];
    return json(r, 200, { id: "job-1", status, ...(status === "succeeded" ? { result: s.result } : {}) });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("flowcam.onboarding")) localStorage.setItem("flowcam.onboarding", "done");
  });
});

async function draw(page: Page, from: [number, number], to: [number, number]) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const box = (await page.getByLabel("Board", { exact: true }).boundingBox())!;
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 5 });
  await page.mouse.up();
}

async function twoSteps(page: Page) {
  await page.goto("/");
  await draw(page, [0.1, 0.1], [0.25, 0.25]);
  await draw(page, [0.4, 0.1], [0.55, 0.25]);
  await expect(page.getByRole("complementary", { name: "Steps" }).getByRole("listitem")).toHaveCount(2);
}

async function selectStep(page: Page, n: number) {
  await page.getByRole("tab", { name: "Steps" }).click();
  await page.getByRole("complementary", { name: "Steps" }).getByRole("listitem").nth(n).getByRole("button").first().click();
  await page.getByRole("tab", { name: "Script" }).click();
}

async function openImageDialog(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Generate image…" }).click();
  const dialog = page.getByRole("dialog", { name: "Generate image" });
  await dialog.getByLabel("Image prompt").fill("a red fox");
  return dialog;
}

test("Generate from a topic in the library opens the generated Presentation in the editor", async ({ page }) => {
  await stubApi(page, { result: { presentation: deck } });
  await page.goto("/library");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("menuitem", { name: "Generate from a topic…" }).click();
  const dialog = page.getByRole("dialog", { name: "Generate from a topic" });
  await expect(dialog.getByRole("button", { name: "Generate" })).toBeDisabled();
  await dialog.getByLabel("Topic").fill("How a bill becomes law");
  await expect(dialog).toContainText("5 Credits");
  await expect(dialog).toContainText("15 Credits");
  await page.screenshot({ path: test.info().outputPath("topic-dialog.png") });
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Presentation title")).toHaveValue("AI Generated Deck");
});

test("the Start from option generates a Presentation too", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("flowcam.onboarding")); // a fresh browser, as in onboarding.spec
  await stubApi(page, { result: { presentation: deck } });
  await page.goto("/");
  await page.getByRole("button", { name: "Dismiss" }).click();
  const start = page.getByRole("dialog", { name: "Start from" });
  await start.getByRole("button", { name: /Generate from a topic/ }).click();
  const dialog = page.getByRole("dialog", { name: "Generate from a topic" });
  await dialog.getByLabel("Topic").fill("Volcanoes");
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(page.getByLabel("Presentation title")).toHaveValue("AI Generated Deck");
});

test("AI Scripts preview next to the current ones, apply, then Undo in one step", async ({ page }) => {
  await stubApi(page, { result: { scripts: ["First, the setup.", "Then the payoff."] } });
  await twoSteps(page);
  await page.getByRole("tab", { name: "Script" }).click();
  await page.getByRole("button", { name: "Write Scripts with AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Write Scripts with AI" });
  await expect(dialog).toContainText("1 Credit");
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(dialog.getByTestId("ai-script")).toHaveText([/First, the setup\./, /Then the payoff\./]);
  await expect(dialog).toContainText("(empty)");
  await page.screenshot({ path: test.info().outputPath("scripts-preview.png") });
  await dialog.getByRole("button", { name: "Apply Scripts" }).click();

  const script = page.getByRole("textbox", { name: "Script", exact: true });
  await selectStep(page, 0);
  await expect(script).toHaveValue("First, the setup.");
  await selectStep(page, 1);
  await expect(script).toHaveValue("Then the payoff.");
  await page.getByRole("button", { name: "Undo" }).click();
  for (const n of [0, 1]) {
    await selectStep(page, n);
    await expect(script).toHaveValue("");
  }
});

test("Generate image adds an Image Element", async ({ page }) => {
  await stubApi(page, { result: { imageBase64: PNG, contentType: "image/png" } });
  const dialog = await openImageDialog(page);
  await expect(dialog).toContainText("12 Credits");
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Quick actions" })).toBeVisible(); // the new Image is selected
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("Generate Voiceover sets the Narration; an empty Script is refused", async ({ page }) => {
  await stubApi(page, { result: { audioBase64: "AAAA", contentType: "audio/mpeg", durationMs: 2000 } });
  await twoSteps(page);
  await selectStep(page, 0);
  await page.getByRole("button", { name: "Generate Voiceover" }).click();
  const dialog = page.getByRole("dialog", { name: "Generate Voiceover" });
  await expect(dialog).toContainText("Write a Script for this Step first");
  await expect(dialog.getByRole("button", { name: /^Generate/ })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("textbox", { name: "Script", exact: true }).fill("Hello there.");
  await page.getByRole("button", { name: "Generate Voiceover" }).click();
  await expect(dialog).toContainText("1 Credit per minute");
  await page.screenshot({ path: test.info().outputPath("voiceover-dialog.png") });
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(page.getByText("Voice, 2.0 s")).toBeVisible();
});

test("402 shows the out-of-Credits message linking to /credits", async ({ page }) => {
  await stubApi(page, { post: { status: 402, body: { error: "Not enough Credits" } } });
  const dialog = await openImageDialog(page);
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("out of Credits");
  await expect(dialog.getByRole("link", { name: "Get more Credits" })).toHaveAttribute("href", "/credits");
});

test("429 shows the server's message", async ({ page }) => {
  await stubApi(page, { post: { status: 429, body: { error: "Slow down: too many AI requests" } } });
  const dialog = await openImageDialog(page);
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("Slow down: too many AI requests");
});

test("signed out (401) shows the sign-in prompt", async ({ page }) => {
  await stubApi(page, { post: { status: 401, body: { error: "Sign in" } } });
  const dialog = await openImageDialog(page);
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(dialog.getByRole("link", { name: "Sign in to use AI" })).toHaveAttribute("href", "/sign-in?next=%2F");
  await page.screenshot({ path: test.info().outputPath("signin-prompt.png") });
});

test("a Job running at reload resumes polling and finishes", async ({ page }) => {
  await stubApi(page, { result: { imageBase64: PNG, contentType: "image/png" }, statuses: ["running"] });
  const dialog = await openImageDialog(page);
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(dialog.getByRole("status")).toContainText("generating");
  expect(await page.evaluate(() => localStorage.getItem("flowcam.ai.pending.image"))).toContain("job-1");

  // The Job finishes while the page reloads.
  await page.unroute("**/api/ai/jobs/*");
  await page.route("**/api/ai/jobs/*", (r) => json(r, 200, { id: "job-1", status: "succeeded", result: { imageBase64: PNG, contentType: "image/png" } }));
  await page.reload();
  await expect(page.getByRole("toolbar", { name: "Quick actions" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("flowcam.ai.pending.image"))).toBeNull();
});

test.describe("dark", () => {
  test.use({ colorScheme: "dark" });
  test("the dialog and the sign-in prompt render in dark mode", async ({ page }) => {
    await stubApi(page, { post: { status: 401, body: { error: "Sign in" } } });
    const dialog = await openImageDialog(page);
    await dialog.getByRole("button", { name: /^Generate/ }).click();
    await expect(dialog.getByRole("link", { name: "Sign in to use AI" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("dark.png") });
  });
});

test("a failed Job shows failed: with the reason", async ({ page }) => {
  await stubApi(page, { result: undefined });
  await page.unroute("**/api/ai/jobs/*");
  await page.route("**/api/ai/jobs/*", (r) => json(r, 200, { id: "job-1", status: "failed", error: "model down" }));
  const dialog = await openImageDialog(page);
  await dialog.getByRole("button", { name: /^Generate/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("failed: model down");
});
