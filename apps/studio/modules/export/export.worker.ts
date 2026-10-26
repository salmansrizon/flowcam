import { boardRenderer } from "@flowcam/renderer";
import { loadEditable } from "../editing/store";
import { exportRecording, type Resolution } from "./compose";

export type ExportRequest = { recordingId: string; frameHashes?: boolean; resolution?: Resolution };
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
    const { presentation, clips, edits, transcript } = await loadEditable(req.recordingId);
    const frameHashes: string[] = [];
    const video = await exportRecording(boardRenderer, presentation, clips, edits, transcript, {
      watermark: true, // Every local user is Free (ADR 0005).
      resolution: req.resolution,
      onProgress: (done, total) => reply({ type: "progress", done, total }),
      onFrame: req.frameHashes ? async (canvas) => void frameHashes.push(await sha256(canvas)) : undefined,
    });
    reply({ type: "done", video, frameHashes });
  } catch (e) {
    reply({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
