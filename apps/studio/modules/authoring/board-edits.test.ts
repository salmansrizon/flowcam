import { describe, expect, test } from "vitest";
import type { Board } from "@flowcam/domain";
import { addElement, addFlowStep, createElement, deleteElement, deleteStep, hitTest, moveElement, moveStep } from "./board-edits";

const empty: Board = { id: "b1", elements: [], steps: [] };
const rect = createElement("rectangle", { id: "r", x: 0, y: 0, width: 100, height: 100 });
const arrow = createElement("arrow", { id: "a", x: 0, y: 200, x2: 300, y2: 200 });
const board = addFlowStep(addElement(addElement(empty, rect), arrow), "a", false);

describe("board edits", () => {
  test("adding Elements adds reveal Steps in drawing order", () => {
    expect(board.steps.map((s) => s.kind)).toEqual(["reveal", "reveal", "flow"]);
  });

  test("deleting an arrow removes its reveal and Flow Steps", () => {
    const b = deleteElement(board, "a");
    expect(b.elements.map((e) => e.id)).toEqual(["r"]);
    expect(b.steps).toEqual([board.steps[0]]);
  });

  test("moving an arrow moves both ends", () => {
    const a = moveElement(board, "a", 10, 5).elements[1];
    expect([a.x, a.y, a.x2, a.y2]).toEqual([10, 205, 310, 205]);
  });

  test("Steps reorder and delete; out-of-range moves do nothing", () => {
    expect(moveStep(board, 0, 1).steps.map((s) => s.id)).toEqual([board.steps[1].id, board.steps[0].id, board.steps[2].id]);
    expect(moveStep(board, 0, -1)).toBe(board);
    expect(deleteStep(board, 2).steps).toHaveLength(2);
  });

  test("hit testing finds the topmost Element", () => {
    expect(hitTest(board, 50, 50)?.id).toBe("r");
    expect(hitTest(board, 150, 205)?.id).toBe("a");
    expect(hitTest(board, 900, 900)).toBeNull();
  });
});
