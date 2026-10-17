import { BOARD_HEIGHT, BOARD_WIDTH, LOG_SCHEMA_VERSION, type ClipLog, type LogEvent } from "@flowcam/domain";

// Pure rules of a Presented Recording, kept apart from the browser APIs so they can be unit tested.

export type Phase = "preflight" | "countdown" | "recording" | "paused" | "done";
export type Command = "start" | "pause" | "retake" | "stop";

/** The phase a command leads to, or null if it is ignored in this phase. Countdown always ends in "recording". */
export function transition(phase: Phase, cmd: Command): Phase | null {
  const live = phase === "recording" || phase === "paused";
  switch (cmd) {
    case "start":
      return phase === "preflight" || phase === "paused" ? "countdown" : null;
    case "pause":
      return phase === "recording" ? "paused" : null;
    case "retake":
      return live ? "countdown" : null;
    case "stop":
      return live ? "done" : null;
  }
}

/** A Step index is the number of Steps shown: 0 to steps.length. */
export const clampStep = (index: number, stepCount: number) => Math.max(0, Math.min(index, stepCount));

/** Pointer events are logged at most about 30 times a second. */
export const POINTER_INTERVAL_MS = 1000 / 30;

/** Client coordinates over an element showing the Board, in Board units. */
export function toBoardUnits(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return {
    x: ((clientX - rect.left) / rect.width) * BOARD_WIDTH,
    y: ((clientY - rect.top) / rect.height) * BOARD_HEIGHT,
  };
}

/**
 * Turns events stamped with absolute `performance.now()` times into a ClipLog whose t=0 is the Clip's first media
 * sample (`mediaStartMs`, on the same clock). Anything logged before that sample lands at t=0.
 */
export function finishLog(
  clip: { clipId: string; startBoard: number; startStep: number; events: LogEvent[] },
  mediaStartMs: number,
  endMs: number,
): ClipLog {
  const at = (t: number) => Math.max(0, Math.round((t - mediaStartMs) * 10) / 10);
  const events = clip.events
    .map((ev): LogEvent => (ev.type === "ink" ? { ...ev, t: at(ev.t), points: ev.points.map(([x, y, t]) => [x, y, at(t)]) } : { ...ev, t: at(ev.t) }))
    .sort((a, b) => a.t - b.t);
  return {
    version: LOG_SCHEMA_VERSION,
    clipId: clip.clipId,
    startBoard: clip.startBoard,
    startStep: clip.startStep,
    durationMs: at(endMs),
    events,
  };
}
