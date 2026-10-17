import { InvalidDataError, parseClipLog, parsePresentation, type ClipLog, type Presentation } from "@flowcam/domain";
import { fixturePresentation } from "./fixture";
import { openCrashSafeFile } from "./opfs-writer";

// OPFS layout (S3 Authoring writes presentation.json; S5 export reads recordings/):
//   presentation.json
//   recordings/<recordingId>/recording.json
//   recordings/<recordingId>/clips/<clipId>/media.mp4   fragmented MP4, Camera + Microphone
//   recordings/<recordingId>/clips/<clipId>/log.json    ClipLog

/** recordings/<id>/recording.json. `clips` lists Clip ids in play order. */
export interface RecordingManifest {
  version: 1;
  id: string;
  presentationId: string;
  boardId: string;
  /** ISO 8601. */
  createdAt: string;
  clips: string[];
}

export function parseRecording(v: unknown): RecordingManifest {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const strings = ["id", "presentationId", "boardId", "createdAt"].every((k) => typeof o[k] === "string");
  const clips = Array.isArray(o.clips) && o.clips.every((c) => typeof c === "string") && new Set(o.clips).size === o.clips.length;
  if (o.version !== 1 || !strings || Number.isNaN(Date.parse(o.createdAt as string)) || !clips) {
    throw new InvalidDataError("recording: expected { version: 1, id, presentationId, boardId, createdAt (ISO), clips: unique string[] }");
  }
  return o as unknown as RecordingManifest;
}

async function dirAt(path: string[], create = false) {
  let dir = await navigator.storage.getDirectory();
  for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
  return dir;
}

async function fileAt(path: string[], name: string, create = false) {
  return (await dirAt(path, create)).getFileHandle(name, { create });
}

async function readJson(path: string[], name: string): Promise<unknown> {
  return JSON.parse(await (await (await fileAt(path, name)).getFile()).text());
}

async function writeJson(path: string[], name: string, value: unknown) {
  const out = await (await fileAt(path, name, true)).createWritable();
  await out.write(JSON.stringify(value, null, 2));
  await out.close();
}

const recordingDir = (recordingId: string) => ["recordings", recordingId];
const clipDir = (recordingId: string, clipId: string) => ["recordings", recordingId, "clips", clipId];

/** The Presentation to record: OPFS presentation.json, or the built-in fixture if there is none. */
export async function loadPresentation(): Promise<Presentation> {
  try {
    return parsePresentation(await readJson([], "presentation.json"));
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return fixturePresentation;
    throw e;
  }
}

export async function readRecording(recordingId: string): Promise<RecordingManifest> {
  const recording = parseRecording(await readJson(recordingDir(recordingId), "recording.json"));
  if (recording.id !== recordingId) throw new InvalidDataError(`recording.id: expected ${recordingId}`);
  return recording;
}

export const writeRecording = (recording: RecordingManifest) => writeJson(recordingDir(recording.id), "recording.json", recording);

export const readClipLog = async (recordingId: string, clipId: string): Promise<ClipLog> =>
  parseClipLog(await readJson(clipDir(recordingId, clipId), "log.json"));

export const writeClipLog = (recordingId: string, log: ClipLog) => writeJson(clipDir(recordingId, log.clipId), "log.json", log);

export const readClipMedia = async (recordingId: string, clipId: string): Promise<File> =>
  (await fileAt(clipDir(recordingId, clipId), "media.mp4")).getFile();

/** A fresh, empty media.mp4 for a Clip, open for crash-safe writing. */
export const openClipMedia = (recordingId: string, clipId: string) =>
  openCrashSafeFile(clipDir(recordingId, clipId), "media.mp4");

/** Removes a Clip's folder (media and log). */
export async function deleteClip(recordingId: string, clipId: string) {
  await (await dirAt([...recordingDir(recordingId), "clips"])).removeEntry(clipId, { recursive: true });
}
