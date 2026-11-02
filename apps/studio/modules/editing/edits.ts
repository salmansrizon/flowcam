import { FONT_IDS, InvalidDataError, LAYOUTS, type FontId, type Layout } from "@flowcam/domain";

// Edits to a Recording, made on the Review screen and Timeline, stored as recordings/<id>/edits.json.
// Every time in here is ms. "Source" times are ms from a Clip's start (its log and media timeline);
// "output" times are ms from the start of the edited video.

export const EDITS_VERSION = 1;

export const CLIP_TRANSITIONS = ["none", "fade"] as const;
export type ClipTransition = (typeof CLIP_TRANSITIONS)[number];

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;
/** Length of a fade between Clips: half fades out to black, half fades back in. */
export const FADE_MS = 500;
/** Shortest piece of a Clip a trim may leave. */
export const MIN_SEGMENT_MS = 100;

/** A kept range of one Clip, played at `speed`. */
export interface Segment {
  clipId: string;
  start: number;
  end: number;
  speed: number;
  /** How this Segment starts after the previous one. */
  transition: ClipTransition;
}

/** From this moment of a Clip on, the Layout is `layout` ("auto": the Steps decide). */
export interface LayoutChange {
  clipId: string;
  t: number;
  layout: Layout | "auto";
}

/** A stretch of Microphone silence found in a Clip, already shrunk by the padding. */
export interface DeadAir {
  clipId: string;
  start: number;
  end: number;
}

export const CAPTION_STYLES = ["classic", "bold", "minimal"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export const CAPTION_POSITIONS = ["bottom", "top"] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

export const BACKGROUNDS = ["white", "slate", "black", "blue", "sunset", "ocean", "mint"] as const;
export type Background = (typeof BACKGROUNDS)[number];
export const MAX_PADDING = 20;
export const MAX_SHADOW = 100;
export const MAX_CORNERS = 60;

/** Output frame shape. 9:16 stacks the Board above the Camera; true Board re-layout comes later. */
export const ASPECTS = ["16:9", "9:16", "1:1", "4:3"] as const;
export type Aspect = (typeof ASPECTS)[number];

/** A custom two-colour background; when set it replaces `frame.background`. `angle` is in degrees. */
export interface Gradient {
  from: string;
  to: string;
  angle: number;
}

/**
 * Text drawn over the video, pinned to a Clip like Layout changes, so trims and speed changes carry it.
 * `x` and `y` are the text's centre as fractions of the output frame; `size` is px at 1080 lines.
 */
export interface TextOverlay {
  id: string;
  clipId: string;
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  size: number;
  font: FontId;
  color: string;
  /** Draw a translucent box behind the text. */
  box: boolean;
}
export const MIN_TEXT_SIZE = 12;
export const MAX_TEXT_SIZE = 200;

/** Camera colour correction; each value runs from -100 to 100, 0 is unchanged. */
export interface ColorCorrection {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
}
export const NO_COLOR_CORRECTION: ColorCorrection = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 };

/** A saved look, applied to any Recording's edits. Stored per browser, not per Recording. */
export interface StylePreset {
  name: string;
  aspect: Aspect;
  frame: Edits["frame"];
  captions: Edits["captions"];
  color: ColorCorrection;
}

export interface Edits {
  version: typeof EDITS_VERSION;
  /** Kept ranges in play order. */
  segments: Segment[];
  layouts: LayoutChange[];
  trimDeadAir: boolean;
  /** Silence found in the Microphone; null until detected. */
  deadAir: DeadAir[] | null;
  captions: { enabled: boolean; style: CaptionStyle; position: CaptionPosition };
  /** Picture around the frame. `padding` is % of the width on each side; `shadow` 0–100; `corners` is the radius in px (default 20). */
  frame: { background: Background; padding: number; shadow: number; corners?: number; gradient?: Gradient };
  /** Optional additions; absent means the default: 16:9, no text overlays, no colour correction. */
  aspect?: Aspect;
  texts?: TextOverlay[];
  color?: ColorCorrection;
  /** Noise reduction and loudness levelling at export. */
  enhanceAudio: boolean;
}

export interface ClipInfo {
  clipId: string;
  durationMs: number;
}

