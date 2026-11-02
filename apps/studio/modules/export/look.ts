import type { Aspect, ColorCorrection } from "../editing/edits";

const RATIOS: Record<Aspect, [number, number]> = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:3": [4, 3] };

/** Output size for an aspect whose longer edge is `longEdge` px (1920 for 1080p, 3840 for 4K). */
export function aspectSize(aspect: Aspect, longEdge: number): [number, number] {
  const [w, h] = RATIOS[aspect];
  return w >= h ? [longEdge, Math.round((longEdge * h) / w)] : [Math.round((longEdge * w) / h), longEdge];
}

/** Start and end of a linear gradient over a w x h box; `angle` is CSS-style (0 = up, 90 = right) and the line spans the box's corners. */
export function gradientEndpoints(angle: number, w: number, h: number) {
  const a = (angle * Math.PI) / 180;
  const [dx, dy] = [Math.sin(a), -Math.cos(a)];
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const [cx, cy] = [w / 2, h / 2];
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

/** Greedy word wrap to `maxWidth` using `measure`; explicit newlines are kept and an over-long word gets its own line. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** CSS filter for the Camera's brightness, contrast and saturation, or null when they are all neutral. */
export function colorFilter(c: ColorCorrection): string | null {
  if (!c.brightness && !c.contrast && !c.saturation) return null;
  return `brightness(${1 + c.brightness / 100}) contrast(${1 + c.contrast / 100}) saturate(${1 + c.saturation / 100})`;
}

/** The warm (positive) or cool (negative) tint laid over the Camera, or null at 0. */
export function temperatureTint(t: number): string | null {
  if (!t) return null;
  return t > 0 ? `rgba(255, 140, 0, ${(t / 100) * 0.25})` : `rgba(0, 120, 255, ${(-t / 100) * 0.25})`;
}
