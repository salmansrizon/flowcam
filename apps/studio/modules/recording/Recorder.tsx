"use client";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LOG_SCHEMA_VERSION,
  presentationViewAt,
  THEMES,
  themeById,
  type ClipLog,
  type Layout,
  type LogEvent,
  type Presentation,
  type RenderEnv,
  type TimedPoint,
} from "@flowcam/domain";
import { renderFrame } from "@flowcam/renderer";
import { CheckCircle2, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Panel } from "@/components/studio/Panel";
import { TopBar } from "@/components/studio/TopBar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { composeFrame } from "../export/compose";
import { decodeImages } from "../presentation/assets";
import { startClipCapture, type ClipCapture } from "./clip";
import { boardArea, currentStep, finishLog, navigate, POINTER_INTERVAL_MS, toBoardUnits, transition, upcoming, type Command, type Phase } from "./session";
import { deleteClip, loadPresentation, openClipMedia, writeClipLog, writeRecording, type RecordingManifest } from "./storage";

interface ClipStart {
  id: string;
  startBoard: number;
  startStep: number;
}

interface LiveClip extends ClipStart {
  capture: ClipCapture;
  startedAt: number;
  /** Stamped with absolute `performance.now()`; rebased onto the media timeline when the Clip ends. */
  events: LogEvent[];
  stroke: TimedPoint[] | null;
  lastPointerAt: number;
}

/** Where the presenter is, and the next-Step preview. */
interface Nav {
  board: number;
  step: number;
  /** The current Step's Script, for the Teleprompter. */
  script: string | undefined;
  next: ReturnType<typeof upcoming>;
}

/** The Presenter View is the export's frame without padding, captions or watermark. */
const PRESENTER_FRAME = { background: "slate", padding: 0, shadow: 0 } as const;
/** The Teleprompter holds a long Script this long before it starts scrolling, then scrolls this fast. */
const PROMPT_HOLD_MS = 1500;
const PROMPT_PX_PER_MS = 0.03;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** The live Clip's log so far, or an empty one at the current place between Clips. */
function logOf(s: { clip: LiveClip | null; board: number; step: number }): ClipLog {
  const clip = s.clip;
  return {
    version: LOG_SCHEMA_VERSION,
    clipId: clip?.id ?? "",
    startBoard: clip?.startBoard ?? s.board,
    startStep: clip?.startStep ?? s.step,
    durationMs: 0,
    events: clip?.events ?? [],
  };
}

function navOf(presentation: Presentation, log: ClipLog): Nav {
  const pv = presentationViewAt(presentation, log, Infinity);
  return { board: pv.boardIndex, step: pv.view.stepIndex, script: currentStep(presentation, pv)?.script, next: upcoming(presentation, log) };
}

