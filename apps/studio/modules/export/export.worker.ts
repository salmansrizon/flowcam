import { boardRenderer } from "@flowcam/renderer";
import { loadPresentation, readClipLog, readClipMedia, readRecording } from "../recording/storage";
import { exportRecording } from "./compose";

export type ExportRequest = { recordingId: string; frameHashes?: boolean };
export type ExportReply =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; video: Blob; frameHashes: string[] }
  | { type: "error"; message: string };

const reply = (msg: ExportReply) => self.postMessage(msg);

async function sha256(canvas: OffscreenCanvas): Promise<string> {
  const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

self.onmessage = async ({ data: req }: MessageEvent<ExportRequest>) => {
  try {
    const recording = await readRecording(req.recordingId);
    // The current Presentation, so edits made after recording appear in the export (ADR 0002).
    const presentation = await loadPresentation();
    if (presentation.id !== recording.presentationId) throw new Error("The Presentation this Recording was made from no longer exists.");
    const clips = await Promise.all(
      recording.clips.map(async (id) => ({
        log: await readClipLog(recording.id, id),
        media: await readClipMedia(recording.id, id),
      })),
    );
    const frameHashes: string[] = [];
    const video = await exportRecording(boardRenderer, presentation, clips, {
      watermark: true, // Every M1 export is Free.
      onProgress: (done, total) => reply({ type: "progress", done, total }),
      onFrame: req.frameHashes ? async (canvas) => void frameHashes.push(await sha256(canvas)) : undefined,
    });
    reply({ type: "done", video, frameHashes });
  } catch (e) {
    reply({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
