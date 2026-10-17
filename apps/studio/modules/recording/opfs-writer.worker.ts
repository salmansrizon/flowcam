// Writes one OPFS file through a sync access handle, flushing after every write. Unlike createWritable(), which
// commits only on close(), this keeps every written fragment on disk if the tab crashes (ADR 0005, R4.3).

type Msg =
  | { id: number; type: "open"; path: string[]; name: string }
  | { id: number; type: "write"; data: Uint8Array; position: number }
  | { id: number; type: "close" };

// The app is type-checked with the DOM lib, which leaves out this worker-only API.
interface SyncAccessHandle {
  write(data: Uint8Array, options: { at: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}

let handle: SyncAccessHandle | null = null;

self.onmessage = async ({ data: msg }: MessageEvent<Msg>) => {
  try {
    if (msg.type === "open") {
      let dir = await navigator.storage.getDirectory();
      for (const name of msg.path) dir = await dir.getDirectoryHandle(name, { create: true });
      const file = await dir.getFileHandle(msg.name, { create: true });
      handle = await (file as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }).createSyncAccessHandle();
      handle.truncate(0);
    } else if (msg.type === "write") {
      handle!.write(msg.data, { at: msg.position });
      handle!.flush();
    } else {
      handle?.flush();
      handle?.close();
      handle = null;
    }
    self.postMessage({ id: msg.id });
  } catch (e) {
    self.postMessage({ id: msg.id, error: String(e) });
  }
};
