import { expect, test, type Page } from "@playwright/test";

async function drawWith(page: Page, tool: string, from: [number, number], to: [number, number]) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const box = (await page.getByLabel("Board").boundingBox())!;
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
