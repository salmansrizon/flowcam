import type { Presentation } from "@flowcam/domain";
import { afterLocalSave, pullOnLoad } from "../sync/sync";
import { readLocal, writeLocal } from "./local";

// The Presentation lives in OPFS as presentation.json, shared by Authoring, the recorder and export.
// For signed-in Pro users, Sync (modules/sync) pulls on load and pushes after saves; everyone else stays local.

export async function loadPresentation(): Promise<Presentation | null> {
  return pullOnLoad(await readLocal());
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
