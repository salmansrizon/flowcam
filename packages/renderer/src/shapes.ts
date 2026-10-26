// Ported from Excaliflow (Apache-2.0), see ../NOTICE: advanced_llm_apps/excaliflow/index.html @ 40b16b6.
// Hand-drawn shape paths, hachure fill and font helpers.
import type { Canvas2D, Element, Theme } from "@flowcam/domain";

/**
 * Fonts the caller must load before rendering (the renderer only names them):
 * Excalifont (or Virgil) for "hand", Assistant (or Nunito) for "sans", Cascadia for "code".
 */
const FONT_MAP = {
  hand: "'Excalifont', 'Virgil', 'Patrick Hand', 'Architects Daughter', 'Caveat', cursive",
  sans: "'Assistant', 'Nunito', 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  code: "'Cascadia', 'Geist Mono', monospace",
};
/** Excalidraw's unitless line-height metric. */
const LINE_HEIGHT = 1.25;

function normalizeFontFamily(family: string): keyof typeof FONT_MAP {
  const f = (family || "").toLowerCase();
  if (!f || f === "hand" || /excalifont|virgil|patrick|caveat/.test(f)) return "hand";
  if (f === "sans" || f === "normal" || /assistant|nunito|inter/.test(f) || (f.includes("geist") && !f.includes("mono"))) return "sans";
  if (f === "code" || f === "mono" || /cascadia|mono/.test(f)) return "code";
  return "hand";
}

function getFontCss(family: string, fontSize: number): string {
  const key = normalizeFontFamily(family);
  return `${key === "hand" ? 400 : 500} ${Number(fontSize) || 16}px ${FONT_MAP[key]}`;
}

/** Theme plus whether its background is dark (Excaliflow's isDark switch, generalised from `#000000` to any dark colour). */
export interface Look {
  theme: Theme;
  dark: boolean;
}

const full = (c: string) => (c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c);

export function lookOf(theme: Theme): Look {
  const m = /^#([0-9a-f]{6})$/i.exec(full(theme.background));
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return { theme, dark: lum < 0.5 };
}

/** The M1 default stroke (#171717) means "the Theme's stroke"; any other colour is drawn exactly as given. */
export const resolveStrokeColor = (hex: string, look: Look) => ((hex || "#171717").toLowerCase() === "#171717" ? look.theme.stroke : hex);

