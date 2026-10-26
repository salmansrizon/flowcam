// Framework-free Board renderer (ADR 0018). Ported from Excaliflow in S2 (ADR 0001), see ../NOTICE.
// Pure in (board, view, timeMs): no clock, no unseeded randomness, no state kept between frames (ADR 0002).
//
// The caller must load these font files before rendering, or text falls back to system fonts:
// Excalifont (hand-drawn, the default), Assistant (sans) and Cascadia (code).
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  boundsOf,
  themeById,
  type Board,
  type BoardRenderer,
  type BoardView,
  type Canvas2D,
  type Element,
  type Presentation,
  type PresentationView,
  type Rect,
  type RenderEnv,
} from "@flowcam/domain";
import { computeArrowDepths, drawArrowAndParticles, getArrowGeometry } from "./arrows";
import { drawElementText, drawImageElement, drawStaticElement, lookOf, type Look } from "./shapes";

const FADE_IN_MS = 300;
const DRAW_ON_MS = 800;
const HIGHLIGHT_MS = 300;
const MORPH_MS = 600;
const FOCUS_MS = 600;
const TRANSITION_MS = 600;
const GLOW = "255, 212, 59";
const INK_COLOR = "#e03131";
const INK_WIDTH = 4;
const POINTER_RADIUS = 8;

function alphaAt(view: BoardView, id: string, timeMs: number): number {
  const revealedAt = view.revealedAt.get(id);
  if (revealedAt === undefined) return 0;
  if (revealedAt === -Infinity) return 1;
  return Math.min(1, Math.max(0, (timeMs - revealedAt) / FADE_IN_MS));
}

function drawInk(ctx: Canvas2D, points: readonly (readonly number[])[]) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  if (points.length === 1) ctx.lineTo(points[0][0] + 0.01, points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    ctx.quadraticCurveTo(points[i][0], points[i][1], (points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2);
  }
  if (points.length > 1) ctx.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
  ctx.stroke();
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Visible area at `timeMs`: the focus rect animated, grown to 16:9 around its centre. */
function focusRect(view: BoardView, timeMs: number): Rect {
  const whole = { x: 0, y: 0, width: BOARD_WIDTH, height: BOARD_HEIGHT };
  const f = ease(clamp01((timeMs - view.focus.at) / FOCUS_MS));
  const a = view.focus.from ?? whole;
  const b = view.focus.to ?? whole;
  const r = { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), width: lerp(a.width, b.width, f), height: lerp(a.height, b.height, f) };
  const w = Math.max(1, Math.max(r.width, (r.height * BOARD_WIDTH) / BOARD_HEIGHT));
  const h = (w * BOARD_HEIGHT) / BOARD_WIDTH;
  return { x: r.x + r.width / 2 - w / 2, y: r.y + r.height / 2 - h / 2, width: w, height: h };
}

/** The Board's Elements as drawn now: Theme font and roughness applied, morphs interpolated (bound arrows read these boxes). */
function effectiveElements(board: Board, view: BoardView, timeMs: number, look: Look): Element[] {
  return board.elements.map((el) => {
    const out = { ...el, fontFamily: look.theme.fontFamily, roughness: look.theme.roughness };
    const m = view.morphs.get(el.id);
    if (!m || el.type === "arrow") return out;
    const f = ease(clamp01((timeMs - m.at) / MORPH_MS));
    out.x = lerp(m.from.x, m.to.x, f);
    out.y = lerp(m.from.y, m.to.y, f);
    out.width = lerp(m.from.width, m.to.width, f);
    out.height = lerp(m.from.height, m.to.height, f);
    if (out.points && el.width > 0 && el.height > 0) out.points = out.points.map(([px, py]) => [(px * out.width) / el.width, (py * out.height) / el.height]);
    return out;
  });
}

function drawGlow(ctx: Canvas2D, el: Element, alpha: number) {
  const b = boundsOf(el);
  const pad = 14;
  ctx.save();
  ctx.fillStyle = `rgba(${GLOW}, ${0.32 * alpha})`;
  ctx.shadowColor = `rgba(${GLOW}, ${0.9 * alpha})`;
  ctx.shadowBlur = 28;
  ctx.beginPath();
  ctx.roundRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, 18);
  ctx.fill();
  ctx.restore();
}

