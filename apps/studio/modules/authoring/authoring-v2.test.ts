import { describe, expect, test } from "vitest";
import { boundsOf, parsePresentation, type Board, type Presentation } from "@flowcam/domain";
import { addElement, createElement } from "./board-edits";
import { addBoard, deleteBoard, emptyBoard, insertBoard, moveBoard, selectionAfterMove, setTransition } from "./deck-edits";
import { addFocusStep, addHighlightStep, addMorphStep, duplicateElements, mergeReveals, setElementText, updateStep } from "./step-edits";
import { fromExcalidraw } from "./excalidraw";
import { TEMPLATES, templateBoard } from "./templates";

const deck = (...boards: Board[]): Presentation => ({ version: 1, id: "p", title: "T", themeId: "paper", boards });
const a = createElement("rectangle", { id: "a", x: 10, y: 10 });
const b = createElement("ellipse", { id: "b", x: 300, y: 10 });
const two = addElement(addElement(emptyBoard(), a), b);

describe("Boards", () => {
  test("the selected Board stays selected when another Board moves past it", () => {
    const ids = ["a", "b", "c", "d"];
    for (let sel = 0; sel < 4; sel++)
      for (let from = 0; from < 4; from++)
        for (const to of [from - 1, from + 1, 0, 3]) {
          const moved = [...ids];
          if (to >= 0 && to < 4 && from !== to) moved.splice(to, 0, moved.splice(from, 1)[0]);
          expect(moved[selectionAfterMove(sel, from, to, 4)]).toBe(ids[sel]);
        }
  });

  const [b1, b2, b3] = [{ ...emptyBoard(), id: "1" }, { ...emptyBoard(), id: "2" }, { ...emptyBoard(), id: "3" }];
  test("add, reorder, transition, delete", () => {
    let p = addBoard(addBoard(deck(b1), 0, b2), 1, b3);
    expect(p.boards.map((x) => x.id)).toEqual(["1", "2", "3"]);
    p = moveBoard(p, 2, 0);
    expect(p.boards.map((x) => x.id)).toEqual(["3", "1", "2"]);
    expect(moveBoard(p, 0, -1)).toBe(p);
    p = setTransition(p, 1, "slide");
    expect(p.boards[1].transition).toBe("slide");
    p = deleteBoard(p, 0);
    expect(p.boards.map((x) => x.id)).toEqual(["1", "2"]);
    expect(parsePresentation(p)).toBeTruthy();
  });
  test("deleting the last Board leaves an empty one", () => {
    expect(deleteBoard(deck(two), 0).boards).toHaveLength(1);
    expect(deleteBoard(deck(two), 0).boards[0].elements).toEqual([]);
  });
  test("insertBoard replaces an empty Board, else adds after", () => {
    expect(insertBoard(deck(emptyBoard()), 0, two).presentation.boards).toHaveLength(1);
    const r = insertBoard(deck(two), 0, two);
    expect([r.presentation.boards.length, r.index]).toEqual([2, 1]);
  });
});

describe("Steps", () => {
  test("merging adjacent reveals joins their Elements and scripts", () => {
    const s = updateStep(updateStep(two, 0, { script: "one" }), 1, { script: "two" });
    const m = mergeReveals(s, 0);
    expect(m.steps).toHaveLength(1);
    expect(m.steps[0]).toMatchObject({ kind: "reveal", elementIds: ["a", "b"], script: "one\ntwo" });
  });
  test("merge ignores non-reveal neighbours", () => {
    const h = addHighlightStep(two, ["a"]);
    expect(mergeReveals(h, 1)).toBe(h);
  });
  test("morph keeps the base position and stores the target", () => {
    const m = addMorphStep(two, "a", { x: 500, y: 400, width: 50, height: 50 });
    expect(m.steps.at(-1)).toMatchObject({ kind: "morph", elementId: "a", to: { x: 500, y: 400 } });
    expect(m.elements.find((e) => e.id === "a")).toMatchObject({ x: 10, y: 10 });
    expect(addMorphStep(two, "zzz", { x: 0, y: 0, width: 5, height: 5 })).toBe(two);
    expect(parsePresentation(deck(m))).toBeTruthy();
  });
  test("focus in, tiny rect ignored, focus out", () => {
    const f = addFocusStep(addFocusStep(addFocusStep(two, { x: 0, y: 0, width: 400, height: 225 }), { x: 0, y: 0, width: 3, height: 3 }), null);
    expect(f.steps.slice(2).map((s) => s.kind === "focus" && s.rect !== null)).toEqual([true, false]);
    expect(parsePresentation(deck(f))).toBeTruthy();
  });
  test("script and Layout set and unset; effect only on reveals", () => {
    let s = updateStep(two, 0, { layout: "side-by-side", effect: "draw-on", script: "hi" });
    expect(s.steps[0]).toMatchObject({ layout: "side-by-side", effect: "draw-on", script: "hi" });
    s = updateStep(s, 0, { layout: null, script: "" });
    expect(s.steps[0]).not.toHaveProperty("layout");
    expect(s.steps[0]).not.toHaveProperty("script");
    expect(updateStep(addHighlightStep(two, ["a"]), 2, { effect: "draw-on" }).steps[2]).not.toHaveProperty("effect");
  });
  test("duplicate gives new ids, reveal Steps and rebinds arrows", () => {
    const arrow = createElement("arrow", { id: "ar", x: 0, y: 0, x2: 10, y2: 10, startBinding: { elementId: "a", focusAngle: 0, coreCenter: false, side: "right", gap: 4 } });
    const r = duplicateElements(addElement(two, arrow), ["a", "ar"]);
    expect(r.board.elements).toHaveLength(5);
    const clone = r.board.elements.find((e) => e.id === r.ids[1])!;
    expect(clone.startBinding!.elementId).toBe(r.ids[0]);
    expect(r.board.steps).toHaveLength(5);
  });
  test("text edit grows the box around its centre", () => {
    const t = setElementText(two, "a", "a much longer label than before\nand two lines");
    const el = t.elements[0];
    expect(el.width).toBeGreaterThan(a.width);
    expect(el.x + el.width / 2).toBeCloseTo(a.x + a.width / 2);
  });
});

