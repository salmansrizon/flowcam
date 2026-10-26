import { BOARD_HEIGHT, BOARD_WIDTH, type Board, type Theme } from "./model";
import type { BoardView } from "./log";

export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** What a render needs besides the Board: the Presentation's Theme and decoded Images by `imageId`. */
export interface RenderEnv {
  theme: Theme;
  images: ReadonlyMap<string, CanvasImageSource>;
}

/**
 * Draws a Board in Board units (BOARD_WIDTH x BOARD_HEIGHT); the caller sets the context's transform.
 * Output must depend only on the arguments: no wall clock, no unseeded randomness (ADR 0002).
 */
export interface BoardRenderer {
  render(ctx: Canvas2D, board: Board, view: BoardView, timeMs: number, env?: RenderEnv): void;
}

/** Plain boxes and lines, so the recorder and export can be built before the real renderer lands. */
export const stubRenderer: BoardRenderer = {
  render(ctx, board, view) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    for (const el of board.elements) {
      if (!view.revealedAt.has(el.id)) continue;
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      if (el.type === "arrow") {
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x2 ?? el.x, el.y2 ?? el.y);
        ctx.stroke();
      } else {
        ctx.strokeRect(el.x, el.y, el.width, el.height);
      }
    }
    for (const stroke of view.ink) {
      ctx.beginPath();
      stroke.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  },
};
