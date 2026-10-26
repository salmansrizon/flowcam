import type { Board, Element, ElementType, Step } from "@flowcam/domain";

// Pure Board edits; the Editor keeps the Board in state and saves after each one.

export function createElement(type: ElementType, props: Partial<Element> & Pick<Element, "x" | "y">): Element {
  return {
    id: crypto.randomUUID(),
    type,
    width: 200,
    height: 120,
    strokeColor: "#171717",
    fillStyle: type === "text" || type === "arrow" || type === "freedraw" ? "none" : "hachure",
    strokeWidth: 2.2,
    strokeStyle: "solid",
    roughness: 0.85,
    fontFamily: "hand",
    fontSize: 28,
    text: "",
    seed: crypto.getRandomValues(new Uint32Array(1))[0] || 1,
    ...(type === "arrow" ? { curveType: "curved", curveOffset: 0, flowEnabled: true, startBinding: null, endBinding: null } : {}),
    ...props,
  };
}

/** Adds an Element and its reveal Step, so Steps follow drawing order. */
export function addElement(board: Board, el: Element): Board {
  return {
    ...board,
    elements: [...board.elements, el],
    steps: [...board.steps, { id: `step_${el.id}`, kind: "reveal", elementIds: [el.id] }],
  };
}

/** Removes an Element and every Step that only referred to it. */
export function deleteElement(board: Board, id: string): Board {
  const steps = board.steps.flatMap((s): Step[] => {
    if (s.kind === "flow") return s.arrowId === id ? [] : [s];
    if (s.kind === "morph") return s.elementId === id ? [] : [s];
    if (s.kind === "focus") return [s];
    const elementIds = s.elementIds.filter((e) => e !== id);
    return elementIds.length ? [{ ...s, elementIds }] : [];
  });
  return { ...board, elements: board.elements.filter((e) => e.id !== id), steps };
}

export function moveElement(board: Board, id: string, dx: number, dy: number): Board {
  return {
    ...board,
    elements: board.elements.map((e) =>
      e.id !== id ? e : { ...e, x: e.x + dx, y: e.y + dy, ...(e.type === "arrow" ? { x2: e.x2! + dx, y2: e.y2! + dy } : {}) },
    ),
  };
}

export function moveStep(board: Board, from: number, to: number): Board {
  if (to < 0 || to >= board.steps.length) return board;
  const steps = [...board.steps];
  const [s] = steps.splice(from, 1);
  steps.splice(to, 0, s);
  return { ...board, steps };
}

export function deleteStep(board: Board, index: number): Board {
  return { ...board, steps: board.steps.filter((_, i) => i !== index) };
}

export function addFlowStep(board: Board, arrowId: string, on: boolean): Board {
  return { ...board, steps: [...board.steps, { id: crypto.randomUUID(), kind: "flow", arrowId, on }] };
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2)) : 0;
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

/** Topmost Element under a point in Board units. */
export function hitTest(board: Board, x: number, y: number): Element | null {
  // ponytail: bounding boxes and straight arrow shafts; use the renderer's geometry if curved arrows misfire.
  for (let i = board.elements.length - 1; i >= 0; i--) {
    const e = board.elements[i];
    const hit =
      e.type === "arrow"
        ? distanceToSegment(x, y, e.x, e.y, e.x2!, e.y2!) < 12
        : x >= e.x && x <= e.x + e.width && y >= e.y && y <= e.y + e.height;
    if (hit) return e;
  }
  return null;
}
