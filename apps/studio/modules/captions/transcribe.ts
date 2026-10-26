import type { Transcript } from "./captions";
import type { TranscribeReply, TranscribeRequest } from "./whisper.worker";

declare global {
  interface Window {
    /** Test hook: replaces Whisper, whose model is too large to download in every test run. */
    flowcamTranscribe?: (clips: { clipId: string; durationMs: number }[]) => Promise<Transcript>;
  }
}

/** Makes the Recording's Transcript on the device, in a worker. */
export function transcribe(clips: TranscribeRequest["clips"], onProgress: (message: string) => void): Promise<Transcript> {
  if (window.flowcamTranscribe) return window.flowcamTranscribe(clips.map(({ clipId, durationMs }) => ({ clipId, durationMs })));
  const worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  return new Promise<Transcript>((resolve, reject) => {
    worker.onerror = (e) => reject(new Error(e.message || "The captions worker failed to start."));
    worker.onmessage = ({ data }: MessageEvent<TranscribeReply>) => {
      if (data.type === "progress") onProgress(data.message);
      else if (data.type === "done") resolve(data.transcript);
      else reject(new Error(data.message));
    };
    worker.postMessage({ clips } satisfies TranscribeRequest);
  }).finally(() => worker.terminate());
}
