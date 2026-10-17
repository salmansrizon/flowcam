// Framework-free Board renderer (ADR 0018). Ported from Excaliflow in S2 (ADR 0001), see ../NOTICE.
// Pure in (board, view, timeMs): no clock, no unseeded randomness, no state kept between frames (ADR 0002).
//
// The caller must load these font files before rendering, or text falls back to system fonts:
// Excalifont (hand-drawn, the default), Assistant (sans) and Cascadia (code).
import { BOARD_HEIGHT, BOARD_WIDTH, type Board, type BoardRenderer, type BoardView, type Canvas2D, type Element } from "@flowcam/domain";
import { computeArrowDepths, drawArrowAndParticles, getArrowGeometry } from "./arrows";
import { drawElementText, drawStaticElement } from "./shapes";

const CANVAS_BG = "#ffffff";
const FADE_IN_MS = 300;
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

export const boardRenderer: BoardRenderer = {
  render(ctx: Canvas2D, board: Board, view: BoardView, timeMs: number) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // Same pass order as Excaliflow: shapes, then arrows over them, then text on top.
    // Hidden Elements still anchor arrows, so geometry uses the whole Board.
    const elementsMap = new Map<string, Element>(board.elements.map((el) => [el.id, el]));
    const arrowDepths = computeArrowDepths(board.elements);
    const visible = board.elements.map((el) => ({ el, alpha: alphaAt(view, el.id, timeMs) })).filter((v) => v.alpha > 0);

    for (const { el, alpha } of visible) {
      if (el.type === "arrow") continue;
      ctx.globalAlpha = alpha;
      drawStaticElement(ctx, el);
    }
    for (const { el, alpha } of visible) {
      if (el.type !== "arrow") continue;
      ctx.globalAlpha = alpha;
      drawArrowAndParticles(ctx, el, getArrowGeometry(el, elementsMap), arrowDepths.get(el.id) ?? 0, timeMs, view.flowing.has(el.id));
    }
    for (const { el, alpha } of visible) {
      if (el.type === "arrow") continue;
      ctx.globalAlpha = alpha;
      drawElementText(ctx, el);
    }

    ctx.globalAlpha = 1;
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
