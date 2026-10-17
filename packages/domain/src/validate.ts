import { ELEMENT_TYPES, type Board, type Element, type Presentation, type Step } from "./model";
import { LOG_SCHEMA_VERSION, type ClipLog, type LogEvent } from "./log";

// Data read back from browser storage or the cloud is untrusted: check shape before use.

export class InvalidDataError extends Error {}

type Obj = Record<string, unknown>;

function fail(path: string, want: string): never {
  throw new InvalidDataError(`${path}: expected ${want}`);
}
function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "an object");
  return v as Obj;
}
function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, "an array");
  return v;
}
function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(path, "a finite number");
  return v;
}
function count(v: unknown, path: string): number {
  if (!Number.isInteger(v) || (v as number) < 0) fail(path, "a whole number, 0 or more");
  return v as number;
}
function str(v: unknown, path: string): string {
  if (typeof v !== "string") fail(path, "a string");
  return v;
}
function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (!options.includes(v as T)) fail(path, options.join(" | "));
  return v as T;
}
function points(v: unknown, path: string, size: 2 | 3): number[][] {
  return arr(v, path).map((p, i) => {
    const pt = arr(p, `${path}[${i}]`);
    if (pt.length !== size) fail(`${path}[${i}]`, `${size} numbers`);
    return pt.map((n, j) => num(n, `${path}[${i}][${j}]`));
  });
}

function element(v: unknown, path: string): Element {
  const o = obj(v, path);
  for (const k of ["x", "y", "width", "height", "strokeWidth", "roughness", "fontSize", "seed"]) num(o[k], `${path}.${k}`);
  for (const k of ["id", "strokeColor", "fontFamily", "text"]) str(o[k], `${path}.${k}`);
  const type = oneOf(o.type, ELEMENT_TYPES, `${path}.type`);
  oneOf(o.fillStyle, ["hachure", "solid", "none"], `${path}.fillStyle`);
  oneOf(o.strokeStyle, ["solid", "dashed", "dotted"], `${path}.strokeStyle`);
  if (type === "arrow") {
    num(o.x2, `${path}.x2`);
    num(o.y2, `${path}.y2`);
  }
  if (type === "freedraw") points(o.points, `${path}.points`, 2);
  return o as unknown as Element;
}

function step(v: unknown, path: string, ids: Set<string>, arrows: Set<string>): Step {
  const o = obj(v, path);
  str(o.id, `${path}.id`);
  const kind = oneOf(o.kind, ["reveal", "flow"], `${path}.kind`);
  const refs = kind === "reveal" ? arr(o.elementIds, `${path}.elementIds`) : [o.arrowId];
  refs.forEach((id, i) => {
    if (!ids.has(str(id, `${path}.ref[${i}]`))) fail(`${path}.ref[${i}]`, "an Element id on this Board");
  });
  if (kind === "flow" && !arrows.has(o.arrowId as string)) fail(`${path}.arrowId`, "an arrow");
  if (kind === "flow" && typeof o.on !== "boolean") fail(`${path}.on`, "a boolean");
  return o as unknown as Step;
}

function board(v: unknown, path: string): Board {
  const o = obj(v, path);
  str(o.id, `${path}.id`);
  const elements = arr(o.elements, `${path}.elements`).map((e, i) => element(e, `${path}.elements[${i}]`));
  const ids = new Set(elements.map((e) => e.id));
  if (ids.size !== elements.length) fail(`${path}.elements`, "unique ids");
  const arrows = new Set(elements.filter((e) => e.type === "arrow").map((e) => e.id));
  arr(o.steps, `${path}.steps`).forEach((s, i) => step(s, `${path}.steps[${i}]`, ids, arrows));
  return o as unknown as Board;
}

export function parsePresentation(v: unknown): Presentation {
  const o = obj(v, "presentation");
  if (o.version !== 1) fail("presentation.version", "1");
  str(o.id, "presentation.id");
  str(o.title, "presentation.title");
  str(o.themeId, "presentation.themeId");
  const boards = arr(o.boards, "presentation.boards");
  if (boards.length === 0) fail("presentation.boards", "at least one Board");
  boards.forEach((b, i) => board(b, `presentation.boards[${i}]`));
  return o as unknown as Presentation;
}

function event(v: unknown, path: string): LogEvent {
  const o = obj(v, path);
  num(o.t, `${path}.t`);
  const type = oneOf(o.type, ["step", "ink", "inkClear", "pointer"], `${path}.type`);
  if (type === "step") count(o.index, `${path}.index`);
  if (type === "ink") {
    str(o.id, `${path}.id`);
    points(o.points, `${path}.points`, 3);
  }
  if (type === "pointer") {
    num(o.x, `${path}.x`);
    num(o.y, `${path}.y`);
  }
  return o as unknown as LogEvent;
}

export function parseClipLog(v: unknown): ClipLog {
  const o = obj(v, "log");
  if (o.version !== LOG_SCHEMA_VERSION) fail("log.version", String(LOG_SCHEMA_VERSION));
  str(o.clipId, "log.clipId");
  str(o.boardId, "log.boardId");
  count(o.startStep, "log.startStep");
  num(o.durationMs, "log.durationMs");
  const events = arr(o.events, "log.events").map((e, i) => event(e, `log.events[${i}]`));
  events.forEach((e, i) => {
    if (i > 0 && e.t < events[i - 1].t) fail(`log.events[${i}].t`, "events sorted by time");
  });
  return o as unknown as ClipLog;
}
