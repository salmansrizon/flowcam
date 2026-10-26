import { InvalidDataError } from "@flowcam/domain";
import type { CaptionPosition, CaptionStyle, Piece } from "../editing/edits";

// The Transcript (CONTEXT.md) of a Presented Recording: timed lines per Clip, in that Clip's source ms.
// Stored as recordings/<id>/transcript.json.

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  version: 1;
  /** Clip id to its spoken lines, sorted by start. */
  clips: Record<string, TranscriptSegment[]>;
}

export function parseTranscript(v: unknown): Transcript {
  const bad = () => new InvalidDataError("transcript: expected { version: 1, clips: { [clipId]: { start, end, text }[] } }");
  const o = v as Transcript;
  if (typeof o !== "object" || o === null || o.version !== 1 || typeof o.clips !== "object" || o.clips === null) throw bad();
  for (const segs of Object.values(o.clips)) {
    if (!Array.isArray(segs)) throw bad();
    for (const s of segs) {
      const ok = typeof s?.text === "string" && Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end >= s.start;
      if (!ok) throw bad();
    }
  }
  return o;
}

/** What transformers.js's speech recognition pipeline returns with `return_timestamps: true`. */
export interface WhisperOutput {
  text: string;
  chunks?: { text: string; timestamp: [number, number | null] }[];
}

/** Whisper's chunks (seconds) as Transcript lines (ms). An open-ended last chunk ends at the Clip's end. */
export function fromWhisper(out: WhisperOutput, clipDurationMs: number): TranscriptSegment[] {
  return (out.chunks ?? [])
    .map(({ text, timestamp: [s, e] }) => ({
      start: Math.round(Math.min(s * 1000, clipDurationMs)),
      end: Math.round(Math.min(e === null ? clipDurationMs : e * 1000, clipDurationMs)),
      text: text.trim(),
    }))
    .filter((c) => c.text && c.end > c.start);
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Caption cues in output time: each line clipped to what the edits keep, joined again where a cut left it whole. */
export function cuesFor(ps: readonly Piece[], transcript: Transcript): Cue[] {
  const cues: Cue[] = [];
  for (const p of ps) {
    for (const seg of transcript.clips[p.clipId] ?? []) {
      const s = Math.max(seg.start, p.start);
      const e = Math.min(seg.end, p.end);
      if (e <= s) continue;
      const cue = { start: p.at + (s - p.start) / p.speed, end: p.at + (e - p.start) / p.speed, text: seg.text };
      const last = cues.at(-1);
      if (last && last.text === cue.text && cue.start - last.end < 1) last.end = cue.end;
      else cues.push(cue);
    }
  }
  return cues;
}

export const cueAt = (cues: readonly Cue[], t: number) => cues.find((c) => t >= c.start && t < c.end) ?? null;

function stamp(ms: number, sep: "," | ".") {
  const total = Math.max(0, Math.round(ms));
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor(total / 60_000) % 60;
  const s = Math.floor(total / 1000) % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(total % 1000, 3)}`;
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export const toSrt = (cues: readonly Cue[]) =>
  cues.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${oneLine(c.text)}\n`).join("\n");

/** WebVTT; "-->" inside text would end the cue timing line, so it is broken up. */
export const toVtt = (cues: readonly Cue[]) =>
  `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${oneLine(c.text).replace(/-->/g, "->")}\n`).join("\n")}`;

/** How each caption style looks, in a 1920x1080 frame. */
export const CAPTION_LOOKS: Record<CaptionStyle, { name: string; font: string; color: string; box: string | null; outline: string | null }> = {
  classic: { name: "Classic", font: "500 44px system-ui, sans-serif", color: "#ffffff", box: "rgba(0, 0, 0, 0.72)", outline: null },
  bold: { name: "Bold", font: "800 56px system-ui, sans-serif", color: "#ffe066", box: null, outline: "#111111" },
  minimal: { name: "Minimal", font: "400 40px system-ui, sans-serif", color: "#ffffff", box: null, outline: "rgba(0, 0, 0, 0.6)" },
};

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Wraps `text` to lines no wider than `maxWidth`. */
function wrap(ctx: Canvas2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of oneLine(text).split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws one caption over a `width` x `height` frame (sizes are for 1920 wide and scale with it). */
export function drawCaption(ctx: Canvas2D, text: string, style: CaptionStyle, position: CaptionPosition, width: number, height: number) {
  const look = CAPTION_LOOKS[style];
  const k = width / 1920;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.font = look.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = parseInt(look.font.split(" ")[1], 10);
  const lineH = size * 1.3;
  const lines = wrap(ctx, text, 1500).slice(-2);
  const h = height / k;
  const blockH = lines.length * lineH;
  const top = position === "top" ? 70 : h - 70 - blockH;
  if (look.box) {
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48;
    ctx.fillStyle = look.box;
    ctx.beginPath();
    ctx.roundRect(960 - w / 2, top - 12, w, blockH + 24, 14);
    ctx.fill();
  }
  lines.forEach((l, i) => {
    const y = top + lineH * (i + 0.5);
    if (look.outline) {
      ctx.lineJoin = "round";
      ctx.lineWidth = size / 6;
      ctx.strokeStyle = look.outline;
      ctx.strokeText(l, 960, y);
    }
    ctx.fillStyle = look.color;
    ctx.fillText(l, 960, y);
  });
  ctx.restore();
}