describe("Templates", () => {
  test("there are about ten", () => expect(TEMPLATES.length).toBeGreaterThanOrEqual(10));
  test.each(TEMPLATES.map((t) => [t.name, t] as const))("%s parses and fits the Board", (_n, t) => {
    const board = templateBoard(t);
    expect(parsePresentation(JSON.parse(JSON.stringify(deck(board))))).toBeTruthy();
    for (const r of board.elements.map(boundsOf)) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(1920);
      expect(r.y + r.height).toBeLessThanOrEqual(1080);
    }
  });
});

describe("Excalidraw import", () => {
  const doc = {
    type: "excalidraw", version: 2,
    elements: [
      { type: "rectangle", x: 100, y: 100, width: 200, height: 100, strokeColor: "#e03131", backgroundColor: "#ffc9c9", fillStyle: "solid", strokeStyle: "dashed", strokeWidth: 2 },
      { type: "ellipse", x: 400, y: 100, width: 100, height: 100, strokeColor: "#1e1e1e", backgroundColor: "transparent" },
      { type: "diamond", x: 600, y: 100, width: 100, height: 100 },
      { type: "arrow", x: 300, y: 150, width: 100, height: 0, points: [[0, 0], [100, 0]] },
      { type: "text", x: 100, y: 300, width: 80, height: 25, text: "Hello", fontSize: 20 },
      { type: "freedraw", x: 200, y: 400, width: 20, height: 20, points: [[0, 0], [10, 20], [20, 0]] },
      { type: "image", x: 700, y: 300, width: 64, height: 64, fileId: "f1" },
      { type: "image", x: 700, y: 400, width: 64, height: 64, fileId: "missing" },
      { type: "line", x: 0, y: 0, width: 10, height: 10, points: [[0, 0], [10, 10]] },
      { type: "frame", x: 0, y: 0, width: 10, height: 10 },
      { type: "rectangle", x: 0, y: 0, width: 5, height: 5, isDeleted: true },
    ],
    files: { f1: { mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
  };
  test("maps supported types, reports skipped ones", () => {
    const { board, skipped } = fromExcalidraw(doc, { f1: "abc123" });
    expect(board.elements.map((e) => e.type)).toEqual(["rectangle", "ellipse", "diamond", "arrow", "text", "freedraw", "image"]);
    expect(skipped).toBe(3); // missing image file, line, frame
    expect(board.elements[0]).toMatchObject({ strokeColor: "#e03131", fillStyle: "solid", strokeStyle: "dashed" });
    expect(board.elements[1].fillStyle).toBe("none");
    expect(board.elements[6].imageId).toBe("abc123");
    expect(board.elements[4].text).toBe("Hello");
    expect(board.steps).toHaveLength(7);
    expect(parsePresentation(JSON.parse(JSON.stringify(deck(board))))).toBeTruthy();
    for (const e of board.elements) expect(e.x).toBeGreaterThanOrEqual(0);
  });
  test("arrow end follows its points", () => {
    const { board } = fromExcalidraw({ ...doc, elements: [doc.elements[3]] });
    const ar = board.elements[0];
    expect(ar.x2! - ar.x).toBeGreaterThan(0);
    expect(ar.y2).toBeCloseTo(ar.y);
  });
  test("rejects other JSON", () => {
    expect(() => fromExcalidraw({ type: "nope" })).toThrow();
  });
});