export function defaultEdits(clips: readonly ClipInfo[]): Edits {
  return {
    version: EDITS_VERSION,
    segments: clips.map((c) => ({ clipId: c.clipId, start: 0, end: c.durationMs, speed: 1, transition: "none" })),
    layouts: [],
    trimDeadAir: true,
    deadAir: null,
    captions: { enabled: true, style: "classic", position: "bottom" },
    frame: { background: "slate", padding: 0, shadow: 40 },
    enhanceAudio: true,
  };
}

// ---- Validation: edits.json is read back from browser storage, so it is untrusted.

type Obj = Record<string, unknown>;
const fail = (path: string, want: string): never => {
  throw new InvalidDataError(`${path}: expected ${want}`);
};
const obj = (v: unknown, path: string): Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : fail(path, "an object");
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, "an array"));
const num = (v: unknown, path: string, min = -Infinity, max = Infinity): number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fail(path, `a number from ${min} to ${max}`);
const str = (v: unknown, path: string): string => (typeof v === "string" && v ? v : fail(path, "a non-empty string"));
const hex = (v: unknown, path: string): string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fail(path, "a #rrggbb colour");
const bool = (v: unknown, path: string): boolean => (typeof v === "boolean" ? v : fail(path, "a boolean"));
const oneOf = <T extends string>(v: unknown, options: readonly T[], path: string): T =>
  options.includes(v as T) ? (v as T) : fail(path, options.join(" | "));

function range(o: Obj, path: string) {
  const start = num(o.start, `${path}.start`, 0);
  if (num(o.end, `${path}.end`, 0) <= start) fail(`${path}.end`, "more than start");
}

/** Checks edits.json; `clipIds` are the Recording's Clips, which every reference must name. */
export function parseEdits(v: unknown, clipIds: readonly string[]): Edits {
  const o = obj(v, "edits");
  if (o.version !== EDITS_VERSION) fail("edits.version", String(EDITS_VERSION));
  const clip = (c: unknown, path: string) => (clipIds.includes(str(c, path)) ? c : fail(path, "a Clip of this Recording"));
  arr(o.segments, "edits.segments").forEach((s, i) => {
    const p = `edits.segments[${i}]`;
    const seg = obj(s, p);
    clip(seg.clipId, `${p}.clipId`);
    range(seg, p);
    num(seg.speed, `${p}.speed`, MIN_SPEED, MAX_SPEED);
    oneOf(seg.transition, CLIP_TRANSITIONS, `${p}.transition`);
  });
  arr(o.layouts, "edits.layouts").forEach((l, i) => {
    const p = `edits.layouts[${i}]`;
    const lc = obj(l, p);
    clip(lc.clipId, `${p}.clipId`);
    num(lc.t, `${p}.t`, 0);
    oneOf(lc.layout, [...LAYOUTS, "auto"], `${p}.layout`);
  });
  bool(o.trimDeadAir, "edits.trimDeadAir");
  if (o.deadAir !== null) {
    arr(o.deadAir, "edits.deadAir").forEach((d, i) => {
      const r = obj(d, `edits.deadAir[${i}]`);
      clip(r.clipId, `edits.deadAir[${i}].clipId`);
      range(r, `edits.deadAir[${i}]`);
    });
  }
  const cap = obj(o.captions, "edits.captions");
  bool(cap.enabled, "edits.captions.enabled");
  oneOf(cap.style, CAPTION_STYLES, "edits.captions.style");
  oneOf(cap.position, CAPTION_POSITIONS, "edits.captions.position");
  const frame = obj(o.frame, "edits.frame");
  oneOf(frame.background, BACKGROUNDS, "edits.frame.background");
  num(frame.padding, "edits.frame.padding", 0, MAX_PADDING);
  num(frame.shadow, "edits.frame.shadow", 0, MAX_SHADOW);
  if (frame.corners !== undefined) num(frame.corners, "edits.frame.corners", 0, MAX_CORNERS);
  if (frame.gradient !== undefined) {
    const g = obj(frame.gradient, "edits.frame.gradient");
    hex(g.from, "edits.frame.gradient.from");
    hex(g.to, "edits.frame.gradient.to");
    num(g.angle, "edits.frame.gradient.angle", 0, 360);
  }
  if (o.aspect !== undefined) oneOf(o.aspect, ASPECTS, "edits.aspect");
  if (o.texts !== undefined) {
    const ids = new Set<string>();
    arr(o.texts, "edits.texts").forEach((v, i) => {
      const p = `edits.texts[${i}]`;
      const t = obj(v, p);
      if (ids.has(str(t.id, `${p}.id`))) fail(`${p}.id`, "a unique id");
      ids.add(t.id as string);
      clip(t.clipId, `${p}.clipId`);
      range(t, p);
      str(t.text, `${p}.text`);
      num(t.x, `${p}.x`, 0, 1);
      num(t.y, `${p}.y`, 0, 1);
      num(t.size, `${p}.size`, MIN_TEXT_SIZE, MAX_TEXT_SIZE);
      oneOf(t.font, FONT_IDS, `${p}.font`);
      hex(t.color, `${p}.color`);
      bool(t.box, `${p}.box`);
    });
  }
  if (o.color !== undefined) {
    const c = obj(o.color, "edits.color");
    for (const k of ["brightness", "contrast", "saturation", "temperature"]) num(c[k], `edits.color.${k}`, -100, 100);
  }
  bool(o.enhanceAudio, "edits.enhanceAudio");
  return o as unknown as Edits;
}

