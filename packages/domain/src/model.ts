// Field names follow Excaliflow's element model so the renderer port (ADR 0001) maps one to one.

/** Boards are drawn in a fixed 16:9 frame; callers scale the canvas context to their output size. */
export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;

export const ELEMENT_TYPES = ["rectangle", "ellipse", "diamond", "arrow", "text", "freedraw", "sticky", "image"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];
export type FillStyle = "hachure" | "solid" | "none";
export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  /** Image: id of the stored picture (SHA-256 of its bytes), copied into storage so it never breaks (ADR 0002). */
  imageId?: string;
  /** Arrows: how the Flow looks (default "comets") and how fast it moves (default 1). */
  flowMode?: FlowMode;
  flowSpeed?: number;
  /** Set in the Style panel to override the Theme for this Element; absent means "follow the Theme". */
  fontOverride?: FontId;
  roughnessOverride?: number;
}

/** Flow styles, from Excaliflow. */
export const FLOW_MODES = ["comets", "pulse", "neon", "dashed"] as const;
export type FlowMode = (typeof FLOW_MODES)[number];
export const MIN_FLOW_SPEED = 0.25;
export const MAX_FLOW_SPEED = 3;

/** Font families Boards and text overlays can use; each Theme names one as its default. */
export const FONT_IDS = ["hand", "sans", "code", "serif"] as const;
export type FontId = (typeof FONT_IDS)[number];
export const MAX_ROUGHNESS = 3;

/** CSS font stacks for each font id, shared by the renderer, the font picker and text overlays. */
export const FONT_STACKS: Record<FontId, string> = {
  hand: "'Excalifont', 'Virgil', 'Patrick Hand', 'Architects Daughter', 'Caveat', cursive",
  sans: "'Assistant', 'Nunito', 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  code: "'Cascadia', 'Geist Mono', monospace",
  serif: "Georgia, 'Times New Roman', serif",
};
export const FONT_LABELS: Record<FontId, string> = { hand: "Hand-drawn", sans: "Sans", code: "Code", serif: "Serif" };

export const LAYOUTS = ["bubble", "side-by-side", "camera-only", "board-only"] as const;
/** How the Camera and the Board share the picture (CONTEXT.md: Layout). */
export type Layout = (typeof LAYOUTS)[number];

interface StepBase {
  id: string;
  /** Words to speak during this Step; shown on the Teleprompter. */
  script?: string;
  /** Layout from this Step on, until a later Step sets another. */
  layout?: Layout;
}

export type Step = StepBase &
  (
    | { kind: "reveal"; elementIds: string[]; effect?: "fade" | "draw-on" }
    | { kind: "flow"; arrowId: string; on: boolean }
    /** Emphasises Elements while this is the latest Step shown. */
    | { kind: "highlight"; elementIds: string[] }
    /** Zooms onto part of the Board; `null` zooms back out. */
    | { kind: "focus"; rect: Rect | null }
    /** Moves and resizes an Element. */
    | { kind: "morph"; elementId: string; to: Rect }
  );
export type StepKind = Step["kind"];

export const TRANSITIONS = ["none", "fade", "slide"] as const;
export type Transition = (typeof TRANSITIONS)[number];

export interface Board {
  id: string;
  elements: Element[];
  /** The Board's Sequence. */
  steps: Step[];
  /** Animation into this Board from the previous one. */
  transition?: Transition;
}

export interface Presentation {
  version: 1;
  id: string;
  title: string;
  themeId: string;
  boards: Board[];
}

/** A named look applied to a whole Presentation. */
export interface Theme {
  id: string;
  name: string;
  background: string;
  /** Default stroke and text colour. */
  stroke: string;
  /** Colours offered in the style panel; the first is the default fill. */
  palette: string[];
  fontFamily: string;
  roughness: number;
}

export const THEMES: readonly Theme[] = [
  { id: "paper", name: "Paper", background: "#ffffff", stroke: "#171717", palette: ["#171717", "#e03131", "#1971c2", "#2f9e44", "#f08c00", "#9c36b5", "#868e96"], fontFamily: "hand", roughness: 0.85 },
  { id: "chalkboard", name: "Chalkboard", background: "#1f3a2e", stroke: "#f1f3f5", palette: ["#f1f3f5", "#ffd43b", "#ff8787", "#74c0fc", "#8ce99a"], fontFamily: "hand", roughness: 1.2 },
  { id: "blueprint", name: "Blueprint", background: "#0b3d91", stroke: "#e7f5ff", palette: ["#e7f5ff", "#a5d8ff", "#ffe066", "#ffa8a8"], fontFamily: "code", roughness: 0.5 },
  { id: "night", name: "Night", background: "#121212", stroke: "#e9ecef", palette: ["#e9ecef", "#b197fc", "#63e6be", "#ffa94d", "#ff8787"], fontFamily: "sans", roughness: 0.85 },
  { id: "pastel", name: "Pastel", background: "#fff9f2", stroke: "#495057", palette: ["#495057", "#f783ac", "#74c0fc", "#8ce99a", "#ffd8a8"], fontFamily: "hand", roughness: 1 },
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Steps created from drawing order: one reveal per Element (ADR 0012, PRODUCT.md §2). */
export function stepsFromDrawingOrder(elements: readonly Element[]): Step[] {
  return elements.map((el) => ({ id: `step_${el.id}`, kind: "reveal", elementIds: [el.id] }));
}

/** An Element's box; arrows span both ends. */
export function boundsOf(el: Element): Rect {
  if (el.type !== "arrow") return { x: el.x, y: el.y, width: el.width, height: el.height };
  const [x1, x2] = [Math.min(el.x, el.x2 ?? el.x), Math.max(el.x, el.x2 ?? el.x)];
  const [y1, y2] = [Math.min(el.y, el.y2 ?? el.y), Math.max(el.y, el.y2 ?? el.y)];
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