function rgba(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(full(color));
  if (!m) return `rgba(128, 128, 128, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Excaliflow's resolveFillTint, with the 7-colour table replaced by a tint of the Element's own colour. */
export function resolveFillTint(hex: string, look: Look, isSticky = false): string {
  if (isSticky && (hex || "#171717").toLowerCase() === "#171717") return look.dark ? "rgba(251, 191, 36, 0.20)" : "#fef3c7";
  return rgba(resolveStrokeColor(hex, look), look.dark ? 0.2 : 0.13);
}

export function mulberry32(seed: number): () => number {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function clampPointToShapeInterior(el: Element, px: number, py: number, inset = 1.5): [number, number] {
  const w = Math.max(2, el.width || 0);
  const h = Math.max(2, el.height || 0);
  const cx = el.x + w / 2;
  const cy = el.y + h / 2;
  const ins = Math.min(Math.max(0, inset), Math.min(w, h) * 0.35);

  if (el.type === "ellipse") {
    const rx = Math.max(1, w / 2 - ins);
    const ry = Math.max(1, h / 2 - ins);
    const ux = (px - cx) / rx;
    const vy = (py - cy) / ry;
    const d2 = ux * ux + vy * vy;
    if (d2 > 0.999) {
      const s = 0.995 / Math.sqrt(d2);
      return [cx + (px - cx) * s, cy + (py - cy) * s];
    }
    return [px, py];
  }
  if (el.type === "diamond") {
    const hw = Math.max(1, w / 2 - ins);
    const hh = Math.max(1, h / 2 - ins);
    const l1 = Math.abs(px - cx) / hw + Math.abs(py - cy) / hh;
    if (l1 > 0.999) {
      const s = 0.995 / l1;
      return [cx + (px - cx) * s, cy + (py - cy) * s];
    }
    return [px, py];
  }

  const xL = el.x + ins;
  const xR = el.x + w - ins;
  const yT = el.y + ins;
  const yB = el.y + h - ins;
  let nx = Math.max(xL, Math.min(xR, px));
  let ny = Math.max(yT, Math.min(yB, py));
  const r = Math.max(0, Math.min(14, w / 4, h / 4) - ins * 0.5);
  if (r > 0.5) {
    const corners: [number, number, boolean][] = [
      [xL + r, yT + r, nx < xL + r && ny < yT + r],
      [xR - r, yT + r, nx > xR - r && ny < yT + r],
      [xR - r, yB - r, nx > xR - r && ny > yB - r],
      [xL + r, yB - r, nx < xL + r && ny > yB - r],
    ];
    for (const [kx, ky, inCorner] of corners) {
      if (!inCorner) continue;
      const dx = nx - kx;
      const dy = ny - ky;
      const d = Math.hypot(dx, dy);
      if (d > r * 0.995) {
        const s = (r * 0.99) / d;
        nx = kx + dx * s;
        ny = ky + dy * s;
      }
    }
  }
  return [nx, ny];
}

function clipSegmentToShape(el: Element, x1: number, y1: number, x2: number, y2: number, inset = 1.8): [number, number, number, number] | null {
  const w = Number(el.width) || 0;
  const h = Number(el.height) || 0;
  if (w <= 2 || h <= 2) return null;

  const cx = el.x + w / 2;
  const cy = el.y + h / 2;
  const ins = Math.min(Math.max(0, Number(inset) || 0), Math.min(w, h) * 0.35);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const finish = (tMin: number, tMax: number): [number, number, number, number] => {
    const [a, b] = clampPointToShapeInterior(el, x1 + tMin * dx, y1 + tMin * dy, ins);
    const [c, d] = clampPointToShapeInterior(el, x1 + tMax * dx, y1 + tMax * dy, ins);
    return [a, b, c, d];
  };

  if (el.type === "ellipse") {
    const rx = Math.max(1, w / 2 - ins);
    const ry = Math.max(1, h / 2 - ins);
    const u1 = (x1 - cx) / rx;
    const v1 = (y1 - cy) / ry;
    const du = dx / rx;
    const dv = dy / ry;
    const A = du * du + dv * dv;
    const B = 2 * (u1 * du + v1 * dv);
    const C = u1 * u1 + v1 * v1 - 1;
    if (A < 1e-12) return C <= 0 ? [x1, y1, x2, y2] : null;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return null;
    const sqrtD = Math.sqrt(disc);
    const t0 = (-B - sqrtD) / (2 * A);
    const t1 = (-B + sqrtD) / (2 * A);
    const tMin = Math.max(0, Math.min(t0, t1));
    const tMax = Math.min(1, Math.max(t0, t1));
    if (tMin >= tMax - 1e-5) return null;
    return finish(tMin, tMax);
  }

  if (el.type === "diamond") {
    const hw = Math.max(1, w / 2 - ins);
    const hh = Math.max(1, h / 2 - ins);
    let tMin = 0;
    let tMax = 1;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = sx * (dx / hw) + sy * (dy / hh);
      const q = 1 - (sx * ((x1 - cx) / hw) + sy * ((y1 - cy) / hh));
      if (Math.abs(p) < 1e-12) {
        if (q < 0) return null;
      } else if (p > 0) tMax = Math.min(tMax, q / p);
      else tMin = Math.max(tMin, q / p);
      if (tMin >= tMax - 1e-5) return null;
    }
    return finish(tMin, tMax);
  }

  const xL = el.x + ins;
  const xR = el.x + w - ins;
  const yT = el.y + ins;
  const yB = el.y + h - ins;
  if (xL >= xR || yT >= yB) return null;

  let tMin = 0;
  let tMax = 1;
  const pArr = [-dx, dx, -dy, dy];
  const qArr = [x1 - xL, xR - x1, y1 - yT, yB - y1];
  for (let i = 0; i < 4; i++) {
    const p = pArr[i];
    const q = qArr[i];
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) tMin = Math.max(tMin, r);
      else tMax = Math.min(tMax, r);
      if (tMin >= tMax - 1e-5) return null;
    }
  }

  const r = Math.max(0, (el.type === "sticky" ? 4 : Math.min(14, w / 4, h / 4)) - ins * 0.5);
  if (r > 0.5) {
    const clipCornerCircle = (tVal: number, isStart: boolean): number | null => {
      const px = x1 + tVal * dx;
      const py = y1 + tVal * dy;
      let kx: number;
      let ky: number;
      if (px < xL + r && py < yT + r) { kx = xL + r; ky = yT + r; }
      else if (px > xR - r && py < yT + r) { kx = xR - r; ky = yT + r; }
      else if (px > xR - r && py > yB - r) { kx = xR - r; ky = yB - r; }
      else if (px < xL + r && py > yB - r) { kx = xL + r; ky = yB - r; }
      else return tVal;

      const ox = x1 - kx;
      const oy = y1 - ky;
      if (ox * ox + oy * oy <= r * r && !isStart) return tVal;
      const A = dx * dx + dy * dy;
      const B = 2 * (ox * dx + oy * dy);
      const C = ox * ox + oy * oy - r * r;
      const disc = B * B - 4 * A * C;
      if (disc <= 0 || A < 1e-12) return null;
      const sD = Math.sqrt(disc);
      const ca = (-B - sD) / (2 * A);
      const cb = (-B + sD) / (2 * A);
      return isStart ? Math.max(tVal, Math.min(ca, cb)) : Math.min(tVal, Math.max(ca, cb));
    };
    const ntMin = clipCornerCircle(tMin, true);
    const ntMax = clipCornerCircle(tMax, false);
    if (ntMin === null || ntMax === null || ntMin >= ntMax - 1e-5) return null;
    tMin = ntMin;
    tMax = ntMax;
  }
  return finish(tMin, tMax);
}

function roughEdge(path: Path2D, x1: number, y1: number, x2: number, y2: number, rng: Rng, roughness: number) {
  const r = Number(roughness) || 0;
  if (r <= 0.001) {
    path.moveTo(x1, y1);
    path.lineTo(x2, y2);
    return;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const isCartoon = r > 1.2;
  const passes = isCartoon ? 3 : 2;
  const endJit = isCartoon ? 4.8 : 1.6 * r;
  const bowMag = isCartoon ? Math.min(11.0, Math.max(4.8, len * 0.055)) : Math.min(4.8, Math.max(2.2, len * 0.025)) * r;

  for (let pass = 0; pass < passes; pass++) {
    const sign = pass === 0 ? 1 : pass === 1 ? -0.9 : 0.55;
    const overshoot = isCartoon ? (pass === 0 ? 3.5 : -2.0) : 0;
    const ux = dx / len;
    const uy = dy / len;
    const sx = x1 - ux * overshoot + (rng() - 0.5) * endJit;
    const sy = y1 - uy * overshoot + (rng() - 0.5) * endJit;
    const ex = x2 + ux * overshoot + (rng() - 0.5) * endJit;
    const ey = y2 + uy * overshoot + (rng() - 0.5) * endJit;
    const bow1 = sign * bowMag * (0.75 + rng() * 0.5);
    const bow2 = (isCartoon && pass === 2 ? -sign : sign) * bowMag * (0.65 + rng() * 0.5);
    path.moveTo(sx, sy);
    path.bezierCurveTo(x1 + dx * 0.33 + nx * bow1, y1 + dy * 0.33 + ny * bow1, x1 + dx * 0.67 + nx * bow2, y1 + dy * 0.67 + ny * bow2, ex, ey);
  }
}

function cleanRoundRect(path: Path2D, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.max(0, Math.min(r, w / 2, h / 2));
  path.moveTo(x + cr, y);
  path.lineTo(x + w - cr, y);
  path.quadraticCurveTo(x + w, y, x + w, y + cr);
  path.lineTo(x + w, y + h - cr);
  path.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
  path.lineTo(x + cr, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - cr);
  path.lineTo(x, y + cr);
  path.quadraticCurveTo(x, y, x + cr, y);
  path.closePath();
}

function roughRoundRect(path: Path2D, x: number, y: number, w: number, h: number, r: number, rng: Rng, roughness: number) {
  const cr = Math.max(0, Math.min(r, w / 4, h / 4));
  if (!roughness || roughness <= 0.001) {
    cleanRoundRect(path, x, y, w, h, cr);
    return;
  }
  const isCartoon = roughness > 1.2;
  const passes = isCartoon ? 3 : 2;
  for (let p = 0; p < passes; p++) {
    const sign = p === 0 ? 1 : p === 1 ? -0.95 : 0.6;
    const jit = isCartoon ? 4.5 : 1.6 * roughness;
    const bow = (isCartoon ? 9.5 : 3.8 * roughness) * sign;
    const j = () => (rng() - 0.5) * jit;
    const b = () => bow * (0.75 + rng() * 0.5);

    const t1x = x + cr + j(), t1y = y + j();
    const t2x = x + w - cr + j(), t2y = y + j();
    const r1x = x + w + j(), r1y = y + cr + j();
    const r2x = x + w + j(), r2y = y + h - cr + j();
    const b1x = x + w - cr + j(), b1y = y + h + j();
    const b2x = x + cr + j(), b2y = y + h + j();
    const l1x = x + j(), l1y = y + h - cr + j();
    const l2x = x + j(), l2y = y + cr + j();

    path.moveTo(t1x, t1y);
    path.quadraticCurveTo((t1x + t2x) / 2 + j(), (t1y + t2y) / 2 - b(), t2x, t2y);
    path.quadraticCurveTo(x + w + j(), y + j(), r1x, r1y);
    path.quadraticCurveTo((r1x + r2x) / 2 + b(), (r1y + r2y) / 2 + j(), r2x, r2y);
    path.quadraticCurveTo(x + w + j(), y + h + j(), b1x, b1y);
    path.quadraticCurveTo((b1x + b2x) / 2 + j(), (b1y + b2y) / 2 + b(), b2x, b2y);
    path.quadraticCurveTo(x + j(), y + h + j(), l1x, l1y);
    path.quadraticCurveTo((l1x + l2x) / 2 - b(), (l1y + l2y) / 2 + j(), l2x, l2y);
    path.quadraticCurveTo(x + j(), y + j(), t1x, t1y);
  }
}

function roughEllipse(path: Path2D, cx: number, cy: number, rx: number, ry: number, rng: Rng, roughness: number) {
  if (!roughness || roughness <= 0.001) {
    path.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    return;
  }
  const isCartoon = roughness > 1.2;
  const steps = 16;
  const passes = isCartoon ? 3 : 2;
  for (let pass = 0; pass < passes; pass++) {
    const sign = pass === 0 ? 1 : pass === 1 ? -1 : 0.65;
    const waveAmp = isCartoon ? 5.8 : 2.4 * roughness;
    const jitAmp = isCartoon ? 3.6 : 1.2 * roughness;
    const phase = rng() * Math.PI * 2 + pass * 1.7;
    const cxShift = sign * (isCartoon ? 2.4 : 0.9 * roughness);
    const cyShift = -sign * (isCartoon ? 2.0 : 0.8 * roughness);
    const pts: [number, number][] = [];
    for (let i = 0; i < steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const radialWave = Math.sin(theta * 2 + phase) * waveAmp * sign;
      const curRx = Math.max(2, rx + radialWave);
      const curRy = Math.max(2, ry - radialWave * 0.75);
      pts.push([cx + cxShift + Math.cos(theta) * curRx + (rng() - 0.5) * jitAmp, cy + cyShift + Math.sin(theta) * curRy + (rng() - 0.5) * jitAmp]);
    }
    path.moveTo((pts[steps - 1][0] + pts[0][0]) / 2, (pts[steps - 1][1] + pts[0][1]) / 2);
    const totalSteps = isCartoon && pass === 0 ? steps + 1 : steps;
    for (let i = 0; i < totalSteps; i++) {
      const curr = pts[i % steps];
      const next = pts[(i + 1) % steps];
      path.quadraticCurveTo(curr[0], curr[1], (curr[0] + next[0]) / 2, (curr[1] + next[1]) / 2);
    }
  }
}

/** Outline, clip shape and hachure lines for a rectangle, ellipse or diamond. Pure in `el`. */
function shapePaths(el: Element) {
  // Excaliflow also mixed in a per-edit versionNonce; Elements here are immutable, so it is 1.
  const rng = mulberry32((Number(el.seed) || 1) ^ 1);
  const fillPath = new Path2D();
  const strokePath = new Path2D();
  const hachurePath = new Path2D();
  const x = Number(el.x) || 0;
  const y = Number(el.y) || 0;
  const w = Math.max(2, Number(el.width) || 0);
  const h = Math.max(2, Number(el.height) || 0);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const roughness = el.roughness ?? 0.85;

  if (el.type === "ellipse") {
    const rx = Math.max(1, w / 2);
    const ry = Math.max(1, h / 2);
    fillPath.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    roughEllipse(strokePath, cx, cy, rx, ry, rng, roughness);
  } else if (el.type === "diamond") {
    const top = [cx, y], right = [x + w, cy], bottom = [cx, y + h], left = [x, cy];
    fillPath.moveTo(top[0], top[1]);
    fillPath.lineTo(right[0], right[1]);
    fillPath.lineTo(bottom[0], bottom[1]);
    fillPath.lineTo(left[0], left[1]);
    fillPath.closePath();
    roughEdge(strokePath, top[0], top[1], right[0], right[1], rng, roughness);
    roughEdge(strokePath, right[0], right[1], bottom[0], bottom[1], rng, roughness);
    roughEdge(strokePath, bottom[0], bottom[1], left[0], left[1], rng, roughness);
    roughEdge(strokePath, left[0], left[1], top[0], top[1], rng, roughness);
  } else {
    const sticky = el.type === "sticky";
    const r = sticky ? 4 : Math.min(14, w / 4, h / 4);
    cleanRoundRect(fillPath, x, y, w, h, r);
    roughRoundRect(strokePath, x, y, w, h, r, rng, sticky ? roughness * 0.65 : roughness);
  }

  if (el.fillStyle === "hachure") {
    const isCartoon = roughness > 1.2;
    const spacing = roughness <= 0.001 ? 8.0 : isCartoon ? 11.0 : 8.5;
    const inset = Math.max(2.2, (Number(el.strokeWidth) || 2) * 0.9);
    const diag = w + h;
    const hatchBow = roughness <= 0.001 ? 0 : isCartoon ? 12.0 : roughness * 4.5;

    const addSegment = (rawX1: number, rawY1: number, rawX2: number, rawY2: number) => {
      const clipped = clipSegmentToShape(el, rawX1, rawY1, rawX2, rawY2, inset);
      if (!clipped) return;
      const [cx1, cy1, cx2, cy2] = clipped;
      if (Math.hypot(cx2 - cx1, cy2 - cy1) <= 1.5) return;
      if (hatchBow <= 0.001) {
        hachurePath.moveTo(cx1, cy1);
        hachurePath.lineTo(cx2, cy2);
        return;
      }
      const sign = rng() > 0.5 ? 1 : -1;
      const rawMx = (cx1 + cx2) / 2 + sign * hatchBow * (0.6 + rng() * 0.4);
      const rawMy = (cy1 + cy2) / 2 - sign * hatchBow * (0.6 + rng() * 0.4);
      const [mx, my] = clampPointToShapeInterior(el, rawMx, rawMy, inset);
      hachurePath.moveTo(cx1, cy1);
      hachurePath.quadraticCurveTo(mx, my, cx2, cy2);
    };
    for (let d = -diag; d <= diag; d += spacing) {
      const jStep = isCartoon ? (rng() - 0.5) * 3.5 : 0;
      addSegment(x + d + jStep, y + h, x + d + h + jStep, y);
    }
  }
  return { fillPath, strokePath, hachurePath };
}

export function applyDashStyle(ctx: Canvas2D, strokeStyle: string, strokeWidth: number) {
  const sw = Number(strokeWidth) || 2;
  if (strokeStyle === "dashed") ctx.setLineDash([8, 8 + sw]);
  else if (strokeStyle === "dotted") ctx.setLineDash([1.5, 6 + sw]);
  else ctx.setLineDash([]);
}

/** Rough length of the hand-drawn outline, used to size the draw-on dash. */
function outlineLength(el: Element): number {
  const w = Math.max(2, el.width), h = Math.max(2, el.height);
  const passes = (el.roughness ?? 0.85) > 1.2 ? 3 : (el.roughness ?? 0.85) > 0.001 ? 2 : 1;
  const per = el.type === "ellipse" ? Math.PI * (1.5 * (w / 2 + h / 2) - Math.sqrt((w / 2) * (h / 2))) : el.type === "diamond" ? 2 * Math.hypot(w, h) : 2 * (w + h);
  return per * passes * 1.1;
}

/** Strokes only the first `progress` of a path by dash offset (the draw-on effect). */
export function applyDrawOn(ctx: Canvas2D, length: number, progress: number) {
  ctx.setLineDash([length, length]);
  ctx.lineDashOffset = length * (1 - progress);
}

/** Draws a rectangle, ellipse, diamond, sticky or freedraw Element (text, images and arrows are separate passes). `progress` < 1 draws it on. */
export function drawStaticElement(ctx: Canvas2D, el: Element, look: Look, progress = 1) {
  if (el.type === "arrow" || el.type === "text" || el.type === "image") return;
  const strokeColor = resolveStrokeColor(el.strokeColor, look);
  const sw = Number(el.strokeWidth) || 2.2;
  const sticky = el.type === "sticky";

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (el.type === "freedraw") {
    const pts = el.points ?? [];
    if (pts.length > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = sw;
      applyDashStyle(ctx, el.strokeStyle, sw);
      if (progress < 1) {
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        applyDrawOn(ctx, len * 1.05 + 1, progress);
      }
      ctx.beginPath();
      ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        ctx.quadraticCurveTo(el.x + a[0], el.y + a[1], el.x + (a[0] + b[0]) / 2, el.y + (a[1] + b[1]) / 2);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(el.x + last[0], el.y + last[1]);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // ponytail: paths are rebuilt every frame (no cache, so no cross-frame state); add a WeakMap keyed by Element if a profile says so.
  const paths = shapePaths(el);
  const base = ctx.globalAlpha;
  if (el.fillStyle !== "none") {
    ctx.save();
    ctx.globalAlpha = base * progress;
    ctx.fillStyle = resolveFillTint(el.strokeColor, look, sticky);
    if (sticky) {
      // Sticky note drop shadow, as in Excaliflow.
      ctx.shadowColor = "rgba(0, 0, 0, 0.14)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
    }
    ctx.fill(paths.fillPath);
    ctx.restore();
  }
  if (el.fillStyle === "hachure") {
    ctx.save();
    ctx.clip(paths.fillPath);
    ctx.strokeStyle = strokeColor;
    ctx.globalAlpha = base * progress * (look.dark ? 0.44 : 0.36);
    ctx.lineWidth = Math.max(1.0, sw * 0.5);
    ctx.setLineDash([]);
    ctx.stroke(paths.hachurePath);
    ctx.restore();
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = el.strokeStyle !== "solid" ? sw + 0.5 : sw;
  applyDashStyle(ctx, el.strokeStyle, sw);
  if (progress < 1) applyDrawOn(ctx, outlineLength(el), progress);
  ctx.stroke(paths.strokePath);
  ctx.restore();
}

/** Draws an Image Element's picture into its box; without the picture, a hand-drawn placeholder box with a small picture icon. */
export function drawImageElement(ctx: Canvas2D, el: Element, look: Look, picture: CanvasImageSource | undefined, progress = 1) {
  const { x, y } = el;
  const w = Math.max(2, el.width), h = Math.max(2, el.height);
  if (picture) {
    ctx.save();
    ctx.globalAlpha *= progress;
    ctx.drawImage(picture, x, y, w, h);
    ctx.restore();
    return;
  }
  drawStaticElement(ctx, { ...el, type: "rectangle", fillStyle: "hachure" }, look, progress);
  const s = Math.min(w, h) * 0.4;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save();
  ctx.globalAlpha *= progress;
  ctx.strokeStyle = resolveStrokeColor(el.strokeColor, look);
  ctx.lineWidth = Math.max(1.5, (Number(el.strokeWidth) || 2) * 0.9);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.strokeRect(cx - s / 2, cy - s * 0.375, s, s * 0.75);
  ctx.beginPath();
  ctx.moveTo(cx - s / 2, cy + s * 0.3);
  ctx.lineTo(cx - s * 0.15, cy - s * 0.05);
  ctx.lineTo(cx + s * 0.05, cy + s * 0.15);
  ctx.lineTo(cx + s * 0.2, cy - s * 0.02);
  ctx.lineTo(cx + s / 2, cy + s * 0.3);
  ctx.moveTo(cx - s * 0.1, cy - s * 0.17);
  ctx.arc(cx - s * 0.2, cy - s * 0.17, s * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawElementText(ctx: Canvas2D, el: Element, look: Look) {
  if (el.type === "arrow" || el.type === "image" || !el.text || el.text.trim().length === 0) return;
  const fontSize = Number(el.fontSize) || 16;
  const lineHeight = Math.round(fontSize * LINE_HEIGHT);
  const lines = el.text.split("\n");
  ctx.save();
  ctx.font = getFontCss(el.fontFamily, fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const centerX = el.x + (el.width || 0) / 2;
  const centerY = el.y + (el.height || 0) / 2;
  const startY = centerY - (lines.length * lineHeight) / 2 + lineHeight / 2;
  ctx.fillStyle = resolveStrokeColor(el.strokeColor, look);
  lines.forEach((line, i) => ctx.fillText(line, centerX, startY + i * lineHeight));
  ctx.restore();
}
