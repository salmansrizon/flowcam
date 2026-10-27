import { parsePresentation, type Presentation } from "@flowcam/domain";

// Raw OPFS access to the local Presentation and its Sync bookkeeping. No Sync logic lives here.
const FILE = "presentation.json";
const SYNC_FILE = "presentation.sync.json";

/** Cloud version this device last synced, and whether local edits are not yet in the cloud. */
export interface SyncMeta {
  id: string;
  baseVersion: number;
  dirty: boolean;
  /** Digest of the content last in sync, so re-saving unchanged content (e.g. right after a pull) is not a change. */
  hash?: string;
}

async function readText(name: string): Promise<string | null> {
  const root = await navigator.storage.getDirectory();
  try {
    return await (await (await root.getFileHandle(name)).getFile()).text();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

async function writeText(name: string, text: string) {
  const root = await navigator.storage.getDirectory();
  const writable = await (await root.getFileHandle(name, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
}

export async function readLocal(): Promise<Presentation | null> {
  const text = await readText(FILE);
  return text === null ? null : parsePresentation(JSON.parse(text));
}

export const writeLocal = (p: Presentation) => writeText(FILE, JSON.stringify(p));

export async function readMeta(): Promise<SyncMeta | null> {
  const text = await readText(SYNC_FILE);
  return text === null ? null : (JSON.parse(text) as SyncMeta);
}

export const writeMeta = (m: SyncMeta) => writeText(SYNC_FILE, JSON.stringify(m));

export async function clearMeta() {
  try {
    await (await navigator.storage.getDirectory()).removeEntry(SYNC_FILE);
  } catch {
    /* already absent */
  }
}
