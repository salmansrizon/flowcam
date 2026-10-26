import { describe, expect, test } from "vitest";
import {
  InvalidDataError,
  parseClipLog,
  parsePresentation,
  autoPlaceBubble,
  presentationViewAt,
  stepsFromDrawingOrder,
  type Board,
  type ClipLog,
  type Element,
  type Presentation,
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
const deck = (...boards: Board[]): Presentation => ({ version: 1, id: "p1", title: "T", themeId: "paper", boards });
const log = (events: ClipLog["events"], startStep = 0, startBoard = 0): ClipLog =>
  ({ version: 2, clipId: "c1", startBoard, startStep, durationMs: 10_000, events });
const viewAt = (b: Board, l: ClipLog, t: number) => presentationViewAt(deck(b), l, t).view;

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

describe("Step effects", () => {
  const b: Board = {
    id: "b1",
    elements,
    steps: [
      { id: "s1", kind: "reveal", elementIds: ["a", "b"], effect: "draw-on", layout: "side-by-side" },
      { id: "s2", kind: "highlight", elementIds: ["a"] },
      { id: "s3", kind: "morph", elementId: "a", to: { x: 500, y: 500, width: 10, height: 10 } },
      { id: "s4", kind: "focus", rect: { x: 0, y: 0, width: 960, height: 540 } },
      { id: "s5", kind: "focus", rect: null, layout: "camera-only" },
    ],
  };
  const at = (index: number) => viewAt(b, log([{ t: 10, type: "step", index }]), 20);

  test("draw-on reveals and Layout carry forward", () => {
    expect([...at(1).drawOn]).toEqual(["a", "b"]);
    expect(at(1).layout).toBe("side-by-side");
    expect(at(5).layout).toBe("camera-only");
    expect(at(0).layout).toBe("bubble");
  });

  test("highlight lasts only while it is the latest Step", () => {
    expect([...at(2).highlighted.keys()]).toEqual(["a"]);
    expect(at(3).highlighted.size).toBe(0);
  });

  test("morph records where the Element moves from and to", () => {
    expect(at(3).morphs.get("a")).toEqual({ from: { x: 0, y: 0, width: 100, height: 50 }, to: { x: 500, y: 500, width: 10, height: 10 }, at: 10 });
  });

  test("focus zooms in, then back out", () => {
    expect(at(4).focus).toEqual({ from: null, to: { x: 0, y: 0, width: 960, height: 540 }, at: 10 });
    expect(at(5).focus.to).toBeNull();
  });
});

describe("moving between Boards", () => {
  const b2: Board = { id: "b2", elements: [el("c")], steps: stepsFromDrawingOrder([el("c")]), transition: "slide" };
  const p = deck(board, b2);
  const l = log([
    { t: 100, type: "step", index: 2 },
    { t: 200, type: "ink", id: "i", points: [[0, 0, 200]] },
    { t: 300, type: "board", index: 1 },
    { t: 400, type: "step", index: 1 },
    { t: 500, type: "board", index: 0 },
  ]);

  test("a new Board starts with no Steps shown and clears Ink", () => {
    const v = presentationViewAt(p, l, 350);
    expect(v.boardIndex).toBe(1);
    expect(v.view.stepIndex).toBe(0);
    expect(v.view.ink).toEqual([]);
    expect(v.transition).toMatchObject({ from: 0, at: 300, kind: "slide" });
    expect(v.transition!.fromView.stepIndex).toBe(2);
  });

  test("going back keeps what was already shown on that Board", () => {
    const v = presentationViewAt(p, l, 600);
    expect(v.boardIndex).toBe(0);
    expect(v.view.stepIndex).toBe(2);
    expect(v.transition).toMatchObject({ from: 1, kind: "fade" });
  });

  test("Boards before the starting Board are fully shown", () => {
    const v = presentationViewAt(p, log([{ t: 1, type: "board", index: 0 }], 0, 1), 5);
    expect(v.view.stepIndex).toBe(board.steps.length);
  });
});

describe("Camera Bubble Auto-placement", () => {
  const corner = (x: number, y: number, w: number, h: number) => {
    const target = el("t", "rectangle", { x, y, width: w, height: h });
    const b: Board = { id: "b", elements: [target], steps: stepsFromDrawingOrder([target]) };
    return autoPlaceBubble(b, viewAt(b, log([{ t: 0, type: "step", index: 1 }]), 1), 300);
  };

  test("stays bottom right unless the latest Step's Elements are there", () => {
    expect(corner(100, 100, 50, 50)).toEqual({ x: 1580, y: 740 });
    expect(corner(1700, 900, 100, 100)).toEqual({ x: 40, y: 740 });
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
    ["unknown Theme", { ...presentation, themeId: "neon" }, "presentation.themeId"],
    ["image without imageId", { ...presentation, boards: [{ ...board, elements: [{ ...elements[0], type: "image" }], steps: [] }] }, ".imageId"],
    ["focus with an empty rect", { ...presentation, boards: [{ ...board, steps: [{ id: "f", kind: "focus", rect: { x: 0, y: 0, width: 0, height: 5 } }] }] }, ".rect"],
    ["unknown Layout", { ...presentation, boards: [{ ...board, steps: [{ ...board.steps[0], layout: "pip" }] }] }, ".layout"],
    ["Flow Step on a non-arrow", { ...presentation, boards: [{ ...board, steps: [{ id: "f", kind: "flow", arrowId: "a", on: true }] }] }, ".arrowId"],
    ["not an object", null, "presentation"],
  ])("rejects %s", (_name, data, where) => {
    expect(() => parsePresentation(roundTrip(data))).toThrow(InvalidDataError);
    expect(() => parsePresentation(roundTrip(data))).toThrow(where);
  });

  test.each([
    ["wrong version", { ...log([]), version: 1 }],
    ["negative startStep", log([], -1)],
    ["fractional Step index", log([{ t: 1, type: "step", index: 2.5 }])],
    ["unsorted events", log([{ t: 5, type: "inkClear" }, { t: 1, type: "inkClear" }])],
    ["malformed Ink point", log([{ t: 1, type: "ink", id: "i", points: [[1, 2]] as never }])],
  ])("rejects a log with %s", (_name, data) => {
    expect(() => parseClipLog(roundTrip(data))).toThrow(InvalidDataError);
  });
});
