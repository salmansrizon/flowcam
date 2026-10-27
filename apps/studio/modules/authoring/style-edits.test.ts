import { expect, test } from "vitest";
import type { Board } from "@flowcam/domain";
import { createElement } from "./board-edits";
import { flipArrows, restyleElements, toggleArrowFlow } from "./style-edits";

const arrow = createElement("arrow", { id: "a", x: 10, y: 20, x2: 110, y2: 60, curveOffset: 30 });
const rect = createElement("rectangle", { id: "r", x: 0, y: 0, fontOverride: "code", roughnessOverride: 2 });
const board: Board = { id: "b", elements: [arrow, rect], steps: [] };

test("restyle sets values and removes overrides set to undefined", () => {
  const b = restyleElements(board, ["r"], { fontOverride: undefined, roughnessOverride: undefined, strokeWidth: 3.6 });
  const r = b.elements[1];
  expect("fontOverride" in r || "roughnessOverride" in r).toBe(false);
  expect(r.strokeWidth).toBe(3.6);
  expect(b.elements[0]).toBe(arrow);
});

test("flip swaps an arrow's ends and bow, and twice is the identity", () => {
  const f = flipArrows(board, ["a", "r"]);
  expect(f.elements[0]).toMatchObject({ x: 110, y: 60, x2: 10, y2: 20, curveOffset: -30 });
  expect(f.elements[1]).toBe(rect);
  expect(flipArrows(f, ["a"]).elements[0]).toEqual(arrow);
});

test("toggling Flow flips flowEnabled", () => {
  const off = toggleArrowFlow(board, ["a"]);
  expect(off.elements[0].flowEnabled).toBe(false);
  expect(toggleArrowFlow(off, ["a"]).elements[0].flowEnabled).toBe(true);
});
