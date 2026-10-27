import { pieces, markAt, toSource, type Edits, type TextOverlay } from "./edits";

// Pure operations on text overlays (`edits.texts`). Like Layout changes they are pinned to a Clip and a
// source time, so trims and speed changes carry them. Output times are on the timeline as currently shown.

export const DEFAULT_TEXT_MS = 3000;
export const MIN_TEXT_MS = 500;

/** Length of a Clip, as the caller knows it. */
export type ClipLength = (clipId: string) => number;

export const textsOf = (edits: Edits): TextOverlay[] => edits.texts ?? [];

const replace = (edits: Edits, id: string, f: (t: TextOverlay) => TextOverlay): Edits => {
  if (!textsOf(edits).some((t) => t.id === id)) return edits;
  return { ...edits, texts: textsOf(edits).map((t) => (t.id === id ? f(t) : t)) };
};

/** A new 3 s overlay at output time `t`, centred low, kept inside its Clip. */
export function addText(edits: Edits, t: number, clipLength: ClipLength, id: string): Edits {
  const src = toSource(pieces(edits), t);
  if (!src) return edits;
  const len = clipLength(src.clipId);
  const end = Math.min(Math.round(src.t) + DEFAULT_TEXT_MS, len);
  const start = Math.max(0, Math.min(Math.round(src.t), end - MIN_TEXT_MS));
  const text: TextOverlay = { id, clipId: src.clipId, start, end: Math.max(end, start + MIN_TEXT_MS), text: "Text", x: 0.5, y: 0.85, size: 48, font: "sans", color: "#ffffff", box: true };
  return { ...edits, texts: [...textsOf(edits), text] };
}

/** Where an overlay shows on the timeline: output start and length, or null if all of it was cut. */
export function textSpan(edits: Edits, t: TextOverlay): { at: number; length: number } | null {
  const ps = pieces(edits);
  const at = markAt(ps, t.clipId, t.start);
  if (at === null) return null;
  const p = ps.find((p) => p.clipId === t.clipId && t.start >= p.start && t.start < p.end) ?? ps.find((p) => p.clipId === t.clipId && p.start > t.start)!;
  return { at, length: (t.end - t.start) / p.speed };
}

/** Moves an overlay so it starts at output time `at`, keeping its length and staying inside the Clip it lands in. */
export function moveText(edits: Edits, id: string, at: number, clipLength: ClipLength): Edits {
  const src = toSource(pieces(edits), at);
  if (!src) return edits;
  return replace(edits, id, (t) => {
    const len = Math.min(t.end - t.start, clipLength(src.clipId));
    const start = Math.round(Math.max(0, Math.min(src.t, clipLength(src.clipId) - len)));
    return { ...t, clipId: src.clipId, start, end: start + len };
  });
}

/** Drags one edge to output time `at`; the edge stays in the overlay's Clip and the overlay at least MIN_TEXT_MS long. */
export function resizeText(edits: Edits, id: string, edge: "start" | "end", at: number, clipLength: ClipLength): Edits {
  const src = toSource(pieces(edits), at);
  return replace(edits, id, (t) => {
    if (!src || src.clipId !== t.clipId) return t;
    const s = Math.round(src.t);
    return edge === "start"
      ? { ...t, start: Math.max(0, Math.min(s, t.end - MIN_TEXT_MS)) }
      : { ...t, end: Math.min(clipLength(t.clipId), Math.max(s, t.start + MIN_TEXT_MS)) };
  });
}

/** Changes properties other than timing. */
export const updateText = (edits: Edits, id: string, patch: Partial<Omit<TextOverlay, "id" | "clipId" | "start" | "end">>): Edits =>
  replace(edits, id, (t) => ({ ...t, ...patch }));

export function deleteText(edits: Edits, id: string): Edits {
  const texts = textsOf(edits).filter((t) => t.id !== id);
  return texts.length === textsOf(edits).length ? edits : { ...edits, texts };
}
