import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

async function drawWith(page: Page, tool: string, from: [number, number], to: [number, number]) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const box = (await page.getByLabel("Board", { exact: true }).boundingBox())!;
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 5 });
  await page.mouse.up();
}

test("drawing creates Steps that survive a reload", async ({ page }) => {
  await page.goto("/");
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await drawWith(page, "Ellipse", [0.6, 0.1], [0.8, 0.3]);
  await drawWith(page, "Arrow", [0.3, 0.2], [0.6, 0.2]);

  const steps = page.getByRole("complementary", { name: "Steps" }).getByRole("listitem");
  await expect(steps).toHaveText([/Reveal rectangle/, /Reveal ellipse/, /Reveal arrow/]);

  await page.getByRole("button", { name: "Add Flow off Step" }).click();
  await page.getByRole("button", { name: "Move Step 1 down" }).click();
  await expect(steps).toHaveText([/Reveal ellipse/, /Reveal rectangle/, /Reveal arrow/, /Flow off: arrow/]);

  await page.reload();
  await expect(steps).toHaveText([/Reveal ellipse/, /Reveal rectangle/, /Reveal arrow/, /Flow off: arrow/]);
});

// ---- Authoring v2 ----
const stepList = (page: Page) => page.getByRole("complementary", { name: "Steps" }).getByRole("listitem");
const boardList = (page: Page) => page.getByRole("navigation", { name: "Boards" }).getByRole("listitem");

async function clickBoard(page: Page, at: [number, number]) {
  const box = (await page.getByLabel("Board", { exact: true }).boundingBox())!;
  await page.mouse.click(box.x + at[0] * box.width, box.y + at[1] * box.height);
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}
/** A solid red PNG, built here so the test needs no fixture file. */
function redPng(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [255, 0, 0]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const pixel = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => Array.from(document.querySelector<HTMLCanvasElement>('canvas[aria-label="Board"]')!.getContext("2d")!.getImageData(px, py, 1, 1).data), [x, y]);

test("two Boards with a Transition, reordered, survive a reload", async ({ page }) => {
  await page.goto("/");
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await page.getByRole("button", { name: "Add Board" }).click();
  await drawWith(page, "Ellipse", [0.1, 0.1], [0.3, 0.3]);
  await drawWith(page, "Ellipse", [0.5, 0.1], [0.7, 0.3]);
  await page.getByLabel("Transition").selectOption("slide");
  await expect(boardList(page)).toHaveText([/Board 1 \(1\)/, /Board 2 \(2\)/]);

  await page.getByRole("button", { name: "Move Board 2 up" }).click();
  await expect(boardList(page)).toHaveText([/Board 1 \(2\)/, /Board 2 \(1\)/]);
  await page.reload();
  await expect(boardList(page)).toHaveText([/Board 1 \(2\)/, /Board 2 \(1\)/]);
  await boardList(page).first().getByRole("button", { name: /^Board 1 \(/ }).click();
  await expect(page.getByLabel("Transition")).toHaveValue("slide");

  // Deleting a Board with Elements asks first.
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Delete Board" }).click();
  await expect(boardList(page)).toHaveCount(2);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Board" }).click();
  await expect(boardList(page)).toHaveCount(1);
});

test("sticky, inline text and an uploaded Image persist; a bad URL adds nothing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sticky" }).click();
  await clickBoard(page, [0.2, 0.2]);
  await page.getByLabel("Edit text").fill("Remember this");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await clickBoard(page, [0.7, 0.2]);
  await page.getByLabel("Edit text").fill("A label");
  await page.getByLabel("Edit text").blur();

  const png = redPng(120);
  await page.getByLabel("Upload image").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: png });
  await expect(stepList(page)).toHaveText([/Reveal sticky “Remember this”/, /Reveal text “A label”/, /Reveal image/]);

  const hash = createHash("sha256").update(png).digest("hex");
  const assets = () =>
    page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("assets");
      const names: string[] = [];
      for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string]> }).entries()) names.push(name);
      return names;
    });
  expect(await assets()).toEqual([hash]);
  await expect.poll(() => pixel(page, 960, 540)).toEqual([255, 0, 0, 255]);

  await page.route("http://localhost:9/**", (r) => r.abort());
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Image from URL…" }).click();
  await page.getByLabel("Image URL").fill("http://localhost:9/nope.png");
  await page.getByRole("button", { name: "Add image from URL" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not fetch" })).toContainText("Could not fetch that image");
  await expect(stepList(page)).toHaveCount(3);

  await page.reload();
  await expect(stepList(page)).toHaveCount(3);
  await expect.poll(() => pixel(page, 960, 540)).toEqual([255, 0, 0, 255]);
});

