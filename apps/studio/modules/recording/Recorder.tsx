"use client";

import { BOARD_HEIGHT, BOARD_WIDTH, LOG_SCHEMA_VERSION, viewAt, type ClipLog, type LogEvent, type Presentation, type TimedPoint } from "@flowcam/domain";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { startClipCapture, type ClipCapture } from "./clip";
import { boardRenderer as renderer } from "@flowcam/renderer";
import { clampStep, finishLog, POINTER_INTERVAL_MS, toBoardUnits, transition, type Command, type Phase } from "./session";
import { deleteClip, loadPresentation, openClipMedia, writeClipLog, writeRecording, type RecordingManifest } from "./storage";

interface LiveClip {
  id: string;
  startStep: number;
  capture: ClipCapture;
  startedAt: number;
  /** Stamped with absolute `performance.now()`; rebased onto the media timeline when the Clip ends. */
  events: LogEvent[];
  stroke: TimedPoint[] | null;
  lastPointerAt: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function Recorder() {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("preflight");
  const [count, setCount] = useState(0);
  const [inkOn, setInkOn] = useState(false);
  const [step, setStep] = useState(0);
  const [clipId, setClipId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLMeterElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  // Mutable session state read by key handlers and the draw loop without re-rendering.
  const s = useRef({
    phase: "preflight" as Phase,
    busy: false,
    step: 0,
    ink: false,
    manifest: null as RecordingManifest | null,
    clip: null as LiveClip | null,
    lastClip: null as { id: string; startStep: number } | null,
  }).current;

  const board = presentation?.boards[0];

  // Load the Presentation and open the Camera and Microphone.
  useEffect(() => {
    let live = true;
    let opened: MediaStream | null = null;
    loadPresentation().then((p) => live && setPresentation(p), (e) => live && setError(`Could not load the Presentation: ${e}`));
    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }).then(
      (m) => (live ? setStream((opened = m)) : m.getTracks().forEach((t) => t.stop())),
      (e) => live && setError(`Camera or microphone unavailable: ${e}`),
    );
    return () => {
      live = false;
      opened?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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

  // Presenter View: draw viewAt(board, log, now) every frame, the same path the export takes.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !board) return;
    let frame = requestAnimationFrame(function draw() {
      const now = performance.now();
      const clip = s.clip;
      const log: ClipLog = {
        version: LOG_SCHEMA_VERSION,
        clipId: clip?.id ?? "",
        boardId: board.id,
        startStep: clip?.startStep ?? s.step,
        durationMs: 0,
        events: clip?.events ?? [],
      };
      renderer.render(ctx, board, viewAt(board, log, now), clip ? now - clip.startedAt : 0);
      if (timerRef.current) timerRef.current.textContent = clock(clip ? now - clip.startedAt : 0);
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [board, phase, s]);

  function go(next: Phase) {
    s.phase = next;
    setPhase(next);
  }

  function setStepTo(index: number) {
    s.step = index;
    setStep(index);
  }

  async function countdown() {
    go("countdown");
    for (let n = 3; n > 0; n--) {
      setCount(n);
      await sleep(1000);
    }
  }

  async function beginClip(startStep: number) {
    const manifest = s.manifest!;
    setStepTo(startStep);
    await countdown();
    const id = crypto.randomUUID();
    const capture = await startClipCapture(stream!, await openClipMedia(manifest.id, id), (e) => setError(`Recording failed: ${e}`));
    s.clip = { id, startStep, capture, startedAt: performance.now(), events: [], stroke: null, lastPointerAt: -Infinity };
    setClipId(id);
    go("recording");
  }

  async function endClip() {
    const clip = s.clip!;
    const manifest = s.manifest!;
    s.clip = null;
    const { mediaStartMs, endMs } = await clip.capture.finish();
    await writeClipLog(manifest.id, finishLog({ clipId: clip.id, boardId: manifest.boardId, startStep: clip.startStep, events: clip.events }, mediaStartMs, endMs));
    manifest.clips.push(clip.id);
    await writeRecording(manifest);
    s.lastClip = { id: clip.id, startStep: clip.startStep };
  }

  /** Discards the current Clip (or, when paused, the last one) and records it again from its first Step. */
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
    await beginClip(target.startStep);
  }

  async function run(cmd: Command) {
    if (s.busy || !presentation || !board || !stream || !transition(s.phase, cmd)) return;
    if (cmd === "retake" && !s.clip && !s.lastClip) return;
    s.busy = true;
    try {
      if (cmd === "start") {
        if (!s.manifest) {
          s.manifest = { version: 1, id: crypto.randomUUID(), presentationId: presentation.id, boardId: board.id, createdAt: new Date().toISOString(), clips: [] };
          await writeRecording(s.manifest);
        }
        await beginClip(s.step);
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

  // Keys: arrows step, I toggles Ink, Space pauses or resumes, R retakes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const recording = s.phase === "recording" && !s.busy;
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && recording && board) {
        e.preventDefault();
        const index = clampStep(s.step + (e.key === "ArrowRight" ? 1 : -1), board.steps.length);
        if (index !== s.step) {
          setStepTo(index);
          log({ t: performance.now(), type: "step", index });
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

  function boardPoint(e: PointerEvent<HTMLCanvasElement>) {
    return toBoardUnits(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
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

  const cameraRef = (el: HTMLVideoElement | null) => {
    if (el && el.srcObject !== stream) el.srcObject = stream;
  };

  if (phase === "done") {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui" }} data-phase={phase}>
        <h1>Recording saved</h1>
        <p>
          Recording <code data-testid="recording-id">{recordingId}</code> is in this browser&apos;s storage.
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
          {presentation ? `Presenting “${presentation.title}”.` : "Loading the Presentation…"} Keys: → next Step, ← previous Step, I Ink,
          Space pause, R Retake.
        </p>
        <button type="button" onClick={() => void run("start")} disabled={!stream || !presentation}>
          Start
        </button>
      </main>
    );
  }

  return (
    <main data-phase={phase} data-clip-id={clipId ?? undefined} style={{ fontFamily: "system-ui", background: "#222", minHeight: "100vh", color: "#fff" }}>
      <div style={{ position: "relative" }}>
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
        <video ref={cameraRef} autoPlay muted playsInline aria-label="Camera" style={{ position: "absolute", top: 12, right: 12, width: 200, borderRadius: 8, background: "#000" }} />
        {phase === "countdown" && (
          <div aria-live="assertive" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 160, background: "rgba(0,0,0,.4)" }}>
            {count}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center", padding: 12 }}>
        <span>{phase === "recording" ? "● Recording" : phase === "paused" ? "Paused (Space to resume)" : "Starting…"}</span>
        <span ref={timerRef} aria-label="Clip time">0:00</span>
        <span>
          Step {step} of {board?.steps.length ?? 0}
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