export function Recorder() {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("preflight");
  const [count, setCount] = useState(0);
  const [inkOn, setInkOn] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  const [imagesReady, setImagesReady] = useState(false);
  const [clipId, setClipId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState<string>();
  const [micId, setMicId] = useState<string>();
  const [summary, setSummary] = useState({ clips: 0, ms: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  // Mutable session state read by key handlers and the draw loop without re-rendering.
  const s = useRef({
    phase: "preflight" as Phase,
    busy: false,
    /** Board and Step shown, kept between Clips; the next Clip starts here. */
    board: 0,
    step: 0,
    ink: false,
    manifest: null as RecordingManifest | null,
    clip: null as LiveClip | null,
    lastClip: null as ClipStart | null,
    /** Length of each saved Clip, for the finished screen's summary. */
    durations: new Map<string, number>(),
    env: { theme: THEMES[0], images: new Map() } as RenderEnv,
    video: null as HTMLVideoElement | null,
    /** Layout last drawn, to map pointer positions onto the Board. */
    layout: "bubble" as Layout,
    /** When the Teleprompter's Script changed, to scroll it from the top. */
    promptAt: 0,
  }).current;

  // Load the Presentation and its Images, and open the Camera and Microphone.
  useEffect(() => {
    let live = true;
    loadPresentation().then(
      async (p) => {
        if (!live) return;
        const images = new Map<string, ImageBitmap>();
        s.env = { theme: themeById(p.themeId), images };
        setPresentation(p);
        setNav(navOf(p, logOf(s)));
        await decodeImages(p.boards.flatMap((b) => b.elements.flatMap((el) => (el.imageId ? [el.imageId] : []))), images);
        if (live) setImagesReady(true);
      },
      (e) => live && setError(`Could not load the Presentation: ${e}`),
    );
    return () => {
      live = false;
    };
  }, [s]);

  // Open the Camera and Microphone (the chosen ones, once a picker is used); reopen when a picker changes.
  useEffect(() => {
    let live = true;
    let opened: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, ...(camId && { deviceId: { exact: camId } }) }, audio: micId ? { deviceId: { exact: micId } } : true })
      .then(
        async (m) => {
          if (!live) return m.getTracks().forEach((t) => t.stop());
          setError(null);
          setStream((opened = m));
          // Labels (and the full list) are only available once access is granted.
          setDevices(await navigator.mediaDevices.enumerateDevices());
        },
        (e) => live && setError(`Camera or microphone unavailable: ${e}`),
      );
    return () => {
      live = false;
      opened?.getTracks().forEach((t) => t.stop());
    };
  }, [camId, micId]);


  // Pre-flight microphone level.
  useEffect(() => {
    if (!stream || phase !== "preflight") return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = requestAnimationFrame(function tick() {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
      const level = Math.min(1, rms * 4);
      const meter = meterRef.current;
      if (meter) {
        meter.setAttribute("aria-valuenow", level.toFixed(2));
        (meter.firstElementChild as HTMLElement).style.width = `${level * 100}%`;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      void ctx.close();
    };
  }, [stream, phase]);

  // Presenter View: every frame, the export's composeFrame draws presentationViewAt(presentation, live log, now) in
  // its Layout with the live Camera, and renderFrame draws the Board with Transitions, the Theme and Images.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !presentation) return;
    let frame = requestAnimationFrame(function draw() {
      const now = performance.now();
      const log = logOf(s);
      const pv = presentationViewAt(presentation, log, now);
      s.layout = pv.view.layout;
      const v = s.video;
      composeFrame(ctx, BOARD_WIDTH, BOARD_HEIGHT, {
        renderer: { render: (c, _board, _view, t) => renderFrame(c, presentation, pv, t, s.env) },
        presentation,
        log,
        tMs: now,
        camera: v && v.readyState >= 2 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null,
        layout: "auto",
        frame: PRESENTER_FRAME,
        caption: null,
        fade: 0,
        watermark: false,
      });
      if (timerRef.current) timerRef.current.textContent = clock(s.clip ? now - s.clip.startedAt : 0);
      if (promptRef.current) promptRef.current.scrollTop = Math.max(0, (now - s.promptAt - PROMPT_HOLD_MS) * PROMPT_PX_PER_MS);
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [presentation, phase, s]);

  // Next-Step preview: the Board as it will look once the next Step's animations have finished.
  useEffect(() => {
    const ctx = nextRef.current?.getContext("2d");
    if (!ctx || !presentation) return;
    ctx.setTransform(ctx.canvas.width / BOARD_WIDTH, 0, 0, ctx.canvas.height / BOARD_HEIGHT, 0, 0);
    if (nav?.next) renderFrame(ctx, presentation, nav.next.view, performance.now() + 60_000, s.env);
    else ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  }, [nav, presentation, imagesReady, phase, s]);

  function go(next: Phase) {
    s.phase = next;
    setPhase(next);
  }

  /** Refreshes the place, Teleprompter and next-Step preview from the live log. */
  function sync() {
    const n = navOf(presentation!, logOf(s));
    s.board = n.board;
    s.step = n.step;
    s.promptAt = performance.now();
    setNav(n);
  }

  async function countdown() {
    go("countdown");
    for (let n = 3; n > 0; n--) {
      setCount(n);
      await sleep(1000);
    }
  }

  async function beginClip(startBoard: number, startStep: number) {
    const manifest = s.manifest!;
    s.board = startBoard;
    s.step = startStep;
    sync();
    await countdown();
    const id = crypto.randomUUID();
    const capture = await startClipCapture(stream!, await openClipMedia(manifest.id, id), (e) => setError(`Recording failed: ${e}`));
    s.clip = { id, startBoard, startStep, capture, startedAt: performance.now(), events: [], stroke: null, lastPointerAt: -Infinity };
    setClipId(id);
    go("recording");
  }

  async function endClip() {
    const clip = s.clip!;
    const manifest = s.manifest!;
    s.clip = null;
    const { mediaStartMs, endMs } = await clip.capture.finish();
    const log = finishLog({ clipId: clip.id, startBoard: clip.startBoard, startStep: clip.startStep, events: clip.events }, mediaStartMs, endMs);
    await writeClipLog(manifest.id, log);
    manifest.clips.push(clip.id);
    await writeRecording(manifest);
    s.durations.set(clip.id, log.durationMs);
    s.lastClip = { id: clip.id, startBoard: clip.startBoard, startStep: clip.startStep };
  }

  /** Discards the current Clip (or, when paused, the last one) and records it again from where it began. */
  async function retake() {
    const manifest = s.manifest!;
    let target = s.lastClip;
    const live = s.clip;
    if (live) {
      target = live;
      s.clip = null;
      await live.capture.cancel();
    } else if (target) {
      manifest.clips = manifest.clips.filter((c) => c !== target!.id);
      s.durations.delete(target.id);
      s.lastClip = null;
    }
    if (!target) return;
    await deleteClip(manifest.id, target.id);
    await writeRecording(manifest);
    await beginClip(target.startBoard, target.startStep);
  }

  async function run(cmd: Command) {
    if (s.busy || !presentation || !stream || !transition(s.phase, cmd)) return;
    if (cmd === "retake" && !s.clip && !s.lastClip) return;
    s.busy = true;
    try {
      if (cmd === "start") {
        if (!s.manifest) {
          s.manifest = { version: 1, id: crypto.randomUUID(), presentationId: presentation.id, createdAt: new Date().toISOString(), clips: [] };
          await writeRecording(s.manifest);
        }
        await beginClip(s.board, s.step);
      } else if (cmd === "pause") {
        await endClip();
        go("paused");
      } else if (cmd === "retake") {
        await retake();
      } else {
        if (s.clip) await endClip();
        stream.getTracks().forEach((t) => t.stop());
        setRecordingId(s.manifest!.id);
        setSummary({ clips: s.manifest!.clips.length, ms: s.manifest!.clips.reduce((sum, c) => sum + (s.durations.get(c) ?? 0), 0) });
        go("done");
      }
    } catch (e) {
      // No Clip is live here (each path clears s.clip before awaiting); pausing lets the user retry or Stop.
      setError(`${e}`);
      if (s.phase !== "done") go("paused");
    } finally {
      s.busy = false;
    }
  }

  function toggleInk() {
    s.ink = !s.ink;
    setInkOn(s.ink);
  }

  function log(ev: LogEvent) {
    s.clip?.events.push(ev);
  }

  // Keys: arrows step (and cross Boards at either end), I toggles Ink, Space pauses or resumes, R retakes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      // A Clip accepts Steps and Ink as soon as it exists, even while the command that started it finishes.
      const recording = s.phase === "recording" && s.clip !== null;
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && recording && presentation) {
        e.preventDefault();
        const move = navigate(presentation, presentationViewAt(presentation, logOf(s), Infinity), e.key === "ArrowRight" ? 1 : -1);
        if (move) {
          log({ ...move, t: performance.now() });
          sync();
        }
      } else if ((e.key === "i" || e.key === "I") && recording) {
        toggleInk();
      } else if (e.key === " ") {
        // A focused button or picker keeps Space for itself.
        if ((e.target as HTMLElement).closest("button, [role=combobox]")) return;
        e.preventDefault();
        void run(s.phase === "recording" ? "pause" : "start");
      } else if (e.key === "r" || e.key === "R") {
        void run("retake");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** The pointer in Board units, wherever the current Layout puts the Board. */
  function boardPoint(e: PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const a = boardArea(s.layout);
    const [kx, ky] = [r.width / BOARD_WIDTH, r.height / BOARD_HEIGHT];
    return toBoardUnits(e.clientX, e.clientY, { left: r.left + a.x * kx, top: r.top + a.y * ky, width: a.width * kx, height: a.height * ky });
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const clip = s.clip;
    if (!clip || !s.ink) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = boardPoint(e);
    const t = performance.now();
    clip.stroke = [[x, y, t]];
    // Logged at once with a live points array, so the Presenter View draws the stroke as it grows.
    log({ t, type: "ink", id: crypto.randomUUID(), points: clip.stroke });
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const clip = s.clip;
    if (!clip) return;
    const { x, y } = boardPoint(e);
    const t = performance.now();
    if (clip.stroke) clip.stroke.push([x, y, t]);
    else if (!s.ink && t - clip.lastPointerAt >= POINTER_INTERVAL_MS) {
      clip.lastPointerAt = t;
      log({ t, type: "pointer", x, y });
    }
  }

  function onPointerUp() {
    if (s.clip) s.clip.stroke = null;
  }

  // The same <video> is the preview and the Camera source the Presenter View draws from.
  const cameraRef = (el: HTMLVideoElement | null) => {
    if (el && el.srcObject !== stream) el.srcObject = stream;
    s.video = el;
  };

  if (phase === "done") {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <main data-phase={phase} className="grid flex-1 place-items-center p-6">
          <Panel className="flex w-full max-w-md flex-col items-center gap-5 p-8 text-center">
            <CheckCircle2 aria-hidden className="size-12 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Recording saved</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Recording <code data-testid="recording-id" className="break-all font-mono text-xs text-foreground">{recordingId}</code> is in this browser&apos;s storage.
              </p>
            </div>
            <dl className="grid w-full grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Clips</dt>
                <dd className="text-2xl font-semibold tabular-nums">{summary.clips}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Length</dt>
                <dd className="text-2xl font-semibold tabular-nums">{clock(summary.ms)}</dd>
              </div>
            </dl>
            <Button asChild size="lg" className="h-11 w-full text-base">
              <a href={`/review?recording=${recordingId}`}>Review and export</a>
            </Button>
          </Panel>
        </main>
      </div>
    );
  }

  if (phase === "preflight") {
    const cams = devices.filter((d) => d.kind === "videoinput");
    const mics = devices.filter((d) => d.kind === "audioinput");
    return (
      <div className="flex min-h-screen flex-col">
        <TopBar>
          <span className="truncate text-sm text-muted-foreground">{presentation ? `Presenting “${presentation.title}”.` : "Loading the Presentation…"}</span>
        </TopBar>
        <main data-phase={phase} className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold tracking-tight">Ready to record</h1>
            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <video ref={cameraRef} autoPlay muted playsInline aria-label="Camera preview" className="aspect-video w-full rounded-lg bg-black object-cover" />
            <div className="flex items-center gap-3 text-sm">
              <span id="mic-level-label" className="shrink-0 font-medium">
                Microphone level
              </span>
              <div ref={meterRef} role="meter" aria-labelledby="mic-level-label" aria-valuemin={0} aria-valuemax={1} aria-valuenow={0} className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-0 rounded-full bg-primary" />
              </div>
            </div>
          </Panel>
          <div className="flex flex-col gap-4">
            {(cams.length > 1 || mics.length > 1) && (
              <Panel className="flex flex-col gap-3 p-4">
                {cams.length > 1 && <DevicePicker label="Camera device" devices={cams} value={camId ?? stream?.getVideoTracks()[0]?.getSettings().deviceId} onChange={setCamId} />}
                {mics.length > 1 && <DevicePicker label="Microphone device" devices={mics} value={micId ?? stream?.getAudioTracks()[0]?.getSettings().deviceId} onChange={setMicId} />}
              </Panel>
            )}
            <Panel className="p-4">
              <section aria-label="Key cheat-sheet">
                <h2 className="mb-3 text-sm font-semibold">Keys while recording</h2>
                <ul className="grid gap-2 text-sm">
                  <Hint keys={["→"]}>Next Step, then the next Board</Hint>
                  <Hint keys={["←"]}>Previous Step</Hint>
                  <Hint keys={["I"]}>Ink on or off</Hint>
                  <Hint keys={["Space"]}>Pause or resume</Hint>
                  <Hint keys={["R"]}>Retake the Clip</Hint>
                </ul>
              </section>
            </Panel>
            <Button type="button" size="lg" className="h-14 text-lg" onClick={() => void run("start")} disabled={!stream || !presentation}>
              Start
              <Key decorative>Space</Key>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const boards = presentation?.boards ?? [];
  const script = nav?.script;
  const nextLine = !nav?.next
    ? "End of the Presentation"
    : (nav.next.step?.script?.split("\n").find((l) => l.trim()) ?? (nav.next.view.boardIndex !== nav.board ? `Board ${nav.next.view.boardIndex + 1}` : "No Script"));
  const recording = phase === "recording";

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar>
        <span className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <span aria-hidden className={`size-3 rounded-full ${recording ? "bg-destructive motion-safe:animate-pulse" : "bg-muted-foreground"}`} />
          <span className={recording ? "text-destructive" : "text-muted-foreground"}>{recording ? "REC" : phase === "paused" ? "PAUSED" : "GET READY"}</span>
        </span>
      </TopBar>
      <main data-phase={phase} data-clip-id={clipId ?? undefined} className="grid flex-1 content-start items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="relative overflow-hidden p-0">
          <canvas
            ref={canvasRef}
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            aria-label="Board"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="block h-auto w-full touch-none"
            style={{ cursor: inkOn ? "crosshair" : "default" }}
          />
        </Panel>
        {/* Presenter-only aids: never drawn on the Board canvas, logged or recorded. */}
        <aside className="grid gap-3">
          <Panel className="flex items-center justify-between gap-3 p-3">
            <video ref={cameraRef} autoPlay muted playsInline aria-label="Camera" className="aspect-video w-24 rounded-md bg-black object-cover" />
            <span ref={timerRef} aria-label="Clip time" className="font-mono text-3xl font-semibold tabular-nums">
              0:00
            </span>
            <span className="flex-1 text-right text-sm text-muted-foreground">
              Board {(nav?.board ?? 0) + 1} of {boards.length} · Step {nav?.step ?? 0} of {boards[nav?.board ?? 0]?.steps.length ?? 0}
            </span>
          </Panel>
          <Panel ref={promptRef} role="region" aria-label="Teleprompter" className="h-40 overflow-hidden whitespace-pre-wrap px-4 py-3 text-3xl leading-snug">
            {script?.trim() ? script : <span className="text-lg text-muted-foreground">No Script for this Step</span>}
          </Panel>
          <Panel className="p-3">
            <figure className="m-0 text-sm">
              <figcaption className="mb-2 truncate font-medium">Next: {nextLine}</figcaption>
              <canvas ref={nextRef} width={320} height={180} aria-label="Next Step preview" className="block w-full rounded-md bg-muted" />
            </figure>
          </Panel>
          <Panel className="flex flex-wrap items-center gap-2 p-3">
            <Button type="button" variant="outline" onClick={() => void run(recording ? "pause" : "start")} disabled={phase === "countdown"}>
              {recording ? <Pause aria-hidden /> : <Play aria-hidden />}
              {recording ? "Pause" : "Resume"}
              <Key decorative>Space</Key>
            </Button>
            <Button type="button" variant="outline" onClick={() => void run("retake")} disabled={phase === "countdown"}>
              <RotateCcw aria-hidden />
              Retake
              <Key decorative>R</Key>
            </Button>
            <Button type="button" variant="destructive" onClick={() => void run("stop")} disabled={phase === "countdown"}>
              <Square aria-hidden />
              Stop
            </Button>
            <Toggle variant="outline" pressed={inkOn} onPressedChange={toggleInk} disabled={!recording} className="ml-auto">
              Ink {inkOn ? "on" : "off"}
              <Key decorative>I</Key>
            </Toggle>
          </Panel>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </aside>
        {phase === "countdown" && (
          <div aria-live="assertive" className="fixed inset-0 z-50 grid place-items-center bg-background/85 text-[28vmin] font-bold tabular-nums backdrop-blur-sm">
            {count}
          </div>
        )}
      </main>
    </div>
  );
}

/** Key hint, ported from Excaliflow's `.hint-key` (Apache-2.0, excaliflow/index.html): a small mono keycap. */
function Key({ children, decorative }: { children: ReactNode; decorative?: boolean }) {
  return (
    <kbd aria-hidden={decorative || undefined} className="rounded border bg-muted px-1.5 py-px font-mono text-[11px] font-medium text-foreground">
      {children}
    </kbd>
  );
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex w-14 shrink-0 gap-1">
        {keys.map((k) => (
          <Key key={k}>{k}</Key>
        ))}
      </span>
      <span>{children}</span>
    </li>
  );
}

function DevicePicker({ label, devices, value, onChange }: { label: string; devices: MediaDeviceInfo[]; value: string | undefined; onChange: (id: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {devices.map((d, i) => (
          <SelectItem key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
