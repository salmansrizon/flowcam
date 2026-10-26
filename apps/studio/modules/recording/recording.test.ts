import { describe, expect, it } from "vitest";
import {
  InvalidDataError,
  LOG_SCHEMA_VERSION,
  parseClipLog,
  parsePresentation,
  presentationViewAt,
  type ClipLog,
  type LogEvent,
  type Presentation,
} from "@flowcam/domain";
import { fixturePresentation } from "./fixture";
import { boardArea, finishLog, navigate, toBoardUnits, transition, upcoming } from "./session";
import { parseRecording } from "./storage";

describe("Clip state machine", () => {
  it("starts, pauses, resumes, retakes and stops", () => {
    expect(transition("preflight", "start")).toBe("countdown");
    expect(transition("recording", "pause")).toBe("paused");
    expect(transition("paused", "start")).toBe("countdown");
    expect(transition("recording", "retake")).toBe("countdown");
    expect(transition("paused", "retake")).toBe("countdown");
    expect(transition("recording", "stop")).toBe("done");
    expect(transition("paused", "stop")).toBe("done");
  });

  it("ignores commands that make no sense in a phase", () => {
    expect(transition("preflight", "retake")).toBeNull();
    expect(transition("preflight", "stop")).toBeNull();
    expect(transition("countdown", "pause")).toBeNull();
    expect(transition("countdown", "retake")).toBeNull();
    expect(transition("countdown", "stop")).toBeNull();
    expect(transition("recording", "start")).toBeNull();
    expect(transition("paused", "pause")).toBeNull();
    expect(transition("done", "start")).toBeNull();
  });
});

// Three Boards: two Steps, one Step, two Steps with Scripts on the last Board.
const [b1, b2] = fixturePresentation.boards[0].steps;
const three: Presentation = {
  ...fixturePresentation,
  boards: [
    { id: "b0", elements: [], steps: [b1, b2] },
    { id: "b1", elements: [], steps: [b1] },
    { id: "b2", elements: [], steps: [{ ...b1, script: "First line\nsecond line" }, { ...b2, script: "Last" }] },
  ],
};

/** Presses → (1) or ← (-1) in order from `start`, logging what navigate returns; returns the log. */
function press(keys: (1 | -1)[], start = { board: 0, step: 0 }): ClipLog {
  const log: ClipLog = { version: LOG_SCHEMA_VERSION, clipId: "c", startBoard: start.board, startStep: start.step, durationMs: 0, events: [] };
  keys.forEach((dir, t) => {
    const move = navigate(three, presentationViewAt(three, log, Infinity), dir);
    if (move) log.events.push({ ...move, t });
  });
  return log;
}
const at = (log: ClipLog) => {
  const pv = presentationViewAt(three, log, Infinity);
  return [pv.boardIndex, pv.view.stepIndex];
};

describe("navigate", () => {
  it("→ past a Board's last Step moves to the next Board with no Steps shown", () => {
    const log = press([1, 1, 1]);
    expect(log.events).toEqual([
      { type: "step", index: 1, t: 0 },
      { type: "step", index: 2, t: 1 },
      { type: "board", index: 1, t: 2 },
    ]);
    expect(at(log)).toEqual([1, 0]);
  });

  it("← at Step 0 returns to the previous Board with its shown Steps kept", () => {
    const log = press([1, 1, 1, 1, -1, -1]);
    expect(log.events.at(-1)).toMatchObject({ type: "board", index: 0 });
    expect(at(log)).toEqual([0, 2]);
    // ← again hides that Board's Steps one by one.
    expect(at(press([1, 1, 1, 1, -1, -1, -1]))).toEqual([0, 1]);
  });

  it("stops at the first and last Board", () => {
    expect(press([-1, -1])).toMatchObject({ events: [] });
    const end = press([1, 1], { board: 2, step: 0 });
    expect(at(end)).toEqual([2, 2]);
    expect(navigate(three, presentationViewAt(three, end, Infinity), 1)).toBeNull();
  });

  it("a Clip started mid-way goes back to a fully shown earlier Board", () => {
    expect(at(press([-1], { board: 1, step: 0 }))).toEqual([0, 2]);
  });
});

describe("upcoming (Teleprompter next Step)", () => {
  it("is the next Step on this Board", () => {
    const next = upcoming(three, press([], { board: 2, step: 0 }))!;
    expect([next.view.boardIndex, next.view.view.stepIndex]).toEqual([2, 1]);
    expect(next.step?.script).toBe("First line\nsecond line");
  });

  it("crosses into the next Board after a Board's last Step", () => {
    const next = upcoming(three, press([1, 1]))!;
    expect([next.view.boardIndex, next.view.view.stepIndex]).toEqual([1, 0]);
    expect(next.step).toBeNull();
  });

  it("is null at the end of the Presentation", () => {
    expect(upcoming(three, press([], { board: 2, step: 2 }))).toBeNull();
  });
});

describe("boardArea", () => {
  it("is the whole frame except side by side, where the Board sits left as in the export", () => {
    expect(boardArea("bubble")).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(boardArea("side-by-side")).toMatchObject({ x: 40, width: 1220 });
  });
});

describe("toBoardUnits", () => {
  it("maps a point on the displayed Board to 1920x1080 units", () => {
    expect(toBoardUnits(110, 70, { left: 10, top: 20, width: 960, height: 540 })).toEqual({ x: 200, y: 100 });
  });
});

describe("finishLog", () => {
  const events: LogEvent[] = [
    { t: 990, type: "pointer", x: 1, y: 2 },
    { t: 1100, type: "ink", id: "a", points: [[0, 0, 1100], [5, 5, 1300]] },
    { t: 1200, type: "step", index: 1 },
  ];

  it("puts t=0 on the first media sample and keeps events sorted", () => {
    const log = finishLog({ clipId: "c", startBoard: 0, startStep: 2, events }, 1000, 3500);
    expect(parseClipLog(log)).toBe(log);
    expect(log).toMatchObject({ version: 2, clipId: "c", startBoard: 0, startStep: 2, durationMs: 2500 });
    expect(log.events).toEqual([
      { t: 0, type: "pointer", x: 1, y: 2 },
      { t: 100, type: "ink", id: "a", points: [[0, 0, 100], [5, 5, 300]] },
      { t: 200, type: "step", index: 1 },
    ]);
  });
});

describe("parseRecording", () => {
  const good = { version: 1, id: "r", presentationId: "p", createdAt: "2026-10-17T10:00:00.000Z", clips: ["c1", "c2"] };

  it("accepts a valid recording.json, which has no boardId (each Clip's log has startBoard)", () => {
    expect(parseRecording(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it.each([
    ["not an object", null],
    ["wrong version", { ...good, version: 2 }],
    ["missing presentationId", { ...good, presentationId: undefined }],
    ["bad date", { ...good, createdAt: "yesterday" }],
    ["non-string clip", { ...good, clips: ["c1", 2] }],
    ["duplicate clip", { ...good, clips: ["c1", "c1"] }],
  ])("rejects %s", (_, bad) => {
    expect(() => parseRecording(bad)).toThrow(InvalidDataError);
  });
});

describe("fixture", () => {
  it("is a valid Presentation with one Step per Element", () => {
    const p = parsePresentation(fixturePresentation);
    expect(p.themeId).toBe("paper");
    expect(p.boards[0].steps).toHaveLength(p.boards[0].elements.length);
  });
});
