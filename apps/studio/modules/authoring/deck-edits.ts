import type { Board, Presentation, Transition } from "@flowcam/domain";

// Pure Presentation-level edits: the Boards strip and Templates.

export const emptyBoard = (): Board => ({ id: crypto.randomUUID(), elements: [], steps: [] });

export const isEmptyBoard = (b: Board) => b.elements.length === 0 && b.steps.length === 0;

/** Adds a Board after index `after`. */
export function addBoard(p: Presentation, after = p.boards.length - 1, board: Board = emptyBoard()): Presentation {
  const boards = [...p.boards];
  boards.splice(after + 1, 0, board);
  return { ...p, boards };
}

/** Removes a Board; the last remaining Board is replaced by an empty one so a Presentation always has a Board. */
export function deleteBoard(p: Presentation, index: number): Presentation {
  const boards = p.boards.filter((_, i) => i !== index);
  return { ...p, boards: boards.length ? boards : [emptyBoard()] };
}

export function moveBoard(p: Presentation, from: number, to: number): Presentation {
  if (to < 0 || to >= p.boards.length || from === to) return p;
  const boards = [...p.boards];
  boards.splice(to, 0, boards.splice(from, 1)[0]);
  return { ...p, boards };
}

/** Where the selected Board ends up after `moveBoard(p, from, to)`. */
export function selectionAfterMove(selected: number, from: number, to: number, length: number): number {
  if (to < 0 || to >= length || from === to) return selected;
  if (selected === from) return to;
  if (from < selected && to >= selected) return selected - 1;
  if (from > selected && to <= selected) return selected + 1;
  return selected;
}

export function setTransition(p: Presentation, index: number, transition: Transition): Presentation {
  return { ...p, boards: p.boards.map((b, i) => (i === index ? { ...b, transition } : b)) };
}

export function updateBoard(p: Presentation, index: number, edit: (b: Board) => Board): Presentation {
  return { ...p, boards: p.boards.map((b, i) => (i === index ? edit(b) : b)) };
}

/** Puts a Board in the Presentation: replaces `index` when it is empty, else adds it after. Returns the new index. */
export function insertBoard(p: Presentation, index: number, board: Board): { presentation: Presentation; index: number } {
  if (isEmptyBoard(p.boards[index])) return { presentation: updateBoard(p, index, () => ({ ...board, id: p.boards[index].id })), index };
  return { presentation: addBoard(p, index, board), index: index + 1 };
}
