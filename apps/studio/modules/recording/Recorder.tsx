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
import { useEffect, useRef, useState, type PointerEvent } from "react";
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextRef = useRef<HTMLCanvasElement>(null);
  const promptRef = useRef<HTMLElement>(null);
  const meterRef = useRef<HTMLMeterElement>(null);
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
    let opened: MediaStream | null = null;
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
    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }).then(
      (m) => (live ? setStream((opened = m)) : m.getTracks().forEach((t) => t.stop())),
      (e) => live && setError(`Camera or microphone unavailable: ${e}`),
    );
    return () => {
      live = false;
      opened?.getTracks().forEach((t) => t.stop());
    };
  }, [s]);

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
      if (meterRef.current) meterRef.current.value = Math.min(1, rms * 4);
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
    await writeClipLog(manifest.id, finishLog({ clipId: clip.id, startBoard: clip.startBoard, startStep: clip.startStep, events: clip.events }, mediaStartMs, endMs));
    manifest.clips.push(clip.id);
    await writeRecording(manifest);
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
        s.ink = !s.ink;
        setInkOn(s.ink);
      } else if (e.key === " ") {
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
      <main style={{ padding: 32, fontFamily: "system-ui" }} data-phase={phase}>
        <h1>Recording saved</h1>
        <p>
          Recording <code data-testid="recording-id">{recordingId}</code> is in this browser&apos;s storage.
        </p>
        <p>
          <a href={`/review?recording=${recordingId}`}>Review and export</a>
        </p>
      </main>
    );
  }

  if (phase === "preflight") {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 720 }} data-phase={phase}>
        <h1>Ready to record</h1>
        {error && <p role="alert">{error}</p>}
        <video ref={cameraRef} autoPlay muted playsInline aria-label="Camera preview" style={{ width: "100%", background: "#000", borderRadius: 8 }} />
        <p>
          <label>
            Microphone level <meter ref={meterRef} min={0} max={1} low={0.05} high={0.9} value={0} style={{ width: 240 }} />
          </label>
        </p>
        <p>
          {presentation ? `Presenting “${presentation.title}”.` : "Loading the Presentation…"} Keys: → next Step (then the next Board), ← previous
          Step, I Ink, Space pause, R Retake.
        </p>
        <button type="button" onClick={() => void run("start")} disabled={!stream || !presentation}>
          Start
        </button>
      </main>
    );
  }

  const boards = presentation?.boards ?? [];
  const script = nav?.script;
  const nextLine = !nav?.next
    ? "End of the Presentation"
    : (nav.next.step?.script?.split("\n").find((l) => l.trim()) ?? (nav.next.view.boardIndex !== nav.board ? `Board ${nav.next.view.boardIndex + 1}` : "No Script"));

  return (
    <main data-phase={phase} data-clip-id={clipId ?? undefined} style={{ fontFamily: "system-ui", background: "#222", minHeight: "100vh", color: "#fff" }}>
      <div style={{ display: "flex", gap: 12, padding: 12, alignItems: "flex-start" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <canvas
            ref={canvasRef}
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            aria-label="Board"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ display: "block", width: "100%", touchAction: "none", cursor: inkOn ? "crosshair" : "default" }}
          />
          {phase === "countdown" && (
            <div aria-live="assertive" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 160, background: "rgba(0,0,0,.4)" }}>
              {count}
            </div>
          )}
        </div>
        {/* Presenter-only aids: never drawn on the Board canvas, logged or recorded. */}
        <aside style={{ width: 340, flex: "none", display: "grid", gap: 12 }}>
          <video ref={cameraRef} autoPlay muted playsInline aria-label="Camera" style={{ width: "100%", borderRadius: 8, background: "#000" }} />
          <section
            ref={promptRef}
            aria-label="Teleprompter"
            style={{ height: 230, overflow: "hidden", fontSize: 30, lineHeight: 1.35, whiteSpace: "pre-wrap", background: "#111", borderRadius: 8, padding: "8px 12px" }}
          >
            {script?.trim() ? script : <span style={{ opacity: 0.4, fontSize: 18 }}>No Script for this Step</span>}
          </section>
          <figure style={{ margin: 0, fontSize: 14 }}>
            <figcaption style={{ marginBottom: 4, opacity: 0.8 }}>Next: {nextLine}</figcaption>
            <canvas ref={nextRef} width={320} height={180} aria-label="Next Step preview" style={{ display: "block", width: "100%", borderRadius: 4, background: "#000" }} />
          </figure>
        </aside>
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center", padding: "0 12px 12px" }}>
        <span>{phase === "recording" ? "● Recording" : phase === "paused" ? "Paused (Space to resume)" : "Starting…"}</span>
        <span ref={timerRef} aria-label="Clip time">
          0:00
        </span>
        <span>
          Board {(nav?.board ?? 0) + 1} of {boards.length} · Step {nav?.step ?? 0} of {boards[nav?.board ?? 0]?.steps.length ?? 0}
        </span>
        <span>Ink {inkOn ? "on" : "off"}</span>
        {error && <span role="alert">{error}</span>}
        <button type="button" onClick={() => void run("stop")} disabled={phase === "countdown"} style={{ marginLeft: "auto" }}>
          Stop
        </button>
      </div>
    </main>
  );
}
