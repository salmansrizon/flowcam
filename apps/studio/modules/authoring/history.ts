// Undo/redo for the Editor. Snapshots are whole immutable values (a Presentation), so keeping one is just keeping a reference.
// Ported in spirit from Excaliflow's snapshotScene / pushHistory / undo / redo (index.html @ 40b16b6), which stored JSON strings capped at 60.

export const MAX_HISTORY = 100;

export interface History<T> {
  past: T[];
  future: T[];
}

export const emptyHistory = <T,>(): History<T> => ({ past: [], future: [] });

/** Remembers `before` as an undo point (oldest dropped past MAX_HISTORY) and forgets redo. */
export function record<T>(h: History<T>, before: T): History<T> {
  return { past: [...h.past, before].slice(-MAX_HISTORY), future: [] };
}

/** Steps back from `current`; null when there is nothing to undo. */
export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.past.length) return null;
  return { value: h.past[h.past.length - 1], history: { past: h.past.slice(0, -1), future: [...h.future, current] } };
}

/** Steps forward from `current`; null when there is nothing to redo. */
export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.future.length) return null;
  return { value: h.future[h.future.length - 1], history: { past: [...h.past, current].slice(-MAX_HISTORY), future: h.future.slice(0, -1) } };
}
