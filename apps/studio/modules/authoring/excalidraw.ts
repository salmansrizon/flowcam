import type { Board, Element, ElementType } from "@flowcam/domain";
import { BOARD_HEIGHT, BOARD_WIDTH, boundsOf } from "@flowcam/domain";
import { createElement } from "./board-edits";

// Maps the public .excalidraw JSON format (type "excalidraw", elements[], files{}) to a Flowcam Board.
// Written from the format's shape, not from Excalidraw's code.

type Raw = Record<string, unknown>;
const SUPPORTED = new Set(["rectangle", "ellipse", "diamond", "arrow", "text", "freedraw", "image"]);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const color = (v: unknown, d = "#171717") => (typeof v === "string" && v && v !== "transparent" ? v : d);

/** Image files of a `.excalidraw` document: fileId to data URL. */
export function excalidrawFiles(doc: unknown): Record<string, { mimeType: string; dataURL: string }> {
  const files = (doc as Raw | null)?.files;
  return typeof files === "object" && files ? (files as never) : {};
}

/**
 * Converts the document to a Board scaled to fit the Board frame. `imageIds` maps an Excalidraw fileId
 * to the stored asset hash; images without one are skipped. Throws when `doc` is not an Excalidraw document.
 */
export function fromExcalidraw(doc: unknown, imageIds: Record<string, string> = {}): { board: Board; skipped: number } {
  const root = doc as Raw | null;
  if (!root || root.type !== "excalidraw" || !Array.isArray(root.elements)) throw new Error("Not an .excalidraw file");
  let skipped = 0;
  const made: Element[] = [];
  for (const r of root.elements as Raw[]) {
    if (r.isDeleted) continue;
    const type = r.type as string;
    const fileId = r.fileId as string | undefined;
    if (!SUPPORTED.has(type) || (type === "image" && !(fileId && imageIds[fileId]))) {
      skipped++;
      continue;
    }
    const [x, y, width, height] = [num(r.x), num(r.y), Math.abs(num(r.width)), Math.abs(num(r.height))];
    const pts = Array.isArray(r.points) ? (r.points as number[][]).filter((p) => Array.isArray(p) && p.length >= 2) : [];
    const common = {
      x, y, width, height,
      strokeColor: color(r.strokeColor),
      fillStyle: r.backgroundColor === "transparent" || !r.backgroundColor ? ("none" as const) : r.fillStyle === "solid" ? ("solid" as const) : ("hachure" as const),
      strokeStyle: (["dashed", "dotted"].includes(r.strokeStyle as string) ? r.strokeStyle : "solid") as Element["strokeStyle"],
      strokeWidth: num(r.strokeWidth, 2),
      fontSize: num(r.fontSize, 28),
      text: typeof r.text === "string" ? r.text : "",
    };
    const el = createElement(type as ElementType, common);
    if (type === "arrow") {
      const last = pts[pts.length - 1] ?? [width, height];
      Object.assign(el, { x2: x + last[0], y2: y + last[1], flowEnabled: false, curveType: "straight", curveOffset: 0 });
      Object.assign(el, { width: Math.abs(last[0]), height: Math.abs(last[1]) });
    } else if (type === "freedraw") {
      const p = (pts.length ? pts : [[0, 0]]).map(([px, py]) => [px, py] as [number, number]);
      const [minX, minY] = [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1]))];
      el.points = p.map(([px, py]) => [px - minX, py - minY]);
      Object.assign(el, { x: x + minX, y: y + minY, width: Math.max(...p.map((q) => q[0])) - minX, height: Math.max(...p.map((q) => q[1])) - minY, fillStyle: "none" });
    } else if (type === "image") {
      el.imageId = imageIds[fileId!];
    } else if (type === "text") {
      el.fillStyle = "none";
    }
    made.push(el);
  }
  // Fit into the frame with a margin, never shrinking below what fits and never growing past 2x.
  const boxes = made.map(boundsOf);
  const [x0, y0] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
  const [w, h] = [Math.max(...boxes.map((b) => b.x + b.width)) - x0, Math.max(...boxes.map((b) => b.y + b.height)) - y0];
  const k = made.length ? Math.min(2, (BOARD_WIDTH - 160) / Math.max(w, 1), (BOARD_HEIGHT - 160) / Math.max(h, 1)) : 1;
  const [dx, dy] = [(BOARD_WIDTH - w * k) / 2 - x0 * k, (BOARD_HEIGHT - h * k) / 2 - y0 * k];
  for (const el of made) {
    el.x = el.x * k + dx;
    el.y = el.y * k + dy;
    el.width *= k;
    el.height *= k;
    el.strokeWidth *= Math.max(0.5, Math.min(1, k));
    el.fontSize = Math.round(el.fontSize * k);
    if (el.x2 !== undefined) el.x2 = el.x2 * k + dx;
    if (el.y2 !== undefined) el.y2 = el.y2 * k + dy;
    if (el.points) el.points = el.points.map(([px, py]) => [px * k, py * k]);
  }
  return {
    board: { id: crypto.randomUUID(), elements: made, steps: made.map((el) => ({ id: `step_${el.id}`, kind: "reveal", elementIds: [el.id] })) },
    skipped,
  };
}
