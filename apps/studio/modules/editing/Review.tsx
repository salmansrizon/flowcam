"use client";

import { LAYOUTS, type Layout } from "@flowcam/domain";
import { boardRenderer } from "@flowcam/renderer";
import { Blend, Diamond, Download, Eraser, Flag, Gauge, LayoutTemplate, Pause, Pencil, Play, Scissors, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/components/studio/Panel";
import { TopBar } from "@/components/studio/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CAPTION_LOOKS, cueAt, cuesFor, toSrt, toVtt } from "../captions/captions";
import { transcribe } from "../captions/transcribe";
import { BACKGROUND_FILLS, composeFrame, decodeMicrophone } from "../export/compose";
import Exporter from "../export/Exporter";
import { decodeImages, imageIdsOf } from "../presentation/assets";
import { detectDeadAir } from "./dead-air";
import {
  BACKGROUNDS,
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  CLIP_TRANSITIONS,
  deleteRange,
  fadeAt,
  layoutAt,
  MAX_PADDING,
  MAX_CORNERS,
  MAX_SHADOW,
  outputDuration,
  pieces,
  setLayout,
  setSpeed,
  setTransition,
  split,
  markAt,
  toSource,
  trim,
  type ClipTransition,
  type DeadAir,
  type Edits,
} from "./edits";
import { NativeSelect, RangeInput, SegmentedRow, Section, SwatchRow } from "./ui";
import { loadEditable, writeEdits, writeTranscript, type EditableRecording } from "./store";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PREVIEW_W = 1280;
const PREVIEW_H = 720;
const secs = (ms: number) => (ms / 1000).toFixed(2);

export default function Review({ recordingId, edit }: { recordingId: string; edit: boolean }) {
  const [data, setData] = useState<EditableRecording | null>(null);
  const images = useRef(new Map<string, ImageBitmap>());
  useEffect(() => {
    if (data) void decodeImages(imageIdsOf(data.presentation), images.current);
  }, [data]);
  const [edits, setEdits] = useState<Edits | null>(null);
  const [history, setHistory] = useState<Edits[]>([]);
  const [status, setStatus] = useState("Loading the Recording…");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState(0);
  const [selected, setSelected] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 1000]);
  const [tab, setTab] = useState("background");
  const [layoutChoice, setLayoutChoice] = useState<Layout | "auto">("auto");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const [captionStatus, setCaptionStatus] = useState("");
  const saveChain = useRef(Promise.resolve());

  const save = useCallback(
    (next: Edits) => {
      setSaving((n) => n + 1);
      saveChain.current = saveChain.current
        .then(() => writeEdits(recordingId, next))
        .catch((e) => setError(`Could not save edits: ${e}`))
        .finally(() => setSaving((n) => n - 1));
    },
    [recordingId],
  );

  /** Applies an edit, saving it and keeping the previous state for Undo. */
  const apply = useCallback(
    (next: Edits) => {
      if (!edits || next === edits) return;
      setHistory((h) => [...h.slice(-49), edits]);
      setEdits(next);
      save(next);
    },
    [edits, save],
  );

  const undo = useCallback(() => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setEdits(prev);
    save(prev);
  }, [history, save]);

  // Load, then find dead air the first time this Recording is reviewed.
  useEffect(() => {
    let live = true;
    (async () => {
      const d = await loadEditable(recordingId);
      if (!live) return;
      setData(d);
      let e = d.edits;
      if (e.deadAir === null) {
        setStatus("Finding dead air…");
        const deadAir: DeadAir[] = [];
        for (const c of d.clips) {
          const audio = await decodeMicrophone(c.media);
          if (audio) for (const r of detectDeadAir(audio.samples, audio.sampleRate)) deadAir.push({ clipId: c.log.clipId, ...r });
        }
        e = { ...e, deadAir };
      }
      if (!live) return;
      setEdits(e);
      if (!d.saved || d.edits !== e) save(e);
      setStatus("");
    })().catch((e) => live && setError(`Could not open the Recording: ${e instanceof Error ? e.message : e}`));
    return () => {
      live = false;
    };
  }, [recordingId, save]);

  // Captions are on by default: make the Transcript once, on the device.
  const wantsTranscript = !!data && !!edits?.captions.enabled && !data.transcript;
  useEffect(() => {
    if (!wantsTranscript || !data) return;
    let live = true;
    transcribe(
      data.clips.map((c) => ({ clipId: c.log.clipId, durationMs: c.log.durationMs, media: c.media })),
      (m) => live && setCaptionStatus(m),
    )
      .then(async (t) => {
        await writeTranscript(recordingId, t);
        if (live) setData({ ...data, transcript: t });
      })
      .catch((e) => live && setError(`Captions failed: ${e instanceof Error ? e.message : e}`));
    return () => {
      live = false;
    };
  }, [wantsTranscript, data, recordingId]);

  // Media for the preview.
  const urls = useMemo(() => new Map(data?.clips.map((c) => [c.log.clipId, URL.createObjectURL(c.media)]) ?? []), [data?.clips]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const ps = useMemo(() => (edits ? pieces(edits) : []), [edits]);
  const total = outputDuration(ps);
  const cues = useMemo(() => (edits?.captions.enabled && data?.transcript ? cuesFor(ps, data.transcript) : []), [ps, edits, data]);
  // Caption files for the edited timeline, whether or not captions are burnt into the picture.
  const captionFiles = useMemo(() => {
    if (!data?.transcript) return null;
    const all = cuesFor(ps, data.transcript);
    return {
      srt: URL.createObjectURL(new Blob([toSrt(all)], { type: "application/x-subrip" })),
      vtt: URL.createObjectURL(new Blob([toVtt(all)], { type: "text/vtt" })),
    };
  }, [ps, data]);
  useEffect(() => () => void (captionFiles && (URL.revokeObjectURL(captionFiles.srt), URL.revokeObjectURL(captionFiles.vtt))), [captionFiles]);

  // Playback: the active piece's Clip video drives the clock; every frame is drawn with composeFrame, as at export.
  useEffect(() => {
    if (!data || !edits) return;
    const videos = videosRef.current;
    const play = { piece: -1, outT: 0 };
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const order = data.recording.clips;
    const logs = new Map(data.clips.map((c) => [c.log.clipId, c.log]));
    let frame = 0;
    const startPiece = (i: number) => {
      const p = ps[i];
      play.piece = i;
      for (const [id, v] of videos) if (id !== p.clipId) v.pause();
      const v = videos.get(p.clipId)!;
      v.currentTime = p.start / 1000;
      v.playbackRate = p.speed;
      void v.play().catch(() => {});
    };
    if (playing) {
      const src = toSource(ps, playhead >= total ? 0 : playhead);
      if (!src) return;
      startPiece(src.piece);
      videos.get(src.clipId)!.currentTime = src.t / 1000;
    } else {
      for (const v of videos.values()) v.pause();
      const src = toSource(ps, playhead);
      if (src) videos.get(src.clipId)!.currentTime = src.t / 1000;
      play.piece = -1;
    }
    const draw = () => {
      let outT = playhead;
      if (playing && play.piece >= 0) {
        let p = ps[play.piece];
        const v = videos.get(p.clipId)!;
        if (v.currentTime * 1000 >= p.end || v.ended) {
          if (play.piece + 1 >= ps.length) {
            play.outT = total;
            setPlaying(false);
            setPlayhead(total);
            return;
          }
          startPiece(play.piece + 1);
          p = ps[play.piece];
        }
        const t = Math.max(p.start, Math.min(videos.get(p.clipId)!.currentTime * 1000, p.end));
        outT = p.at + (t - p.start) / p.speed;
        play.outT = outT;
        setClock(outT);
      }
      const src = toSource(ps, outT);
      if (src) {
        const v = videos.get(src.clipId);
        const cue = cueAt(cues, outT);
        composeFrame(ctx, PREVIEW_W, PREVIEW_H, {
          renderer: boardRenderer,
          presentation: data.presentation,
          log: logs.get(src.clipId)!,
          tMs: src.t,
          images: images.current,
          camera: v && v.videoWidth ? { image: v, width: v.videoWidth, height: v.videoHeight } : null,
          layout: layoutAt(edits, order, src.clipId, src.t),
          frame: edits.frame,
          caption: cue && { text: cue.text, style: edits.captions.style, position: edits.captions.position },
          fade: fadeAt(ps, outT),
          watermark: true,
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      if (playing) setPlayhead(play.outT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playhead seeds playback; re-running on every tick would restart it.
  }, [data, edits, ps, cues, playing, playing ? null : playhead, total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  if (error && !data) return <main className="p-8 text-destructive" role="alert">{error}</main>;
  if (!data || !edits) return <main className="p-8 text-muted-foreground">{status}</main>;

  const seg = edits.segments[Math.min(selected, edits.segments.length - 1)];
  const clipNo = (clipId: string) => data.recording.clips.indexOf(clipId) + 1;
  const durationOf = (clipId: string) => data.clips.find((c) => c.log.clipId === clipId)!.log.durationMs;
  const set = (patch: Partial<Edits>) => apply({ ...edits, ...patch });
  const shownTime = Math.min(playing ? clock : playhead, total);
  const deadAirMs = (edits.deadAir ?? []).reduce((n, d) => n + d.end - d.start, 0);
  const seek = (t: number) => {
    setPlaying(false);
    setPlayhead(Math.max(0, Math.min(t, total)));
  };
  const name = `${data.presentation.title} · ${new Date(data.recording.createdAt).toLocaleDateString()}`;
  const here = layoutAt(edits, data.recording.clips, toSource(ps, shownTime)?.clipId ?? data.recording.clips[0], toSource(ps, shownTime)?.t ?? 0);
  const undoButton = (
    <Button type="button" variant="outline" onClick={undo} disabled={!history.length}>
      <Undo2 /> Undo
    </Button>
  );

  return (
    <TooltipProvider>
      <main className="flex h-dvh flex-col overflow-hidden" data-mode={edit ? "timeline" : "review"}>
        <TopBar
          actions={
            <>
              {!edit && undoButton}
              {edit ? (
                <Button asChild variant="outline">
                  <Link href={`/review?recording=${recordingId}`}>Back to Review</Link>
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/review?recording=${recordingId}&edit=1`}>
                    <Pencil /> Edit on Timeline
                  </Link>
                </Button>
              )}
              <Exporter recordingId={recordingId} />
            </>
          }
        >
          <h1 className="truncate text-sm font-medium">{name}</h1>
          <span className="shrink-0 text-xs text-muted-foreground">
            Edited length <strong className="text-foreground" data-testid="edited-duration">{secs(total)}</strong> s
          </span>
          <span className="shrink-0 text-xs text-muted-foreground" data-testid="save-state">{saving ? "Saving…" : "All changes saved"}</span>
          {(status || wantsTranscript) && <span role="status" className="shrink-0 text-xs text-muted-foreground">{status || captionStatus || "Generating captions…"}</span>}
          {error && <span role="alert" className="shrink-0 text-xs text-destructive">{error}</span>}
        </TopBar>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <Panel className="p-3">
              <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} aria-label="Preview" className="mx-auto block max-h-[50dvh] w-full rounded-lg bg-black object-contain" />
              {data.clips.map((c) => (
                <video
                  key={c.log.clipId}
                  ref={(v) => void (v ? videosRef.current.set(c.log.clipId, v) : videosRef.current.delete(c.log.clipId))}
                  src={urls.get(c.log.clipId)}
                  preload="auto"
                  playsInline
                  hidden
                />
              ))}
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" size="icon" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
                  {playing ? <Pause /> : <Play />}
                </Button>
                <RangeInput
                  aria-label="Playhead"
                  min={0}
                  max={Math.max(1, Math.round(total))}
                  step={10}
                  value={Math.round(shownTime)}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm tabular-nums" data-testid="preview-time">
                  {secs(shownTime)} / {secs(total)} s
                </span>
              </div>
            </Panel>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-1">
              <div className="flex items-center gap-2">
                <Switch id="trim-dead-air" checked={edits.trimDeadAir} onCheckedChange={(v) => set({ trimDeadAir: v })} />
                <Label htmlFor="trim-dead-air">Trim dead air</Label>
                <span className="text-xs text-muted-foreground">{edits.deadAir === null ? "Finding dead air…" : `${secs(deadAirMs)} s of silence found`}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="show-captions" checked={edits.captions.enabled} onCheckedChange={(v) => set({ captions: { ...edits.captions, enabled: v } })} />
                <Label htmlFor="show-captions">Show captions</Label>
                {captionFiles && (
                  <span className="text-xs text-muted-foreground" data-testid="caption-cues" data-count={cues.length}>
                    {cues.length} {cues.length === 1 ? "cue" : "cues"}
                  </span>
                )}
              </div>
            </div>

            {edit && (
              <Panel className="grid gap-3 p-3">
                <div role="toolbar" aria-label="Timeline tools" className="flex flex-wrap items-center gap-1.5">
                  <Tool label="Split at playhead" icon={<Scissors />} onClick={() => apply(split(edits, playhead))} />
                  <Tool label="Delete range" icon={<Eraser />} onClick={() => apply(deleteRange(edits, range[0], range[1]))} />
                  <Tool label="Layout at playhead" icon={<LayoutTemplate />} onClick={() => setTab("layout")} />
                  <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Gauge className="size-4" aria-hidden />
                        <NativeSelect aria-label="Speed" value={seg?.speed ?? 1} onChange={(e) => apply(setSpeed(edits, selected, Number(e.target.value)))}>
                          {SPEEDS.map((s) => (
                            <option key={s} value={s}>
                              {s}x
                            </option>
                          ))}
                        </NativeSelect>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Speed of the selected part</TooltipContent>
                  </Tooltip>
                  {selected > 0 && seg && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Blend className="size-4" aria-hidden />
                          <NativeSelect aria-label="Transition" value={seg.transition} onChange={(e) => apply(setTransition(edits, selected, e.target.value as ClipTransition))}>
                            {CLIP_TRANSITIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </NativeSelect>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Transition into the selected part</TooltipContent>
                    </Tooltip>
                  )}
                  <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                  <Tool label="Undo" icon={<Undo2 />} onClick={undo} disabled={!history.length} />
                  <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    Range (s)
                    <Input type="number" aria-label="Range start" step={0.1} min={0} value={secs(range[0])} onChange={(e) => setRange([Number(e.target.value) * 1000, range[1]])} className="h-8 w-20" />
                    to
                    <Input type="number" aria-label="Range end" step={0.1} min={0} value={secs(range[1])} onChange={(e) => setRange([range[0], Number(e.target.value) * 1000])} className="h-8 w-20" />
                  </div>
                </div>
                <Timeline data={data} edits={edits} total={total} playhead={shownTime} selected={selected} onSeek={seek} onSelect={setSelected} />
                {seg && (
                  <div role="group" aria-label="Selected part" className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">
                      Part {selected + 1}: Clip {clipNo(seg.clipId)}, {secs(seg.start)}–{secs(seg.end)} s
                    </span>
                    <label className="flex items-center gap-1.5 text-muted-foreground">
                      Trim start
                      <Input type="number" aria-label="Trim start" step={0.1} value={secs(seg.start)} onChange={(e) => apply(trim(edits, selected, Number(e.target.value) * 1000, seg.end, durationOf(seg.clipId)))} className="h-8 w-20" />
                    </label>
                    <label className="flex items-center gap-1.5 text-muted-foreground">
                      Trim end
                      <Input type="number" aria-label="Trim end" step={0.1} value={secs(seg.end)} onChange={(e) => apply(trim(edits, selected, seg.start, Number(e.target.value) * 1000, durationOf(seg.clipId)))} className="h-8 w-20" />
                    </label>
                  </div>
                )}
              </Panel>
            )}
          </div>

          <aside className="w-80 shrink-0 overflow-y-auto border-l bg-sidebar p-4 text-sidebar-foreground">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid h-8 w-full grid-cols-5">
                {["background", "camera", "audio", "captions", "layout"].map((t) => (
                  <TabsTrigger key={t} value={t} className="px-1 text-xs capitalize">
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="background" className="grid gap-4 pt-2">
                <Section title="Background">
                  <SwatchRow
                    label="Background"
                    value={edits.frame.background}
                    options={BACKGROUNDS.map((b) => ({ value: b, fill: swatchFill(b) }))}
                    onChange={(b) => set({ frame: { ...edits.frame, background: b } })}
                  />
                </Section>
                <Section title="Padding">
                  <RangeInput aria-label="Padding" min={0} max={MAX_PADDING} value={edits.frame.padding} onChange={(e) => set({ frame: { ...edits.frame, padding: Number(e.target.value) } })} />
                </Section>
                <Section title="Shadow">
                  <RangeInput aria-label="Shadow" min={0} max={MAX_SHADOW} value={edits.frame.shadow} onChange={(e) => set({ frame: { ...edits.frame, shadow: Number(e.target.value) } })} />
                </Section>
                <Section title="Corners">
                  <RangeInput aria-label="Corners" min={0} max={MAX_CORNERS} value={edits.frame.corners ?? 20} onChange={(e) => set({ frame: { ...edits.frame, corners: Number(e.target.value) } })} />
                </Section>
              </TabsContent>

              <TabsContent value="camera" className="grid gap-4 pt-2">
                <Section title="Layout">
                  <p className="text-sm">
                    At the playhead: <strong>{here}</strong>
                  </p>
                  <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setTab("layout")}>
                    Change the Layout
                  </Button>
                </Section>
              </TabsContent>

              <TabsContent value="audio" className="grid gap-4 pt-2">
                <Section title="Clean up">
                  <div className="flex items-center gap-2">
                    <Switch id="enhance-audio" checked={edits.enhanceAudio} onCheckedChange={(v) => set({ enhanceAudio: v })} />
                    <Label htmlFor="enhance-audio">Noise reduction and levelling</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">{edits.enhanceAudio ? "On: applied when you export." : "Off: the Microphone is exported as recorded."}</p>
                </Section>
              </TabsContent>

              <TabsContent value="captions" className="grid gap-4 pt-2">
                <Section title="Style">
                  <SegmentedRow
                    label="Caption style"
                    value={edits.captions.style}
                    options={CAPTION_STYLES.map((s) => ({ value: s, label: CAPTION_LOOKS[s].name }))}
                    onChange={(style) => set({ captions: { ...edits.captions, style } })}
                  />
                </Section>
                <Section title="Position">
                  <SegmentedRow
                    label="Caption position"
                    value={edits.captions.position}
                    options={CAPTION_POSITIONS.map((p) => ({ value: p, label: p }))}
                    onChange={(position) => set({ captions: { ...edits.captions, position } })}
                  />
                </Section>
                <Section title="Caption files">
                  {captionFiles ? (
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <a href={captionFiles.srt} download="flowcam.srt">
                          <Download /> Download SRT
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={captionFiles.vtt} download="flowcam.vtt">
                          <Download /> Download VTT
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No Transcript yet.</p>
                  )}
                </Section>
              </TabsContent>

              <TabsContent value="layout" className="grid gap-4 pt-2">
                <Section title="Layout from the playhead on">
                  <div className="flex items-center gap-2">
                    <NativeSelect aria-label="Layout" value={layoutChoice} onChange={(e) => setLayoutChoice(e.target.value as Layout | "auto")} className="flex-1">
                      <option value="auto">Follow the Steps</option>
                      {LAYOUTS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button type="button" onClick={() => apply(setLayout(edits, playhead, layoutChoice))}>
                      Set Layout
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {edits.layouts.length} Layout {edits.layouts.length === 1 ? "change" : "changes"} on the Timeline.
                  </p>
                </Section>
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </main>
    </TooltipProvider>
  );
}

/** A background's swatch colour: a plain colour or the gradient it is drawn with. */
function swatchFill(b: Edits["frame"]["background"]) {
  const f = BACKGROUND_FILLS[b];
  return typeof f === "string" ? f : `linear-gradient(135deg, ${f[0]}, ${f[1]})`;
}

/** An icon button with a tooltip; its aria-label is the tooltip's text. */
function Tool({ label, icon, ...props }: { label: string; icon: React.ReactNode } & Omit<React.ComponentProps<typeof Button>, "children">) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} {...props}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Clips in order as rounded blocks, each Step pinned where it was advanced, with a draggable playhead. */
function Timeline(props: {
  data: EditableRecording;
  edits: Edits;
  total: number;
  playhead: number;
  selected: number;
  onSeek: (t: number) => void;
  onSelect: (segment: number) => void;
}) {
  const { data, edits, total, playhead, selected } = props;
  const ps = pieces(edits);
  const dragging = useRef(false);
  const pct = (t: number) => `${(t / Math.max(total, 1)) * 100}%`;
  const steps = data.clips.flatMap((c) =>
    c.log.events.flatMap((ev) => {
      if (ev.type !== "step") return [];
      const at = markAt(ps, c.log.clipId, ev.t);
      return at === null ? [] : [{ at, index: ev.index }];
    }),
  );
  const layouts = edits.layouts.flatMap((l) => {
    const at = markAt(ps, l.clipId, l.t);
    return at === null ? [] : [{ at, layout: l.layout }];
  });
  const seekTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    props.onSeek(((e.clientX - r.left) / r.width) * total);
  };
  return (
    <div
      aria-label="Timeline"
      role="group"
      className="relative h-28 cursor-pointer touch-none rounded-lg bg-muted/60 select-none"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        const part = (e.target as HTMLElement).closest<HTMLElement>("[data-segment]");
        if (part) props.onSelect(Number(part.dataset.segment));
        seekTo(e);
      }}
      onPointerMove={(e) => dragging.current && seekTo(e)}
      onPointerUp={() => void (dragging.current = false)}
      onPointerCancel={() => void (dragging.current = false)}
    >
      {ps.map((p, i) => (
        <button
          key={i}
          type="button"
          data-testid="timeline-part"
          data-segment={p.segment}
          aria-pressed={p.segment === selected}
          title={`Clip ${data.recording.clips.indexOf(p.clipId) + 1}, ${p.speed}x`}
          // Pointer clicks are handled by the track (it must own the drag); this is for Enter and Space.
          onClick={(e) => e.detail === 0 && props.onSelect(p.segment)}
          style={{ left: pct(p.at), width: pct(p.length) }}
          className={cn(
            "absolute top-2 flex h-12 items-center gap-1 overflow-hidden rounded-lg border px-2 text-left text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            data.recording.clips.indexOf(p.clipId) % 2 ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground",
            p.segment === selected ? "border-2 border-primary" : "border-border",
            p.transition === "fade" && "border-l-8 border-l-foreground",
          )}
        >
          Clip {data.recording.clips.indexOf(p.clipId) + 1}
          {p.speed !== 1 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1.5 py-0.5">
              <Gauge className="size-3" aria-hidden />
              {p.speed}x
            </span>
          )}
        </button>
      ))}
      {steps.map((s, i) => (
        <span
          key={i}
          data-testid="timeline-step"
          title={`Step ${s.index}`}
          style={{ left: pct(s.at) }}
          className="pointer-events-none absolute top-16 inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground"
        >
          <Flag className="size-3" aria-hidden />
          Step {s.index}
        </span>
      ))}
      {layouts.map((l, i) => (
        <span key={i} title={`Layout: ${l.layout}`} style={{ left: pct(l.at) }} className="pointer-events-none absolute top-[88px] inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground">
          <Diamond className="size-3" aria-hidden /> {l.layout}
        </span>
      ))}
      <div style={{ left: pct(Math.min(playhead, total)) }} className="pointer-events-none absolute inset-y-0 w-0.5 bg-destructive">
        <span className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full bg-destructive" />
      </div>
    </div>
  );
}
