import { describe, expect, test } from "vitest";
import {
  InvalidDataError,
  parseClipLog,
  parsePresentation,
  stepsFromDrawingOrder,
  viewAt,
  type Board,
  type ClipLog,
  type Element,
} from "@flowcam/domain";

const el = (id: string, type: Element["type"] = "rectangle", extra: Partial<Element> = {}): Element => ({
  id, type, x: 0, y: 0, width: 100, height: 50, strokeColor: "#171717", fillStyle: "hachure",
  strokeWidth: 2, strokeStyle: "solid", roughness: 0.85, fontFamily: "hand", fontSize: 15, text: "", seed: 1,
  ...(type === "arrow" ? { x2: 200, y2: 0, flowEnabled: false } : {}),
  ...extra,
});

const elements = [el("a"), el("b"), el("arr", "arrow")];
const board: Board = {
  id: "b1",
  elements,
  steps: [...stepsFromDrawingOrder(elements), { id: "s-flow", kind: "flow", arrowId: "arr", on: true }],
};
const log = (events: ClipLog["events"], startStep = 0): ClipLog =>
  ({ version: 1, clipId: "c1", boardId: "b1", startStep, durationMs: 10_000, events });

describe("stepsFromDrawingOrder", () => {
  test("one reveal Step per Element, in drawing order", () => {
    expect(stepsFromDrawingOrder(elements).map((s) => s.kind === "reveal" && s.elementIds)).toEqual([["a"], ["b"], ["arr"]]);
  });
});

describe("viewAt", () => {
  const l = log([
    { t: 100, type: "step", index: 1 },
    { t: 200, type: "ink", id: "i1", points: [[0, 0, 200], [5, 5, 250], [9, 9, 400]] },
    { t: 500, type: "step", index: 4 },
    { t: 900, type: "step", index: 2 },
  ]);

  test("nothing is shown before the first Step", () => {
    expect(viewAt(board, l, 0).revealedAt.size).toBe(0);
  });

  test("reveals record when each Element appeared", () => {
    const v = viewAt(board, l, 600);
    expect([...v.revealedAt]).toEqual([["a", 100], ["b", 500], ["arr", 500]]);
    expect([...v.flowing]).toEqual(["arr"]);
  });

  test("Ink is cut to the points drawn by now and clears on the next Step", () => {
    expect(viewAt(board, l, 300).ink[0].points).toHaveLength(2);
    expect(viewAt(board, l, 600).ink).toEqual([]);
  });

  test("going back hides later Steps and turns their Flow off", () => {
    const v = viewAt(board, l, 1000);
    expect(v.stepIndex).toBe(2);
    expect([...v.revealedAt.keys()]).toEqual(["a", "b"]);
    expect(v.flowing.size).toBe(0);
  });

  test("Steps shown before the Clip began are visible from the start", () => {
    expect([...viewAt(board, log([], 2), 0).revealedAt]).toEqual([["a", -Infinity], ["b", -Infinity]]);
  });

  test("same inputs give the same view", () => {
    expect(viewAt(board, l, 333)).toEqual(viewAt(board, l, 333));
  });
});

describe("parsing stored data", () => {
  const presentation = { version: 1, id: "p1", title: "T", themeId: "paper", boards: [board] };
  const roundTrip = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

  test("valid data passes", () => {
    expect(parsePresentation(roundTrip(presentation))).toEqual(presentation);
    expect(parseClipLog(roundTrip(log([{ t: 1, type: "step", index: 1 }])))).toBeTruthy();
  });

  test.each([
    ["missing field", { ...presentation, title: undefined }, "presentation.title"],
    ["no Boards", { ...presentation, boards: [] }, "presentation.boards"],
    ["unknown Element type", { ...presentation, boards: [{ ...board, elements: [{ ...elements[0], type: "star" }] }] }, ".type"],
    ["Step pointing at a missing Element", { ...presentation, boards: [{ ...board, elements: [elements[0]] }] }, ".ref[0]"],
    ["Flow Step on a non-arrow", { ...presentation, boards: [{ ...board, steps: [{ id: "f", kind: "flow", arrowId: "a", on: true }] }] }, ".arrowId"],
    ["not an object", null, "presentation"],
  ])("rejects %s", (_name, data, where) => {
    expect(() => parsePresentation(roundTrip(data))).toThrow(InvalidDataError);
    expect(() => parsePresentation(roundTrip(data))).toThrow(where);
  });

  test.each([
    ["wrong version", { ...log([]), version: 2 }],
    ["negative startStep", log([], -1)],
    ["fractional Step index", log([{ t: 1, type: "step", index: 2.5 }])],
    ["unsorted events", log([{ t: 5, type: "inkClear" }, { t: 1, type: "inkClear" }])],
    ["malformed Ink point", log([{ t: 1, type: "ink", id: "i", points: [[1, 2]] as never }])],
  ])("rejects a log with %s", (_name, data) => {
    expect(() => parseClipLog(roundTrip(data))).toThrow(InvalidDataError);
  });
});
