import { BOARD_HEIGHT, BOARD_WIDTH, boundsOf, type Board, type Rect } from "./model";
import type { BoardView } from "./log";

const MARGIN = 40;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Ids of the Elements the latest shown Step changes. */
function changedByLatestStep(board: Board, view: BoardView): string[] {
  const step = board.steps[view.stepIndex - 1];
  if (!step) return [];
  if (step.kind === "reveal" || step.kind === "highlight") return step.elementIds;
  if (step.kind === "flow") return [step.arrowId];
  if (step.kind === "morph") return [step.elementId];
  return [];
}

/**
 * Auto-placement (CONTEXT.md): the Camera Bubble's top-left corner, in Board units, in the first corner
 * (bottom right, bottom left, top right, top left) that does not cover the Elements the latest Step changes.
 */
export function autoPlaceBubble(board: Board, view: BoardView, size: number): { x: number; y: number } {
  const corners = [
    { x: BOARD_WIDTH - MARGIN - size, y: BOARD_HEIGHT - MARGIN - size },
    { x: MARGIN, y: BOARD_HEIGHT - MARGIN - size },
    { x: BOARD_WIDTH - MARGIN - size, y: MARGIN },
    { x: MARGIN, y: MARGIN },
  ];
  const boxes = changedByLatestStep(board, view).flatMap((id) => {
    const el = board.elements.find((e) => e.id === id);
    if (!el) return [];
    const morph = view.morphs.get(id);
    return morph ? [boundsOf(el), morph.to] : [boundsOf(el)];
  });
  return corners.find((c) => !boxes.some((b) => overlaps({ ...c, width: size, height: size }, b))) ?? corners[0];
}
