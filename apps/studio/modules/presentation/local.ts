import { parsePresentation, type Presentation } from "@flowcam/domain";

// Raw OPFS access to the user's Presentations and their Sync bookkeeping. No Sync logic lives here.
// Layout: presentations/<id>.json, presentations/<id>.sync.json, and current.json naming the open one.
// OPFS (not localStorage) so the export worker can read it too.
const DIR = "presentations";
const CURRENT = "current.json";
// Before the library there was one Presentation at the root; it is moved in on first use.
const LEGACY = "presentation.json";
const LEGACY_SYNC = "presentation.sync.json";

/** Cloud version this device last synced, and whether local edits are not yet in the cloud. */
export interface SyncMeta {
  id: string;
  baseVersion: number;
  dirty: boolean;
  /** Digest of the content last in sync, so re-saving unchanged content (e.g. right after a pull) is not a change. */
  hash?: string;
}

/** A library row: enough to list Presentations without loading them all. */
export interface LocalEntry {
  id: string;
  title: string;
  /** ms since epoch, from the file. */
  updatedAt: number;
}

const root = () => navigator.storage.getDirectory();
const presentationsDir = async () => (await root()).getDirectoryHandle(DIR, { create: true });

async function readText(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
}

async function remove(dir: FileSystemDirectoryHandle, name: string) {
  try {
    await dir.removeEntry(name);
  } catch {
    /* already absent */
  }
}

let migrated: Promise<void> | null = null;
/** Moves the pre-library presentation.json (and its sync record) into presentations/, once per page. */
function migrateLegacy(): Promise<void> {
  return (migrated ??= (async () => {
    const r = await root();
    const text = await readText(r, LEGACY);
    if (text === null) return;
    const p = parsePresentation(JSON.parse(text));
    const dir = await presentationsDir();
    if ((await readText(dir, `${p.id}.json`)) === null) await writeText(dir, `${p.id}.json`, text);
    const sync = await readText(r, LEGACY_SYNC);
    if (sync !== null) await writeText(dir, `${p.id}.sync.json`, sync);
    if ((await readText(r, CURRENT)) === null) await writeText(r, CURRENT, JSON.stringify({ id: p.id }));
    await remove(r, LEGACY_SYNC);
    await remove(r, LEGACY);
  })());
}

/** Id of the Presentation open in the editor, if any. */
export async function currentId(): Promise<string | null> {
  await migrateLegacy();
  const text = await readText(await root(), CURRENT);
  return text === null ? null : ((JSON.parse(text) as { id?: unknown }).id as string) ?? null;
}

export async function setCurrent(id: string): Promise<void> {
  await writeText(await root(), CURRENT, JSON.stringify({ id }));
}

export async function readLocalById(id: string): Promise<Presentation | null> {
  await migrateLegacy();
  const text = await readText(await presentationsDir(), `${id}.json`);
  return text === null ? null : parsePresentation(JSON.parse(text));
}

/** The open Presentation, if any. */
export async function readLocal(): Promise<Presentation | null> {
  const id = await currentId();
  return id === null ? null : readLocalById(id);
}

/** Saves a Presentation; by default it also becomes the open one. */
export async function writeLocal(p: Presentation, { makeCurrent = true }: { makeCurrent?: boolean } = {}): Promise<void> {
  await migrateLegacy();
  await writeText(await presentationsDir(), `${p.id}.json`, JSON.stringify(p));
  if (makeCurrent) await setCurrent(p.id);
}

/** Every local Presentation, newest first. Unreadable files are skipped, not fatal. */
export async function listLocal(): Promise<LocalEntry[]> {
  await migrateLegacy();
  const out: LocalEntry[] = [];
  for await (const [name, handle] of (await presentationsDir()).entries()) {
    if (handle.kind !== "file" || !name.endsWith(".json") || name.endsWith(".sync.json")) continue;
    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      const p = parsePresentation(JSON.parse(await file.text()));
      out.push({ id: p.id, title: p.title, updatedAt: file.lastModified });
    } catch {
      /* a damaged file must not hide the rest of the library */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Removes a Presentation and its sync record; if it was open, nothing is open afterwards. */
export async function deleteLocal(id: string): Promise<void> {
  const dir = await presentationsDir();
  await remove(dir, `${id}.json`);
  await remove(dir, `${id}.sync.json`);
  if ((await currentId()) === id) await remove(await root(), CURRENT);
}

/** Sync record of the open Presentation. */
export async function readMeta(): Promise<SyncMeta | null> {
  const id = await currentId();
  if (id === null) return null;
  const text = await readText(await presentationsDir(), `${id}.sync.json`);
  return text === null ? null : (JSON.parse(text) as SyncMeta);
}

export async function writeMeta(m: SyncMeta): Promise<void> {
  await writeText(await presentationsDir(), `${m.id}.sync.json`, JSON.stringify(m));
}

/** Clears the open Presentation's sync record. */
export async function clearMeta(): Promise<void> {
  const id = await currentId();
  if (id !== null) await remove(await presentationsDir(), `${id}.sync.json`);
}
