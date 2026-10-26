import { describe, expect, it } from "vitest";
import { InvalidDataError, parseClipLog, parsePresentation, type LogEvent } from "@flowcam/domain";
import { fixturePresentation } from "./fixture";
import { clampStep, finishLog, toBoardUnits, transition } from "./session";
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

describe("clampStep", () => {
  it("keeps the Step index within 0..steps.length", () => {
    expect(clampStep(-1, 4)).toBe(0);
    expect(clampStep(2, 4)).toBe(2);
    expect(clampStep(5, 4)).toBe(4);
    expect(clampStep(1, 0)).toBe(0);
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
    const log = finishLog({ clipId: "c", boardId: "b", startStep: 2, events }, 1000, 3500);
    expect(parseClipLog(log)).toBe(log);
    expect(log).toMatchObject({ version: 1, clipId: "c", boardId: "b", startStep: 2, durationMs: 2500 });
    expect(log.events).toEqual([
      { t: 0, type: "pointer", x: 1, y: 2 },
      { t: 100, type: "ink", id: "a", points: [[0, 0, 100], [5, 5, 300]] },
      { t: 200, type: "step", index: 1 },
    ]);
  });
});

describe("parseRecording", () => {
  const good = { version: 1, id: "r", presentationId: "p", boardId: "b", createdAt: "2026-10-17T10:00:00.000Z", clips: ["c1", "c2"] };

  it("accepts a valid recording.json", () => {
    expect(parseRecording(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it.each([
    ["not an object", null],
    ["wrong version", { ...good, version: 2 }],
    ["missing boardId", { ...good, boardId: undefined }],
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
