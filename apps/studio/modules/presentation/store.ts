import type { Presentation } from "@flowcam/domain";
import { afterLocalSave, pullOnLoad } from "../sync/sync";
import { readLocal, setCurrent, writeLocal } from "./local";

export { deleteLocal as deletePresentation, listLocal as listPresentations, type LocalEntry } from "./local";

// Presentations live in OPFS (see local.ts); the open one is shared by Authoring, the recorder and export.
// For signed-in Pro users, Sync (modules/sync) pulls on load and pushes after saves; everyone else stays local.

export async function loadPresentation(): Promise<Presentation | null> {
  return pullOnLoad(await readLocal());
}

/** Makes a library Presentation the open one and loads it (pulling a newer cloud copy for Pro users). */
export async function openPresentation(id: string): Promise<Presentation | null> {
  await setCurrent(id);
  return loadPresentation();
}

export async function savePresentation(p: Presentation): Promise<void> {
  await writeLocal(p);
  afterLocalSave(p);
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
