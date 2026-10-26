import type { Presentation } from "@flowcam/domain";

// Images live in OPFS as assets/<sha256 hex> (ADR 0002); `Element.imageId` is that hash.
// Shared by Authoring, the recorder, the Review preview and export.

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function assetsDir(create: boolean) {
  return (await navigator.storage.getDirectory()).getDirectoryHandle("assets", { create });
}

/** Stores the bytes and returns their hash (the `imageId`). Identical bytes are stored once. */
export async function writeAsset(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const id = await sha256Hex(bytes);
  const dir = await assetsDir(true);
  try {
    await dir.getFileHandle(id);
  } catch {
    const out = await (await dir.getFileHandle(id, { create: true })).createWritable();
    await out.write(bytes);
    await out.close();
  }
  return id;
}

export async function readAsset(id: string): Promise<Blob> {
  return (await (await (await assetsDir(false)).getFileHandle(id)).getFile()) as Blob;
}

/** Decodes stored Images into the map `RenderEnv.images` expects. Missing or undecodable assets are left out. */
export async function decodeImages(ids: Iterable<string>, into: Map<string, ImageBitmap> = new Map()): Promise<Map<string, ImageBitmap>> {
  for (const id of ids) {
    if (into.has(id)) continue;
    try {
      into.set(id, await createImageBitmap(await readAsset(id)));
    } catch {
      /* ponytail: a missing asset draws the renderer's placeholder; surface it in the UI if it happens in practice */
    }
  }
  return into;
}

/** Fetches an image URL into storage. Throws when the request fails or the response is not an image. */
export async function fetchImageAsset(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) throw new Error("not an image");
  return writeAsset(blob);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Ids of every Image in the Presentation, for `decodeImages`. */
export function imageIdsOf(p: Presentation): string[] {
  return p.boards.flatMap((b) => b.elements.flatMap((e) => (e.type === "image" && e.imageId ? [e.imageId] : [])));
}
