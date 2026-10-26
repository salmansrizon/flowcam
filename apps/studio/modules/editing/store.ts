import type { ClipLog, Presentation } from "@flowcam/domain";
import { parseTranscript, type Transcript } from "../captions/captions";
import { loadPresentation, readClipLog, readClipMedia, readRecording, type RecordingManifest } from "../recording/storage";
import { defaultEdits, parseEdits, type Edits } from "./edits";

// Beside the Recording in OPFS:
//   recordings/<recordingId>/edits.json       Edits
//   recordings/<recordingId>/transcript.json  Transcript

async function recordingDir(recordingId: string) {
  return (await (await navigator.storage.getDirectory()).getDirectoryHandle("recordings")).getDirectoryHandle(recordingId);
}

/** The file's JSON, or null if there is no such file. */
async function readJson(recordingId: string, name: string): Promise<unknown> {
  try {
    const file = await (await (await recordingDir(recordingId)).getFileHandle(name)).getFile();
    return JSON.parse(await file.text());
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

async function writeJson(recordingId: string, name: string, value: unknown) {
  const out = await (await (await recordingDir(recordingId)).getFileHandle(name, { create: true })).createWritable();
  await out.write(JSON.stringify(value));
  await out.close();
}

export const writeEdits = (recordingId: string, edits: Edits) => writeJson(recordingId, "edits.json", edits);
export const writeTranscript = (recordingId: string, t: Transcript) => writeJson(recordingId, "transcript.json", t);

export interface EditableRecording {
  recording: RecordingManifest;
  presentation: Presentation;
  clips: { log: ClipLog; media: File }[];
  /** Saved edits, or the defaults (with dead air not yet detected) if none were saved. */
  edits: Edits;
  saved: boolean;
  transcript: Transcript | null;
}

/** Everything the Review screen and the export need for one Recording. */
export async function loadEditable(recordingId: string): Promise<EditableRecording> {
  const recording = await readRecording(recordingId);
  // The current Presentation, so edits made after recording appear (ADR 0002).
  const presentation = await loadPresentation();
  if (presentation.id !== recording.presentationId) throw new Error("The Presentation this Recording was made from no longer exists.");
  const clips = await Promise.all(
    recording.clips.map(async (id) => ({ log: await readClipLog(recordingId, id), media: await readClipMedia(recordingId, id) })),
  );
  const raw = await readJson(recordingId, "edits.json");
  const edits = raw === null ? defaultEdits(clips.map((c) => ({ clipId: c.log.clipId, durationMs: c.log.durationMs }))) : parseEdits(raw, recording.clips);
  const t = await readJson(recordingId, "transcript.json");
  return { recording, presentation, clips, edits, saved: raw !== null, transcript: t === null ? null : parseTranscript(t) };
}
