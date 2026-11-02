import type { Page } from "@playwright/test";

/**
 * Stores a Presentation in OPFS the way the app does (presentations/<id>.json) and makes it the open one.
 * Tests use this instead of the pre-library presentation.json, whose migration would otherwise race with
 * anything the page creates on first load.
 */
export async function seedPresentation(page: Page, presentation: { id: string }) {
  await page.evaluate(async (json) => {
    const root = await navigator.storage.getDirectory();
    const write = async (dir: FileSystemDirectoryHandle, name: string, text: string) => {
      const out = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await out.write(text);
      await out.close();
    };
    const p = JSON.parse(json) as { id: string };
    await write(await root.getDirectoryHandle("presentations", { create: true }), `${p.id}.json`, json);
    await write(root, "current.json", JSON.stringify({ id: p.id }));
  }, JSON.stringify(presentation));
}
