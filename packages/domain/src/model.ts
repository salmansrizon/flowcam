// Field names follow Excaliflow's element model so the renderer port (ADR 0001) maps one to one.

/** Boards are drawn in a fixed 16:9 frame; callers scale the canvas context to their output size. */
export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;

export const ELEMENT_TYPES = ["rectangle", "ellipse", "diamond", "arrow", "text", "freedraw"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];
export type FillStyle = "hachure" | "solid" | "none";
export type StrokeStyle = "solid" | "dashed" | "dotted";

/** Where an arrow end attaches to a shape. */
export interface Binding {
  elementId: string;
  focusAngle: number | null;
  coreCenter: boolean;
  side: "top" | "right" | "bottom" | "left";
  gap: number;
}

export interface Element {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  fontFamily: string;
  fontSize: number;
  text: string;
  /** Seeds the hand-drawn jitter, so an Element looks the same on every render. */
  seed: number;
  // Arrows: (x, y) is the start and (x2, y2) the end.
  x2?: number;
  y2?: number;
  curveType?: "curved" | "straight";
  curveOffset?: number;
  /** Whether the arrow's Flow is on before any Flow Step changes it. */
  flowEnabled?: boolean;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  /** Freedraw: points relative to (x, y). */
  points?: [number, number][];
}

export type Step =
  | { id: string; kind: "reveal"; elementIds: string[] }
  | { id: string; kind: "flow"; arrowId: string; on: boolean };

export interface Board {
  id: string;
  elements: Element[];
  /** The Board's Sequence. */
  steps: Step[];
}

export interface Presentation {
  version: 1;
  id: string;
  title: string;
  themeId: string;
  boards: Board[];
}

/** Steps created from drawing order: one reveal per Element (ADR 0012, PRODUCT.md §2). */
export function stepsFromDrawingOrder(elements: readonly Element[]): Step[] {
  return elements.map((el) => ({ id: `step_${el.id}`, kind: "reveal", elementIds: [el.id] }));
}
