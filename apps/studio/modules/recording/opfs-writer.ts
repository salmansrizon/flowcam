import type { StreamTargetChunk } from "mediabunny";

/** A stream for mediabunny's StreamTarget that writes `path/name` in OPFS crash-safely (see opfs-writer.worker.ts). */
export async function openCrashSafeFile(path: string[], name: string): Promise<WritableStream<StreamTargetChunk>> {
  const worker = new Worker(new URL("./opfs-writer.worker.ts", import.meta.url), { type: "module" });
  let next = 0;
  const pending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  worker.onmessage = ({ data }: MessageEvent<{ id: number; error?: string }>) => {
    const p = pending.get(data.id)!;
    pending.delete(data.id);
    if (data.error) p.reject(new Error(data.error));
    else p.resolve();
  };
  const call = (msg: object, transfer: Transferable[] = []) =>
    new Promise<void>((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transfer);
    });
  // A worker that fails to load or crashes must not leave the recorder waiting forever.
  worker.onerror = worker.onmessageerror = () => {
    for (const p of pending.values()) p.reject(new Error("The file writer stopped."));
    pending.clear();
    worker.terminate();
  };
  const close = () => call({ type: "close" }).finally(() => worker.terminate());

  try {
    await call({ type: "open", path, name });
  } catch (e) {
    worker.terminate();
    throw e;
  }
  return new WritableStream<StreamTargetChunk>({
    write: (chunk) => {
      const data = chunk.data.slice(); // Copy: the transfer detaches the buffer.
      return call({ type: "write", data, position: chunk.position }, [data.buffer]);
    },
    close,
    abort: close,
  });
}
