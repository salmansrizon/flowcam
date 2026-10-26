"use client";

import { useEffect, useState } from "react";
import { runExport } from "./run-export";

declare global {
  interface Window {
    /** Test hook: exports the Recording and returns a hash of every composed frame. */
    flowcamExportFrameHashes?: (recordingId: string) => Promise<string[]>;
  }
}

export default function Exporter({ recordingId, heading = true }: { recordingId: string; heading?: boolean }) {
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.flowcamExportFrameHashes = async (id) => (await runExport({ recordingId: id, frameHashes: true }, () => {})).frameHashes;
  }, []);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  async function start() {
    setError(null);
    setUrl(null);
    setProgress([0, 1]);
    try {
      const { video } = await runExport({ recordingId }, (done, total) => setProgress([done, total]));
      setUrl(URL.createObjectURL(video));
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setProgress(null);
    }
  }

  const body = (
    <>
      <p>
        <label>
          Resolution{" "}
          <select defaultValue="1080p" aria-label="Resolution">
            <option value="1080p">1080p</option>
            {/* Every local user is Free; 4K is a Pro feature (CONTEXT.md: Plan). */}
            <option value="4k" disabled>
              4K (Pro)
            </option>
          </select>
        </label>{" "}
        <span title="4K export comes with Pro" style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#7048e8", color: "#fff" }}>
          Pro
        </span>{" "}
        MP4 with a Flowcam watermark.
      </p>
      <button onClick={start} disabled={progress !== null}>
        Export MP4
      </button>
      {progress && (
        <p>
          <label>
            Rendering <progress value={progress[0]} max={progress[1]} />
          </label>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {url && (
        <>
          <video src={url} controls aria-label="Exported video" style={{ width: "100%", marginTop: 16 }} />
          <p>
            <a href={url} download="flowcam.mp4">
              Download flowcam.mp4
            </a>
          </p>
        </>
      )}
    </>
  );
  if (!heading) return body;
  return (
    <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 960 }}>
      <h1>Export</h1>
      {body}
    </main>
  );
}
