import type { Board } from "./model";

/** Version of the Presentation log format; bump on any breaking change (ADR 0002). */
export const LOG_SCHEMA_VERSION = 1;

/** A point in Board units with its time in ms from the Clip's start. */
export type TimedPoint = [x: number, y: number, t: number];

/** Every `t` is ms from the Clip's start, read from the Recording clock, never the wall clock. */
export type LogEvent =
  | { t: number; type: "step"; index: number }
  | { t: number; type: "ink"; id: string; points: TimedPoint[] }
  | { t: number; type: "inkClear" }
  | { t: number; type: "pointer"; x: number; y: number };

/** The Presentation Track of one Clip. Events are sorted by `t`. */
export interface ClipLog {
  version: typeof LOG_SCHEMA_VERSION;
  clipId: string;
  boardId: string;
  /** Number of Steps already shown when the Clip began. */
  startStep: number;
  durationMs: number;
  events: LogEvent[];
}

/** Everything the renderer needs to draw a Board at one moment. */
export interface BoardView {
  /** Number of Steps shown. */
  stepIndex: number;
  /** Visible Element ids, mapped to the Clip time they appeared; -Infinity if visible from the start. */
  revealedAt: ReadonlyMap<string, number>;
  /** Arrow ids whose Flow is on. */
  flowing: ReadonlySet<string>;
  /** Ink strokes, cut to the points drawn by now. */
  ink: { id: string; points: TimedPoint[] }[];
  pointer: { x: number; y: number } | null;
}

/**
 * The single source of what is on screen: Presenter View and export both draw `viewAt`,
 * so the exported video matches what was presented.
 */
export function viewAt(board: Board, log: ClipLog, tMs: number): BoardView {
  // Clip time each shown Step appeared; Steps shown before the Clip are -Infinity.
  const shownAt: number[] = Array(Math.min(log.startStep, board.steps.length)).fill(-Infinity);
  let ink: BoardView["ink"] = [];
  let pointer: BoardView["pointer"] = null;

  for (const ev of log.events) {
    if (ev.t > tMs) break;
    switch (ev.type) {
      case "step": {
        const index = Math.max(0, Math.min(ev.index, board.steps.length));
        while (shownAt.length > index) shownAt.pop();
        while (shownAt.length < index) shownAt.push(ev.t);
        ink = []; // Ink clears on the next Step.
        break;
      }
      case "ink":
        ink.push({ id: ev.id, points: ev.points.filter((p) => p[2] <= tMs) });
        break;
      case "inkClear":
        ink = [];
        break;
      case "pointer":
        pointer = { x: ev.x, y: ev.y };
        break;
    }
  }

  const revealedAt = new Map<string, number>();
  const revealedByStep = new Set(board.steps.flatMap((s) => (s.kind === "reveal" ? s.elementIds : [])));
  for (const el of board.elements) if (!revealedByStep.has(el.id)) revealedAt.set(el.id, -Infinity);

  const flowing = new Set(board.elements.filter((el) => el.type === "arrow" && el.flowEnabled).map((el) => el.id));
  shownAt.forEach((at, i) => {
    const step = board.steps[i];
    if (step.kind === "reveal") for (const id of step.elementIds) revealedAt.set(id, at);
    else if (step.on) flowing.add(step.arrowId);
    else flowing.delete(step.arrowId);
  });

  return { stepIndex: shownAt.length, revealedAt, flowing, ink, pointer };
}
