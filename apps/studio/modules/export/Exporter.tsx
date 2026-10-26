"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/studio/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "../editing/ui";
import { runExport } from "./run-export";
import type { ExportRequest } from "./export.worker";

declare global {
  interface Window {
    /** Test hook: exports the Recording and returns a hash of every composed frame. */
    flowcamExportFrameHashes?: (recordingId: string) => Promise<string[]>;
  }
}

/**
 * The Export button and its Dialog: resolution, progress, then the video and its download.
 * Review uses it in its top bar; the /export page shows it open (`standalone`).
 */
export default function Exporter({ recordingId, standalone = false }: { recordingId: string; standalone?: boolean }) {
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<NonNullable<ExportRequest["resolution"]>>("1080p");

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
      const { video } = await runExport({ recordingId, resolution }, (done, total) => setProgress([done, total]));
      setUrl(URL.createObjectURL(video));
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setProgress(null);
    }
  }

  const dialog = (
    <Dialog defaultOpen={standalone}>
      <DialogTrigger asChild>
        <Button>Export</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>MP4 with a Flowcam watermark.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <label htmlFor="export-resolution" className="text-sm font-medium">
            Resolution
          </label>
          <NativeSelect id="export-resolution" value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)} aria-label="Resolution">
            <option value="1080p">1080p</option>
            {/* Every local user is Free; 4K is a Pro feature (CONTEXT.md: Plan). */}
            <option value="4k" disabled>
              4K (Pro)
            </option>
          </NativeSelect>
          <Badge title="4K export comes with Pro">Pro</Badge>
        </div>
        <div>
          <Button onClick={start} disabled={progress !== null}>
            Export MP4
          </Button>
        </div>
        {progress && (
          <label className="grid gap-1 text-sm">
            Rendering
            <progress value={progress[0]} max={progress[1]} className="h-2 w-full accent-primary" />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {url && (
          <div className="grid gap-3">
            <video src={url} controls aria-label="Exported video" className="w-full rounded-lg bg-black" />
            <Button asChild variant="outline" className="w-fit">
              <a href={url} download="flowcam.mp4">
                <Download /> Download flowcam.mp4
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
  if (!standalone) return dialog;
  return (
    <main className="flex min-h-dvh flex-col">
      <TopBar>
        <h1 className="text-sm font-medium">Export</h1>
      </TopBar>
      <div className="grid flex-1 place-items-center">{dialog}</div>
    </main>
  );
}