test("a Focus Step by dragging, a Script and a Layout persist", async ({ page }) => {
  await page.goto("/");
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await page.getByRole("button", { name: "Add Focus Step" }).click();
  const box = (await page.getByLabel("Board", { exact: true }).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.05);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Focus out" }).click();
  await expect(stepList(page)).toHaveText([/Reveal rectangle/, /Focus in/, /Focus out/]);

  await stepList(page).nth(0).getByRole("button", { name: /Reveal rectangle/ }).click();
  await page.getByLabel("Layout").selectOption("side-by-side");
  await page.getByLabel("Effect").selectOption("draw-on");
  await page.getByRole("tab", { name: "Script" }).click();
  await page.getByRole("textbox", { name: "Script" }).fill("First we draw the box.");

  await page.reload();
  await stepList(page).nth(0).getByRole("button", { name: /Reveal rectangle/ }).click();
  await expect(page.getByLabel("Layout")).toHaveValue("side-by-side");
  await expect(page.getByLabel("Effect")).toHaveValue("draw-on");
  await page.getByRole("tab", { name: "Script" }).click();
  await expect(page.getByRole("textbox", { name: "Script" })).toHaveValue("First we draw the box.");
});

test("dark mode gives the top bar a dark background", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  // Read the computed colour through a canvas, which turns any CSS colour syntax into RGB.
  const [r, g, b] = await page.locator("header").evaluate((el) => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  });
  expect((r + g + b) / 3).toBeLessThan(80);
});

test("merge adjacent reveals, add a highlight and a move", async ({ page }) => {
  await page.goto("/");
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await drawWith(page, "Ellipse", [0.6, 0.1], [0.8, 0.3]);
  await stepList(page).nth(0).getByRole("button", { name: /Reveal rectangle/ }).click();
  await page.getByRole("button", { name: "Merge with next" }).click();
  await expect(stepList(page)).toHaveText([/Reveal rectangle, ellipse/]);

  await page.getByRole("button", { name: "Add Highlight Step" }).click();
  await page.getByRole("button", { name: "Move in a Step" }).click();
  const box = (await page.getByLabel("Board", { exact: true }).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Confirm move" }).click();
  await expect(stepList(page)).toHaveText([/Reveal rectangle, ellipse/, /Highlight ellipse/, /Move ellipse/]);
});

test("a Theme changes the background and persists", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => pixel(page, 3, 3)).toEqual([255, 255, 255, 255]);
  await page.getByLabel("Theme").selectOption("chalkboard");
  await expect.poll(() => pixel(page, 3, 3)).toEqual([0x1f, 0x3a, 0x2e, 255]);
  await page.reload();
  await expect.poll(() => pixel(page, 3, 3)).toEqual([0x1f, 0x3a, 0x2e, 255]);
});

test("Start from a Template, then add another as a new Board", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("region", { name: "Start from" }).getByRole("button", { name: "RAG Pipeline" }).click();
  await expect(boardList(page)).toHaveCount(1);
  await expect(stepList(page).first()).toHaveText(/Reveal ellipse “User Query”/);
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Template" }).click();
  await page.getByRole("menuitem", { name: "CI/CD pipeline" }).click();
  await expect(boardList(page)).toHaveCount(2);
  await page.reload();
  await expect(boardList(page)).toHaveCount(2);
  await boardList(page).first().getByRole("button", { name: /^Board 1 \(/ }).click();
  await expect(stepList(page).first()).toHaveText(/User Query/);
});

