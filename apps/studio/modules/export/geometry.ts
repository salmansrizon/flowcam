import { BOARD_HEIGHT, BOARD_WIDTH, type Layout, type Rect } from "@flowcam/domain";

/** Where the Board sits in the picture for a Layout, in Board units; shared by export and Presenter View. */
export function boardArea(layout: Layout): Rect {
  if (layout !== "side-by-side") return { x: 0, y: 0, width: BOARD_WIDTH, height: BOARD_HEIGHT };
  const height = (1220 * BOARD_HEIGHT) / BOARD_WIDTH;
  return { x: 40, y: (BOARD_HEIGHT - height) / 2, width: 1220, height };
}
