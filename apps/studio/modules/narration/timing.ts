import { LOG_SCHEMA_VERSION, type Board, type ClipLog, type LogEvent, type Narration, type Presentation } from "@flowcam/domain";

// Pure logic of a Narrated Recording: which Steps play in which order, when each starts, and the ClipLog that shows
// each Step while its Narration plays.

export const MIN_SILENCE_S = 0.5;
export const MAX_SILENCE_S = 60;
export const DEFAULT_SILENCE_MS = 3000;

/** One Step of the Presentation in play order. Boards without Steps are skipped. */
export interface NarratedStep {
  board: number;
  /** Index within the Board. */
  step: number;
  narration: Narration | undefined;
}

export function narratedSteps(p: Presentation): NarratedStep[] {
  return p.boards.flatMap((b, board) => b.steps.map((s, step) => ({ board, step, narration: s.narration })));
}

/** Steps that still need a Narration, as "Board n, Step m" labels (Board omitted for a single Board). */
export function missingNarrations(p: Presentation): { board: number; step: number; label: string }[] {
  return narratedSteps(p)
    .filter((s) => !s.narration)
    .map((s) => ({ board: s.board, step: s.step, label: p.boards.length > 1 ? `Board ${s.board + 1}, Step ${s.step + 1}` : `Step ${s.step + 1}` }));
}

/** Gives every Step without a Narration `ms` of silence. */
export function fillSilence(p: Presentation, ms = DEFAULT_SILENCE_MS): Presentation {
  return {
    ...p,
    boards: p.boards.map((b) => ({ ...b, steps: b.steps.map((s) => (s.narration ? s : { ...s, narration: { kind: "silence" as const, durationMs: ms } })) })),
  };
}

/** Sets (or, with null, removes) one Step's Narration. */
export function setNarration(board: Board, i: number, narration: Narration | null): Board {
  const s = board.steps[i];
  if (!s) return board;
  const { narration: _old, ...rest } = s;
  return { ...board, steps: board.steps.map((x, j) => (j === i ? ((narration ? { ...rest, narration } : rest) as typeof s) : x)) };
}

/** Start of each Narration on the single Clip's timeline (ms), and the total. Throws if a Step has none. */
export function timeline(p: Presentation): { steps: NarratedStep[]; startsMs: number[]; totalMs: number } {
  const steps = narratedSteps(p);
  let t = 0;
  const startsMs = steps.map((s) => {
    if (!s.narration) throw new Error(`Board ${s.board + 1}, Step ${s.step + 1} has no Narration.`);
    const at = t;
    t += s.narration.durationMs;
    return at;
  });
  return { steps, startsMs, totalMs: t };
}

/** The ClipLog of the narrated Clip: Step j is shown from the start of Narration j; a Board change comes with its first Step. */
export function narratedClipLog(p: Presentation, clipId: string): ClipLog {
  const { steps, startsMs, totalMs } = timeline(p);
  const events: LogEvent[] = [];
  let board = 0;
  steps.forEach((s, j) => {
    if (s.board !== board) {
      events.push({ t: startsMs[j], type: "board", index: s.board });
      board = s.board;
    }
    events.push({ t: startsMs[j], type: "step", index: s.step + 1 });
  });
  return { version: LOG_SCHEMA_VERSION, clipId, startBoard: steps[0]?.board ?? 0, startStep: 0, durationMs: totalMs, events };
}