export const boardRenderer: BoardRenderer = {
  render(ctx: Canvas2D, board: Board, view: BoardView, timeMs: number, env?: RenderEnv) {
    const look = lookOf(env?.theme ?? themeById("paper"));
    // The caller may set globalAlpha (cross-fade); every alpha below is relative to it.
    const outer = ctx.globalAlpha;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = look.theme.background;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    const focus = focusRect(view, timeMs);
    const scale = BOARD_WIDTH / focus.width;
    ctx.scale(scale, scale);
    ctx.translate(-focus.x, -focus.y);

    // Same pass order as Excaliflow: shapes, then arrows over them, then text on top.
    // Hidden Elements still anchor arrows, so geometry uses the whole Board.
    const elements = effectiveElements(board, view, timeMs, look);
    const elementsMap = new Map<string, Element>(elements.map((el) => [el.id, el]));
    const arrowDepths = computeArrowDepths(elements);
    const visible = elements.flatMap((el) => {
      const rev = view.revealedAt.get(el.id);
      if (rev === undefined) return [];
      if (view.drawOn.has(el.id) && rev !== -Infinity) {
        const progress = clamp01((timeMs - rev) / DRAW_ON_MS);
        return progress > 0 ? [{ el, alpha: 1, progress }] : [];
      }
      const alpha = alphaAt(view, el.id, timeMs);
      return alpha > 0 ? [{ el, alpha, progress: 1 }] : [];
    });

    for (const [id, at] of view.highlighted) {
      const v = visible.find((x) => x.el.id === id);
      if (!v) continue;
      ctx.globalAlpha = outer * v.alpha;
      drawGlow(ctx, v.el, clamp01((timeMs - at) / HIGHLIGHT_MS));
    }
    for (const { el, alpha, progress } of visible) {
      if (el.type === "arrow") continue;
      ctx.globalAlpha = outer * alpha;
      if (el.type === "image") drawImageElement(ctx, el, look, el.imageId === undefined ? undefined : env?.images.get(el.imageId), progress);
      else drawStaticElement(ctx, el, look, progress);
    }
    for (const { el, alpha, progress } of visible) {
      if (el.type !== "arrow") continue;
      ctx.globalAlpha = outer * alpha;
      drawArrowAndParticles(ctx, el, getArrowGeometry(el, elementsMap), arrowDepths.get(el.id) ?? 0, timeMs, view.flowing.has(el.id), look, progress);
    }
    for (const { el, alpha, progress } of visible) {
      if (el.type === "arrow" || progress < 1) continue;
      ctx.globalAlpha = outer * alpha;
      drawElementText(ctx, el, look);
    }

    ctx.globalAlpha = outer;
    ctx.strokeStyle = INK_COLOR;
    ctx.lineWidth = INK_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of view.ink) drawInk(ctx, stroke.points);

    if (view.pointer) {
      ctx.fillStyle = INK_COLOR;
      ctx.beginPath();
      ctx.arc(view.pointer.x, view.pointer.y, POINTER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
};

/**
 * Draws what the Presentation shows at `timeMs`: the current Board with its focus, or a Board change
 * (fade, slide, none) for TRANSITION_MS after it. Pure in its arguments, like `boardRenderer.render`.
 */
export function renderFrame(ctx: Canvas2D, presentation: Presentation, pv: PresentationView, timeMs: number, env?: RenderEnv) {
  const board = presentation.boards[pv.boardIndex];
  const tr = pv.transition;
  const p = tr && tr.kind !== "none" ? (timeMs - tr.at) / TRANSITION_MS : 1;
  const old = tr && presentation.boards[tr.from];
  ctx.save();
  if (!tr || !old || p < 0 || p >= 1) {
    boardRenderer.render(ctx, board, pv.view, timeMs, env);
  } else if (tr.kind === "fade") {
    boardRenderer.render(ctx, old, tr.fromView, timeMs, env);
    ctx.globalAlpha = ease(p);
    boardRenderer.render(ctx, board, pv.view, timeMs, env);
  } else {
    const e = ease(p);
    ctx.beginPath();
    ctx.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.clip();
    ctx.save();
    ctx.translate(-e * BOARD_WIDTH, 0);
    boardRenderer.render(ctx, old, tr.fromView, timeMs, env);
    ctx.restore();
    ctx.translate((1 - e) * BOARD_WIDTH, 0);
    boardRenderer.render(ctx, board, pv.view, timeMs, env);
  }
  ctx.restore();
}
