import type { Board, Element } from "@flowcam/domain";

// Pure style edits behind the quick action bar and the Style panel.

/** Applies `patch` to the Elements in `ids`; a key set to undefined is removed (so "Theme default" leaves no override behind). */
export function restyleElements(board: Board, ids: string[], patch: { [K in keyof Element]?: Element[K] | undefined }): Board {
  return {
    ...board,
    elements: board.elements.map((e) => {
      if (!ids.includes(e.id)) return e;
      const out: Record<string, unknown> = { ...e };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete out[k];
        else out[k] = v;
      }
      return out as unknown as Element;
    }),
  };
}

/** Reverses arrow direction (Excaliflow's hudFlipArrowBtn): ends and bindings swap and the bow flips side. */
export function flipArrows(board: Board, ids: string[]): Board {
  return {
    ...board,
    elements: board.elements.map((e) =>
      e.type !== "arrow" || !ids.includes(e.id)
        ? e
        : { ...e, x: e.x2 ?? e.x, y: e.y2 ?? e.y, x2: e.x, y2: e.y, startBinding: e.endBinding ?? null, endBinding: e.startBinding ?? null, curveOffset: -(e.curveOffset ?? 0) || 0 },
    ),
  };
}

/** Turns arrows' Flow on or off (Excaliflow's hudArrowFlowBtn); missing counts as on. */
export function toggleArrowFlow(board: Board, ids: string[]): Board {
  return { ...board, elements: board.elements.map((e) => (e.type === "arrow" && ids.includes(e.id) ? { ...e, flowEnabled: e.flowEnabled === false } : e)) };
}
