import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LOG_SCHEMA_VERSION,
  presentationViewAt,
  type ClipLog,
  type LogEvent,
  type Presentation,
  type PresentationView,
  type Step,
} from "@flowcam/domain";

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

export type Move = { type: "step"; index: number } | { type: "board"; index: number };

/**
 * What → (dir 1) or ← (dir -1) logs: the next or previous Step on this Board, else a move to the next or previous
 * Board (which shows the Steps `presentationViewAt` kept for it); null at either end of the Presentation.
 */
export function navigate(presentation: Presentation, pv: PresentationView, dir: 1 | -1): Move | null {
  const step = pv.view.stepIndex + dir;
  if (step >= 0 && step <= presentation.boards[pv.boardIndex].steps.length) return { type: "step", index: step };
  const board = pv.boardIndex + dir;
  return board >= 0 && board < presentation.boards.length ? { type: "board", index: board } : null;
}

/** The Step being presented: the latest shown on the current Board, or null before its first Step. */
export const currentStep = (presentation: Presentation, pv: PresentationView): Step | null =>
  presentation.boards[pv.boardIndex].steps[pv.view.stepIndex - 1] ?? null;

/** Next-Step preview: the view after the next →, and the Step it presents; null at the end. */
export function upcoming(presentation: Presentation, log: ClipLog): { view: PresentationView; step: Step | null } | null {
  const move = navigate(presentation, presentationViewAt(presentation, log, Infinity), 1);
  if (!move) return null;
  const view = presentationViewAt(presentation, { ...log, events: [...log.events, { ...move, t: log.events.at(-1)?.t ?? 0 }] }, Infinity);
  return { view, step: currentStep(presentation, view) };
}

export { boardArea } from "../export/geometry";

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