test("an .excalidraw file becomes a Board and reports what it skipped", async ({ page }) => {
  const png = redPng(16);
  const doc = {
    type: "excalidraw",
    version: 2,
    elements: [
      { type: "rectangle", x: 0, y: 0, width: 200, height: 100, strokeColor: "#e03131", backgroundColor: "transparent" },
      { type: "text", x: 20, y: 120, width: 100, height: 25, text: "From Excalidraw", fontSize: 20 },
      { type: "arrow", x: 200, y: 50, width: 100, height: 0, points: [[0, 0], [100, 0]] },
      { type: "image", x: 320, y: 0, width: 64, height: 64, fileId: "f1" },
      { type: "line", x: 0, y: 0, width: 5, height: 5, points: [[0, 0], [5, 5]] },
    ],
    files: { f1: { mimeType: "image/png", dataURL: `data:image/png;base64,${png.toString("base64")}` } },
  };
  await page.goto("/");
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await page.getByLabel("Import .excalidraw").setInputFiles({ name: "d.excalidraw", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.getByRole("status")).toHaveText("Imported 4 elements, skipped 1 unsupported.");
  await expect(boardList(page)).toHaveText([/Board 1 \(1\)/, /Board 2 \(4\)/]);
  await expect(stepList(page)).toHaveText([/Reveal rectangle/, /Reveal text “From Excalidraw”/, /Reveal arrow/, /Reveal image/]);
  await page.reload();
  await expect(boardList(page)).toHaveText([/Board 1 \(1\)/, /Board 2 \(4\)/]);
});

// ---- Editor: Excaliflow's remaining UI (#30) ----
test("undo and redo a draw, by button and by shortcut, and Undo persists", async ({ page }) => {
  await page.goto("/");
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await expect(stepList(page)).toHaveText([/Reveal rectangle/]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(stepList(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(stepList(page)).toHaveText([/Reveal rectangle/]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(stepList(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(stepList(page)).toHaveText([/Reveal rectangle/]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(stepList(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Board", { exact: true })).toBeVisible();
  await expect(stepList(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("zoomed in, a drawn Element lands under the pointer", async ({ page }) => {
  await page.goto("/");
  const zoom = page.getByRole("group", { name: "Zoom" });
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await drawWith(page, "Rectangle", [0.4, 0.4], [0.6, 0.6]);
  // Ink around the rectangle's left edge (Board x 0.4, y 0.5) and none far from it.
  const ink = (fx: number, fy: number) =>
    page.evaluate(([x, y]) => {
      const { data } = document.querySelector<HTMLCanvasElement>('canvas[aria-label="Board"]')!.getContext("2d")!.getImageData(x - 20, y - 20, 40, 40);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) n++;
      return n;
    }, [fx * 1920, fy * 1080]);
  expect(await ink(0.4, 0.5)).toBeGreaterThan(20);
  expect(await ink(0.2, 0.5)).toBe(0);
  // Hit-testing follows the zoom: inside selects, outside does not.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await clickBoard(page, [0.7, 0.7]);
  await expect(page.getByRole("toolbar", { name: "Quick actions" })).toHaveCount(0);
  await clickBoard(page, [0.5, 0.5]);
  await expect(page.getByRole("toolbar", { name: "Quick actions" })).toBeVisible();
  // Fit goes back to the whole Board.
  await zoom.getByRole("button", { name: "Fit Board to screen" }).click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await clickBoard(page, [0.7, 0.7]);
  await clickBoard(page, [0.5, 0.5]);
  await expect(page.getByRole("toolbar", { name: "Quick actions" })).toBeVisible();
});

test("Ctrl+wheel zooms around the cursor and a plain wheel pans", async ({ page }) => {
  await page.goto("/");
  const board = page.getByLabel("Board", { exact: true });
  const before = (await board.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await board.boundingBox())!.width).toBeGreaterThan(before.width * 1.5);
  const zoomed = (await board.boundingBox())!;
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await board.boundingBox())!.y).toBeLessThan(zoomed.y - 50);
});

test("the quick bar duplicates and deletes the selection", async ({ page }) => {
  await page.goto("/");
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  const bar = page.getByRole("toolbar", { name: "Quick actions" });
  await bar.getByRole("button", { name: "Duplicate" }).click();
  await expect(stepList(page)).toHaveText([/Reveal rectangle/, /Reveal rectangle/]);
  await bar.getByRole("button", { name: "Delete selection" }).click();
  await expect(stepList(page)).toHaveText([/Reveal rectangle/]);
});

test("a Flow mode and roughness set in the Style panel persist", async ({ page }) => {
  await page.goto("/");
  await drawWith(page, "Arrow", [0.3, 0.2], [0.6, 0.2]);
  await page.getByRole("tab", { name: "Style" }).click();
  await page.getByRole("group", { name: "Flow mode" }).getByRole("button", { name: "Neon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Neon", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Roughness" }).getByRole("button", { name: "Architect" }).click();
  await page.reload();
  await expect(page.getByLabel("Board", { exact: true })).toBeVisible();
  await clickBoard(page, [0.45, 0.2]);
  await page.getByRole("tab", { name: "Style" }).click();
  await expect(page.getByRole("button", { name: "Neon", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Architect" })).toHaveAttribute("aria-pressed", "true");
  // "Theme default" removes the override.
  await page.getByRole("group", { name: "Roughness" }).getByRole("button", { name: "Theme default" }).click();
  await expect(page.getByRole("group", { name: "Roughness" }).getByRole("button", { name: "Theme default" })).toHaveAttribute("aria-pressed", "true");
});

test("a Presentation saved as JSON opens again, and a bad file is refused", async ({ page }, testInfo) => {
  await page.goto("/");
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save Presentation (JSON)" }).click();
  const file = testInfo.outputPath("deck.flowcam.json");
  await (await download).saveAs(file);
  await expect(page.getByRole("status")).toContainText("Images are not embedded");

  await drawWith(page, "Ellipse", [0.6, 0.1], [0.8, 0.3]);
  await expect(stepList(page)).toHaveText([/Reveal rectangle/, /Reveal ellipse/]);
  await page.getByLabel("Open Presentation JSON").setInputFiles(file);
  await expect(stepList(page)).toHaveText([/Reveal rectangle/]);
  // Opening is an edit, so Undo brings the ellipse back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(stepList(page)).toHaveText([/Reveal rectangle/, /Reveal ellipse/]);

  await page.getByLabel("Open Presentation JSON").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":2}') });
  await expect(page.getByRole("alert").filter({ hasText: "Could not open" })).toContainText("Could not open that file");
  await expect(stepList(page)).toHaveText([/Reveal rectangle/, /Reveal ellipse/]);
});

test("Save PNG downloads the Board, the empty hint goes away, and the tool lock keeps the tool", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("drag on the Board")).toBeVisible();
  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save PNG" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole("button", { name: "Lock tool" }).click();
  await drawWith(page, "Rectangle", [0.1, 0.1], [0.3, 0.3]);
  await expect(page.getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("drag on the Board")).toHaveCount(0);
  await page.getByRole("button", { name: "Lock tool" }).click();
  await drawWith(page, "Ellipse", [0.6, 0.1], [0.8, 0.3]);
  await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
});
