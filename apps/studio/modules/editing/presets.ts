import {
  ASPECTS,
  BACKGROUNDS,
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  MAX_CORNERS,
  MAX_PADDING,
  MAX_SHADOW,
  NO_COLOR_CORRECTION,
  type Edits,
  type StylePreset,
} from "./edits";

export const PRESETS_KEY = "flowcam.presets";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const hex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** One stored preset, rebuilt field by field, or null when anything is off. */
function parsePreset(raw: unknown): StylePreset | null {
  if (!isObj(raw) || typeof raw.name !== "string" || !raw.name.trim()) return null;
  const { frame, captions, color } = raw;
  if (!oneOf(ASPECTS, raw.aspect) || !isObj(frame) || !isObj(captions) || !isObj(color)) return null;
  if (!oneOf(BACKGROUNDS, frame.background) || !num(frame.padding, 0, MAX_PADDING) || !num(frame.shadow, 0, MAX_SHADOW)) return null;
  if (frame.corners !== undefined && !num(frame.corners, 0, MAX_CORNERS)) return null;
  const g = frame.gradient;
  if (g !== undefined && !(isObj(g) && hex(g.from) && hex(g.to) && num(g.angle, 0, 360))) return null;
  if (typeof captions.enabled !== "boolean" || !oneOf(CAPTION_STYLES, captions.style) || !oneOf(CAPTION_POSITIONS, captions.position)) return null;
  const c = { ...NO_COLOR_CORRECTION };
  for (const key of Object.keys(c) as (keyof typeof c)[]) {
    if (!num(color[key], -100, 100)) return null;
    c[key] = color[key];
  }
  return {
    name: raw.name.trim(),
    aspect: raw.aspect,
    frame: {
      background: frame.background,
      padding: frame.padding,
      shadow: frame.shadow,
      ...(frame.corners !== undefined && { corners: frame.corners }),
      ...(g !== undefined && { gradient: { from: (g as { from: string }).from, to: (g as { to: string }).to, angle: (g as { angle: number }).angle } }),
    },
    captions: { enabled: captions.enabled, style: captions.style, position: captions.position },
    color: c,
  };
}

/** The valid presets in a parsed JSON value; bad entries are dropped, duplicate names keep the first. */
export function validatePresets(raw: unknown): StylePreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((r) => {
    const p = parsePreset(r);
    if (!p || seen.has(p.name)) return [];
    seen.add(p.name);
    return [p];
  });
}

export function loadPresets(): StylePreset[] {
  try {
    return validatePresets(JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function storePresets(presets: StylePreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Storage is full or blocked: the presets last for this session only.
  }
}

/** The current look as a preset; saving under an existing name replaces it. */
export function presetOf(name: string, e: Edits): StylePreset {
  return { name: name.trim(), aspect: e.aspect ?? "16:9", frame: e.frame, captions: e.captions, color: e.color ?? NO_COLOR_CORRECTION };
}

/** `edits` with the preset's look; everything else (cuts, Layouts, text) is untouched. */
export function applyPreset(e: Edits, p: StylePreset): Edits {
  return { ...e, aspect: p.aspect, frame: p.frame, captions: p.captions, color: p.color };
}
