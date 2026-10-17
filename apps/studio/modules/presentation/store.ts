import { parsePresentation, type Presentation } from "@flowcam/domain";

// The Presentation lives in OPFS as presentation.json, shared by Authoring, the recorder and export.
const FILE = "presentation.json";

export async function loadPresentation(): Promise<Presentation | null> {
  const root = await navigator.storage.getDirectory();
  try {
    const file = await (await root.getFileHandle(FILE)).getFile();
    return parsePresentation(JSON.parse(await file.text()));
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

export async function savePresentation(p: Presentation): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const writable = await (await root.getFileHandle(FILE, { create: true })).createWritable();
  await writable.write(JSON.stringify(p));
  await writable.close();
}

export function newPresentation(): Presentation {
  return {
    version: 1,
    id: crypto.randomUUID(),
    title: "Untitled",
    themeId: "paper",
    boards: [{ id: crypto.randomUUID(), elements: [], steps: [] }],
  };
}
