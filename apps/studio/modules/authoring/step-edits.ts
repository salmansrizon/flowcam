import type { Board, Element, Layout, Rect, Step } from "@flowcam/domain";
import { addElement } from "./board-edits";

// Pure Step edits for the Steps panel.

/** Highlight Step for the given Elements (ignored when none exist on the Board). */
export function addHighlightStep(board: Board, ids: string[]): Board {
  const elementIds = ids.filter((id) => board.elements.some((e) => e.id === id));
  if (!elementIds.length) return board;
  return { ...board, steps: [...board.steps, { id: crypto.randomUUID(), kind: "highlight", elementIds }] };
}

/** Focus Step onto a dragged rectangle; `null` zooms out. Rectangles under 10 units are ignored. */
export function addFocusStep(board: Board, rect: Rect | null): Board {
  if (rect && (rect.width < 10 || rect.height < 10)) return board;
  return { ...board, steps: [...board.steps, { id: crypto.randomUUID(), kind: "focus", rect }] };
}

/** Morph Step: the Element moves to `to` in this Step; its base box stays. */
export function addMorphStep(board: Board, elementId: string, to: Rect): Board {
  if (!board.elements.some((e) => e.id === elementId) || to.width <= 0 || to.height <= 0) return board;
  return { ...board, steps: [...board.steps, { id: crypto.randomUUID(), kind: "morph", elementId, to }] };
}

/** Merges Step `i` and the next one when both are reveals, so their Elements appear together. */
export function mergeReveals(board: Board, i: number): Board {
  const [a, b] = [board.steps[i], board.steps[i + 1]];
  if (a?.kind !== "reveal" || b?.kind !== "reveal") return board;
  const script = [a.script, b.script].filter(Boolean).join("\n") || undefined;
  const merged: Step = { ...a, elementIds: [...a.elementIds, ...b.elementIds], ...(script ? { script } : {}) };
  return { ...board, steps: [...board.steps.slice(0, i), merged, ...board.steps.slice(i + 2)] };
}

export type StepPatch = { script?: string; layout?: Layout | null; effect?: "fade" | "draw-on" };

/** Sets a Step's script, Layout (`null` unsets) or, on a reveal, its effect. */
export function updateStep(board: Board, i: number, patch: StepPatch): Board {
  const s = board.steps[i];
  if (!s) return board;
  const next = { ...s } as Step;
  if (patch.script !== undefined) {
    if (patch.script) next.script = patch.script;
    else delete next.script;
  }
  if (patch.layout !== undefined) {
    if (patch.layout) next.layout = patch.layout;
    else delete next.layout;
  }
  if (patch.effect !== undefined && next.kind === "reveal") next.effect = patch.effect;
  return { ...board, steps: board.steps.map((x, j) => (j === i ? next : x)) };
}

/**
 * Copies Elements with fresh ids and seeds, shifted by `offset`; arrow bindings follow the copies.
 * Ported from Excaliflow cloneElementsWithBindings (Apache-2.0, see packages/renderer/NOTICE).
 */
export function duplicateElements(board: Board, ids: string[], offset = 28): { board: Board; ids: string[] } {
  const source = board.elements.filter((e) => ids.includes(e.id));
  const idMap = new Map(source.map((e) => [e.id, crypto.randomUUID()]));
  const clones = source.map((e): Element => {
    const c: Element = JSON.parse(JSON.stringify(e));
    c.id = idMap.get(e.id)!;
    c.x += offset;
    c.y += offset;
    if (c.x2 !== undefined) c.x2 += offset;
    if (c.y2 !== undefined) c.y2 += offset;
    c.seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    for (const b of [c.startBinding, c.endBinding]) if (b && idMap.has(b.elementId)) b.elementId = idMap.get(b.elementId)!;
    return c;
  });
  return { board: clones.reduce(addElement, board), ids: clones.map((c) => c.id) };
}

/**
 * Sets an Element's text and grows its box to fit, around its centre.
 * Ported from Excaliflow autoFitElementToText (Apache-2.0, see packages/renderer/NOTICE).
 */
export function setElementText(board: Board, id: string, text: string, measure = (line: string, size: number) => line.length * size * 0.58): Board {
  return {
    ...board,
    elements: board.elements.map((el) => {
      if (el.id !== id || el.type === "arrow") return el;
      const lines = text.split("\n");
      const lineHeight = Math.round(el.fontSize * 1.25);
      const maxW = Math.max(...lines.map((l) => measure(l || " ", el.fontSize)));
      const [padX, padY] =
        el.type === "diamond" ? [Math.max(56, maxW * 0.65), Math.max(44, lines.length * lineHeight * 0.65)] : [el.type === "ellipse" ? 42 : 32, 28];
      const [minW, minH] = el.type === "text" ? [40, 26] : [110, 54];
      const width = Math.max(el.width, minW, Math.ceil(maxW + padX));
      const height = Math.max(el.height, minH, Math.ceil(lines.length * lineHeight + padY));
      return { ...el, text, width, height, x: el.x + el.width / 2 - width / 2, y: el.y + el.height / 2 - height / 2 };
    }),
  };
}