// ---- The edited timeline.

/** A stretch of the output video: a range of one Clip placed at output time `at`, lasting `length`. */
export interface Piece extends Segment {
  /** Index of the Segment it comes from. */
  segment: number;
  at: number;
  length: number;
}

/** Removes [a, b) from the ranges, splitting where needed. */
function subtract<T extends { start: number; end: number }>(ranges: T[], a: number, b: number): T[] {
  return ranges.flatMap((r) => {
    if (b <= r.start || a >= r.end) return [r];
    const out: T[] = [];
    if (a > r.start) out.push({ ...r, end: a });
    if (b < r.end) out.push({ ...r, start: b });
    return out;
  });
}

/** What actually plays, in order: the Segments, minus dead air when it is trimmed. */
export function pieces(edits: Edits): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const [segment, seg] of edits.segments.entries()) {
    let parts: Segment[] = [seg];
    if (edits.trimDeadAir) {
      for (const d of edits.deadAir ?? []) if (d.clipId === seg.clipId) parts = subtract(parts, d.start, d.end);
    }
    parts.forEach((p, i) => {
      const length = (p.end - p.start) / p.speed;
      out.push({ ...p, transition: i === 0 ? p.transition : "none", segment, at, length });
      at += length;
    });
  }
  return out;
}

export const outputDuration = (ps: readonly Piece[]) => ps.reduce((n, p) => n + p.length, 0);

/** The Clip moment shown at output time `t` (the last moment for t at or past the end), or null if nothing plays. */
export function toSource(ps: readonly Piece[], t: number): { clipId: string; t: number; piece: number } | null {
  if (!ps.length) return null;
  let i = ps.findIndex((p) => t < p.at + p.length);
  if (i < 0) i = ps.length - 1;
  const p = ps[i];
  const offset = Math.max(0, Math.min(t - p.at, p.length));
  return { clipId: p.clipId, t: Math.min(p.start + offset * p.speed, p.end), piece: i };
}

/** Output time of a Clip moment, or null if that moment was cut. */
export function toOutput(ps: readonly Piece[], clipId: string, t: number): number | null {
  const p = ps.find((p) => p.clipId === clipId && t >= p.start && t < p.end);
  return p ? p.at + (t - p.start) / p.speed : null;
}

/**
 * Where a Clip moment such as a Step or Layout change shows on the Timeline. A moment inside cut time
 * (dead air, a deleted range) still takes effect, so it pins to where the Clip resumes; null only if nothing
 * of the Clip plays after it.
 */
export function markAt(ps: readonly Piece[], clipId: string, t: number): number | null {
  const at = toOutput(ps, clipId, t);
  if (at !== null) return at;
  const next = ps.filter((p) => p.clipId === clipId && p.start > t).sort((a, b) => a.start - b.start)[0];
  return next ? next.at : null;
}

/**
 * How dark the fade between pieces makes output time `t`: 0 = not at all, 1 = black.
 * A fade dips to black over FADE_MS centred on the start of a piece whose transition is "fade".
 */
