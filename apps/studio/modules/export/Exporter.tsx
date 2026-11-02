"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/studio/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "../editing/ui";
import { UpgradePanel } from "../onboarding/UpgradePanel";
import { hasPro, usePlan } from "../onboarding/usePlan";
import { Input } from "@/components/ui/input";
import { loadEditable } from "../editing/store";
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
  const pro = hasPro(usePlan());
  const [upgrade, setUpgrade] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<Blob | null>(null);
  const [shareUpgrade, setShareUpgrade] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [resolution, setResolution] = useState<NonNullable<ExportRequest["resolution"]>>("1080p");

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.flowcamExportFrameHashes = async (id) => (await runExport({ recordingId: id, frameHashes: true }, () => {})).frameHashes;
  }, []);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  async function start() {
    setError(null);
    setUrl(null);
    setVideo(null);
    setShareUrl(null);
    setProgress([0, 1]);
    try {
      const { video } = await runExport({ recordingId, resolution }, (done, total) => setProgress([done, total]));
      setVideo(video);
      setUrl(URL.createObjectURL(video));
      return video;
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setProgress(null);
    }
  }

  /** Pro only (the server checks again): exports if needed, uploads the MP4 and creates the Share Link. */
  async function share() {
    if (!pro) return setShareUpgrade(true);
    setError(null);
    setSharing(true);
    try {
      const mp4 = video ?? (await start());
      if (!mp4) return;
      const { presentation } = await loadEditable(recordingId);
      const form = new FormData();
      form.set("video", mp4, "flowcam.mp4");
      form.set("title", presentation.title);
      form.set("presentation", JSON.stringify(presentation));
      if (sharePassword) form.set("password", sharePassword);
      const res = await fetch("/api/share", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setShareUrl(json.url);
    } catch (e) {
      setError(`Share failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSharing(false);
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
          <NativeSelect id="export-resolution" value={resolution} onChange={(e) => (e.target.value === "4k" && !pro ? setUpgrade(true) : setResolution(e.target.value as typeof resolution))} aria-label="Resolution">
            <option value="1080p">1080p</option>
            {/* 4K is a Pro feature (CONTEXT.md: Plan); for Free users choosing it opens the upgrade panel. */}
            <option value="4k">{pro ? "4K" : "4K (Pro)"}</option>
          </NativeSelect>
          {!pro && (
            <button type="button" aria-label="Pro" title="4K export comes with Pro" onClick={() => setUpgrade(true)}>
              <Badge>Pro</Badge>
            </button>
          )}
          <UpgradePanel feature="4K export" benefit="Export your video in sharp 4K." open={upgrade} onOpenChange={setUpgrade} />
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
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Input type="password" aria-label="Share password" placeholder="Password (optional)" className="max-w-52" value={sharePassword} onChange={(e) => setSharePassword(e.target.value)} />
            <Button variant="outline" onClick={() => void share()} disabled={progress !== null || sharing}>
              Share link
            </Button>
            {!pro && <Badge>Pro</Badge>}
          </div>
          {shareUrl && <Input readOnly aria-label="Share link URL" value={shareUrl} onFocus={(e) => e.target.select()} />}
          <UpgradePanel feature="Share links" benefit="Share your video with a link, an Open Board view and Remix." open={shareUpgrade} onOpenChange={setShareUpgrade} />
        </div>
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
