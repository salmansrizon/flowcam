import type { Board, Layout, Presentation, Rect, Transition } from "./model";

/**
 * Version of the Presentation log format; bump on any breaking change (ADR 0002).
 * v2 records the Board as an index into the Presentation, so a Clip can move between Boards.
 */
export const LOG_SCHEMA_VERSION = 2;

/** A point in Board units with its time in ms from the Clip's start. */
export type TimedPoint = [x: number, y: number, t: number];

/** Every `t` is ms from the Clip's start, read from the Recording clock, never the wall clock. */
export type LogEvent =
  /** Number of Steps shown on the current Board. */
  | { t: number; type: "step"; index: number }
  /** Moves to another Board. */
  | { t: number; type: "board"; index: number }
  | { t: number; type: "ink"; id: string; points: TimedPoint[] }
  | { t: number; type: "inkClear" }
  | { t: number; type: "pointer"; x: number; y: number };

/** The Presentation Track of one Clip. Events are sorted by `t`. */
export interface ClipLog {
  version: typeof LOG_SCHEMA_VERSION;
  clipId: string;
  /** Board shown when the Clip began. */
  startBoard: number;
  /** Number of that Board's Steps already shown when the Clip began. */
  startStep: number;
  durationMs: number;
  events: LogEvent[];
}

/** Everything the renderer needs to draw one Board at one moment. */
export interface BoardView {
  /** Number of Steps shown. */
  stepIndex: number;
  /** Visible Element ids, mapped to the Clip time they appeared; -Infinity if visible from the start. */
  revealedAt: ReadonlyMap<string, number>;
  /** Element ids revealed with the draw-on effect (drawn as strokes instead of fading in). */
  drawOn: ReadonlySet<string>;
  /** Arrow ids whose Flow is on. */
  flowing: ReadonlySet<string>;
  /** Element ids highlighted by the latest Step, with the time it was shown. */
  highlighted: ReadonlyMap<string, number>;
  /** Moved Elements: box before and after the morph, and when it started. */
  morphs: ReadonlyMap<string, { from: Rect; to: Rect; at: number }>;
  /** The visible area (null: the whole Board), animating from `from` since `at`. */
  focus: { from: Rect | null; to: Rect | null; at: number };
  layout: Layout;
  /** Ink strokes, cut to the points drawn by now. */
  ink: { id: string; points: TimedPoint[] }[];
  pointer: { x: number; y: number } | null;
}

/** What the whole Presentation shows at one moment. */
export interface PresentationView {
  boardIndex: number;
  view: BoardView;
  /** The latest Board change in this Clip, with the Board it left; renderers animate it briefly. */
  transition: { from: number; fromView: BoardView; at: number; kind: Transition } | null;
}

/** Builds a Board's view from the Clip times its shown Steps appeared. */
export function boardView(
  board: Board,
  shownAt: readonly number[],
  ink: BoardView["ink"] = [],
  pointer: BoardView["pointer"] = null,
): BoardView {
  const revealedAt = new Map<string, number>();
  const drawOn = new Set<string>();
  const revealedByStep = new Set(board.steps.flatMap((s) => (s.kind === "reveal" ? s.elementIds : [])));
  for (const el of board.elements) if (!revealedByStep.has(el.id)) revealedAt.set(el.id, -Infinity);

  const flowing = new Set(board.elements.filter((el) => el.type === "arrow" && el.flowEnabled).map((el) => el.id));
  const highlighted = new Map<string, number>();
  const morphs = new Map<string, { from: Rect; to: Rect; at: number }>();
  const box = (id: string): Rect => {
    const m = morphs.get(id);
    if (m) return m.to;
    const el = board.elements.find((e) => e.id === id);
    return el ? { x: el.x, y: el.y, width: el.width, height: el.height } : { x: 0, y: 0, width: 0, height: 0 };
  };
  let focus: BoardView["focus"] = { from: null, to: null, at: -Infinity };
  let layout: Layout = "bubble";

  shownAt.forEach((at, i) => {
    const step = board.steps[i];
    if (step.layout) layout = step.layout;
    switch (step.kind) {
      case "reveal":
        for (const id of step.elementIds) {
          revealedAt.set(id, at);
          if (step.effect === "draw-on") drawOn.add(id);
        }
        break;
      case "flow":
        if (step.on) flowing.add(step.arrowId);
        else flowing.delete(step.arrowId);
        break;
      case "highlight":
        if (i === shownAt.length - 1) for (const id of step.elementIds) highlighted.set(id, at);
        break;
      case "focus":
        focus = { from: focus.to, to: step.rect, at };
        break;
      case "morph":
        morphs.set(step.elementId, { from: box(step.elementId), to: step.to, at });
        break;
    }
  });

  return { stepIndex: shownAt.length, revealedAt, drawOn, flowing, highlighted, morphs, focus, layout, ink, pointer };
}

/**
 * The single source of what is on screen: Presenter View and export both draw this,
 * so the exported video matches what was presented.
 */
export function presentationViewAt(presentation: Presentation, log: ClipLog, tMs: number): PresentationView {
  const boards = presentation.boards;
  const clampBoard = (i: number) => Math.max(0, Math.min(i, boards.length - 1));
  // Clip time each shown Step of each Board appeared. Boards before the start are fully shown.
  const shown = boards.map((b, i): number[] => {
    const start = clampBoard(log.startBoard);
    if (i < start) return Array(b.steps.length).fill(-Infinity);
    if (i === start) return Array(Math.min(log.startStep, b.steps.length)).fill(-Infinity);
    return [];
  });
  let current = clampBoard(log.startBoard);
  let ink: BoardView["ink"] = [];
  let pointer: BoardView["pointer"] = null;
  let change: { from: number; at: number } | null = null;

  for (const ev of log.events) {
    if (ev.t > tMs) break;
    switch (ev.type) {
      case "step": {
        const at = shown[current];
        const index = Math.max(0, Math.min(ev.index, boards[current].steps.length));
        while (at.length > index) at.pop();
        while (at.length < index) at.push(ev.t);
        ink = []; // Ink clears on the next Step.
        break;
      }
      case "board": {
        const next = clampBoard(ev.index);
        if (next === current) break;
        change = { from: current, at: ev.t };
        current = next;
        ink = [];
        pointer = null;
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

  return {
    boardIndex: current,
    view: boardView(boards[current], shown[current], ink, pointer),
    transition: change && {
      from: change.from,
      fromView: boardView(boards[change.from], shown[change.from]),
      at: change.at,
      kind: boards[current].transition ?? "fade",
    },
  };
}