export function fadeAt(ps: readonly Piece[], t: number): number {
  let dark = 0;
  for (const [i, p] of ps.entries()) {
    if (i === 0 || p.transition !== "fade") continue;
    const half = Math.min(FADE_MS / 2, ps[i - 1].length / 2, p.length / 2);
    const d = Math.abs(t - p.at);
    if (half > 0 && d < half) dark = Math.max(dark, 1 - d / half);
  }
  return dark;
}

/** The Layout set on the Timeline at a Clip moment: the latest change at or before it, in Clip order. */
export function layoutAt(edits: Edits, clipOrder: readonly string[], clipId: string, t: number): Layout | "auto" {
  // Clip index and time as one sortable number; Clips are far shorter than 1e9 ms.
  const pos = (c: string, tt: number) => clipOrder.indexOf(c) * 1e9 + tt;
  const here = pos(clipId, t);
  const before = edits.layouts.filter((l) => pos(l.clipId, l.t) <= here).sort((a, b) => pos(a.clipId, a.t) - pos(b.clipId, b.t));
  return before.at(-1)?.layout ?? "auto";
}

// ---- Operations. Each returns new Edits; output times are on the timeline as currently shown.

/** Splits the Segment playing at output time `t` in two. */
export function split(edits: Edits, t: number): Edits {
  const src = toSource(pieces(edits), t);
  if (!src) return edits;
  const i = edits.segments.findIndex((s) => s.clipId === src.clipId && src.t > s.start && src.t < s.end);
  if (i < 0) return edits;
  const seg = edits.segments[i];
  if (src.t - seg.start < MIN_SEGMENT_MS || seg.end - src.t < MIN_SEGMENT_MS) return edits;
  const segments = [...edits.segments];
  segments.splice(i, 1, { ...seg, end: src.t }, { ...seg, start: src.t, transition: "none" });
  return { ...edits, segments };
}

/** Cuts output range [a, b) out of the video. */
export function deleteRange(edits: Edits, a: number, b: number): Edits {
  if (b <= a) return edits;
  let segments = edits.segments;
  for (const p of pieces(edits)) {
    const from = Math.max(a, p.at);
    const to = Math.min(b, p.at + p.length);
    if (to <= from) continue;
    const s = p.start + (from - p.at) * p.speed;
    const e = to >= p.at + p.length ? p.end : p.start + (to - p.at) * p.speed;
    segments = segments.flatMap((seg) => (seg.clipId === p.clipId ? subtract([seg], s, e) : [seg]));
  }
  return { ...edits, segments: segments.filter((s) => s.end - s.start >= 1) };
}

/** Moves a Segment's ends, kept within its Clip and at least MIN_SEGMENT_MS long. */
export function trim(edits: Edits, index: number, start: number, end: number, clipDurationMs: number): Edits {
  const seg = edits.segments[index];
  if (!seg) return edits;
  const s = Math.max(0, Math.min(start, clipDurationMs - MIN_SEGMENT_MS));
  const e = Math.min(clipDurationMs, Math.max(end, s + MIN_SEGMENT_MS));
  const segments = [...edits.segments];
  segments[index] = { ...seg, start: s, end: e };
  return { ...edits, segments };
}

export function setSpeed(edits: Edits, index: number, speed: number): Edits {
  if (!edits.segments[index]) return edits;
  const segments = [...edits.segments];
  segments[index] = { ...segments[index], speed: Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed)) };
  return { ...edits, segments };
}

export function setTransition(edits: Edits, index: number, transition: ClipTransition): Edits {
  if (!edits.segments[index]) return edits;
  const segments = [...edits.segments];
  segments[index] = { ...segments[index], transition };
  return { ...edits, segments };
}

/** Sets the Layout from output time `t` on. */
export function setLayout(edits: Edits, t: number, layout: Layout | "auto"): Edits {
  const src = toSource(pieces(edits), t);
  if (!src) return edits;
  const layouts = edits.layouts.filter((l) => !(l.clipId === src.clipId && Math.abs(l.t - src.t) < 1));
  return { ...edits, layouts: [...layouts, { clipId: src.clipId, t: Math.round(src.t), layout }] };
}
