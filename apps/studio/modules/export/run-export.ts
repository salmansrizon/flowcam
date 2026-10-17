import type { ExportReply, ExportRequest } from "./export.worker";

/** Runs one export in a background worker. */
export function runExport(
  req: ExportRequest,
  onProgress: (done: number, total: number) => void,
): Promise<{ video: Blob; frameHashes: string[] }> {
  const worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
  return new Promise<{ video: Blob; frameHashes: string[] }>((resolve, reject) => {
    worker.onerror = (e) => reject(new Error(e.message || "The export worker failed to start."));
    worker.onmessage = ({ data }: MessageEvent<ExportReply>) => {
      if (data.type === "progress") onProgress(data.done, data.total);
      else if (data.type === "done") resolve(data);
      else reject(new Error(data.message));
    };
    worker.postMessage(req);
  }).finally(() => worker.terminate());
}
