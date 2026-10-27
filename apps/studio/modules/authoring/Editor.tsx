"use client";

import { useEffect, useRef, useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, FONT_IDS, FONT_LABELS, FONT_STACKS, LAYOUTS, MAX_FLOW_SPEED, MIN_FLOW_SPEED, THEMES, TRANSITIONS, boardView, boundsOf, parsePresentation, themeById, type Board, type Element, type ElementType, type FlowMode, type FontId, type Layout, type Presentation, type Rect, type Transition } from "@flowcam/domain";
import { boardRenderer } from "@flowcam/renderer";
import { addElement, addFlowStep, createElement, deleteElement, deleteStep, hitTest, moveElement, moveStep } from "./board-edits";
import { addBoard, deleteBoard, insertBoard, isEmptyBoard, moveBoard, selectionAfterMove, setTransition, updateBoard } from "./deck-edits";
import { addFocusStep, addHighlightStep, addMorphStep, duplicateElements, mergeReveals, setElementText, updateStep } from "./step-edits";
import { fromExcalidraw, excalidrawFiles } from "./excalidraw";
import { emptyHistory, record, redo as redoHistory, undo as undoHistory, type History } from "./history";
import { flipArrows, restyleElements, toggleArrowFlow } from "./style-edits";
import { TEMPLATES, templateBoard } from "./templates";
import { dataUrlToBlob, decodeImages, fetchImageAsset, readAsset, writeAsset } from "../presentation/assets";
import { loadPresentation, newPresentation, savePresentation } from "../presentation/store";
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronDown, Copy, Download, Lock, LockOpen, Minus, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Redo2, Trash2, Type, Undo2, X, Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopBar } from "@/components/studio/TopBar";
import { Panel } from "@/components/studio/Panel";
import { FontPicker } from "@/components/studio/FontPicker";
import { Badge } from "@/components/ui/badge";
import SyncStatus from "../sync/SyncStatus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Tool = "select" | Exclude<ElementType, "image"> | "focus";
// Icons and number key hints are ported from Excaliflow's #bottomToolDock (index.html), in its order.
const TOOLS: { tool: Tool; label: string; key: string; hint: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select", key: "v", hint: "1", icon: <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" /> },
  { tool: "rectangle", label: "Rectangle", key: "r", hint: "2", icon: <rect x="3" y="5" width="18" height="14" rx="3" /> },
  { tool: "diamond", label: "Diamond", key: "d", hint: "3", icon: <path d="M12 3l9 9-9 9-9-9z" /> },
  { tool: "ellipse", label: "Ellipse", key: "o", hint: "4", icon: <circle cx="12" cy="12" r="9" /> },
  { tool: "arrow", label: "Arrow", key: "a", hint: "5", icon: <><line x1="5" y1="19" x2="19" y2="5" /><polyline points="9 5 19 5 19 15" /></> },
  { tool: "freedraw", label: "Freehand", key: "p", hint: "7", icon: <><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></> },
  { tool: "text", label: "Text", key: "t", hint: "8", icon: <><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></> },
  { tool: "sticky", label: "Sticky", key: "n", hint: "9", icon: <><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" /><polyline points="14 3 14 9 21 9" /></> },
];

const selectCls = "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
// Excaliflow's strokeWidthRow (Thin 1.5, Bold 2.2, Heavy 3.6) and roughnessRow (Clean 0, Artist 0.85, Cartoon 1.75), renamed per Flowcam's UI.
const WIDTHS: [string, string][] = [["1.5", "Thin"], ["2.2", "Medium"], ["3.6", "Bold"]];
const ROUGHNESSES: [string, string][] = [["theme", "Theme default"], ["0", "Architect"], ["0.85", "Artist"], ["1.75", "Cartoonist"]];
const CURVES: [string, string][] = [["curved", "Curved"], ["straight", "Straight"]];
const FLOW_LABELS: [FlowMode, string][] = [["comets", "Comets"], ["pulse", "Pulse"], ["neon", "Neon"], ["dashed", "Dashed"]];
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const FILLS: [string, string][] = [["hachure", "Sketch"], ["solid", "Solid"], ["none", "None"]];
const STROKES: [string, string][] = [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]];

function IconButton({ label, tip, children, ...props }: React.ComponentProps<typeof Button> & { label: string; tip?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{tip ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** Excaliflow's .section-title inside a .sidebar-section. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

/** Excaliflow's .segmented-row / .seg-btn. */
function Segmented({ label, value, options, onChange, wrap }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; wrap?: boolean }) {
  return (
    <div role="group" aria-label={label} className={cn("grid gap-0.5 rounded-lg border bg-muted p-0.5", wrap ? "grid-cols-2" : "auto-cols-fr grid-flow-col")}>
      {options.map(([v, text]) => (
        <button
          key={v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="h-6 rounded-md text-xs font-medium text-muted-foreground outline-none hover:bg-background/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-accent aria-pressed:font-semibold aria-pressed:text-accent-foreground"
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** A live small drawing of a Board, made with the same renderer as the canvas. */
function BoardThumb({ board, theme, images, version }: { board: Board; theme: ReturnType<typeof themeById>; images: Map<string, ImageBitmap>; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.setTransform(ref.current!.width / BOARD_WIDTH, 0, 0, ref.current!.width / BOARD_WIDTH, 0, 0);
    const revealedAt = new Map(board.elements.map((e) => [e.id, -Infinity]));
    boardRenderer.render(ctx, board, { ...boardView(board, []), revealedAt }, 0, { theme, images });
  }, [board, theme, images, version]);
  return <canvas ref={ref} width={320} height={180} aria-hidden className="block aspect-video w-full rounded-md border" />;
}
// Shortcuts follow Excaliflow's shortcutMap (number keys and letters), minus the tools Flowcam does not have.
const KEYS: Record<string, Tool> = { "1": "select", "2": "rectangle", "3": "diamond", "4": "ellipse", "5": "arrow", "7": "freedraw", "8": "text", "9": "sticky", ...Object.fromEntries(TOOLS.map((t) => [t.key, t.tool])) };

type Drag =
  | { kind: "move"; last: [number, number]; moved?: boolean }
  | { kind: "draw"; el: Element; start: [number, number] }
  | { kind: "rect"; start: [number, number]; rect: Rect }
  | { kind: "morph"; last: [number, number] }
  | { kind: "pan"; last: [number, number] };
type Editing = { id: string; draft?: Element };

const TEXTUAL = new Set<ElementType>(["rectangle", "ellipse", "diamond", "text", "sticky"]);
const isField = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

function stepLabel(board: Board, i: number): string {
  const s = board.steps[i];
  const name = (id: string) => {
    const el = board.elements.find((e) => e.id === id);
    return el ? (el.text ? `${el.type} “${el.text}”` : el.type) : "?";
  };
  switch (s.kind) {
    case "reveal":
      return `Reveal ${s.elementIds.map(name).join(", ")}${s.effect === "draw-on" ? " (draw on)" : ""}`;
    case "highlight":
      return `Highlight ${s.elementIds.map(name).join(", ")}`;
    case "flow":
      return `Flow ${s.on ? "on" : "off"}: ${name(s.arrowId)}`;
    case "morph":
      return `Move ${name(s.elementId)}`;
    case "focus":
      return s.rect ? "Focus in" : "Focus out";
  }
}

function measureWidth(line: string, size: number): number {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `${size}px sans-serif`;
  return ctx.measureText(line).width;
}

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [boardIndex, setBoardIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [tab, setTab] = useState<"style" | "steps" | "script">("steps");
  const [drag, setDragState] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [morphTo, setMorphTo] = useState<{ id: string; to: Rect } | null>(null);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [urlText, setUrlText] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolLock, setToolLock] = useState(false);
  // Editor view only (zoom is relative to the fitted Board, so 1 = Fit); the Board data and its 1920x1080 frame never change.
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [fitW, setFitW] = useState(BOARD_WIDTH / 2);
  const [spaceDown, setSpaceDown] = useState(false);
  const [, setLayoutTick] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef(false);
  const toolLockRef = useRef(false);
  toolLockRef.current = toolLock;
  // Undo history keeps whole Presentations; `presRef` is the latest one so several edits in one event each see the previous.
  const presRef = useRef<Presentation | null>(null);
  const history = useRef<History<Presentation>>(emptyHistory());
  const lastKey = useRef<string | undefined>(undefined);
  const [, setHistoryVersion] = useState(0);
  const exportRef = useRef<HTMLInputElement>(null);
  // Pointer events can arrive faster than React re-renders, so handlers read the live drag from a ref.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const saving = useRef(Promise.resolve());
  const images = useRef(new Map<string, ImageBitmap>());
  const clipboard = useRef<Element[]>([]);
  const pastes = useRef(0);
  const pendingText = useRef<[number, number] | null>(null);
  const editingRef = useRef<Editing | null>(null);
  editingRef.current = editing;
  const indexRef = useRef(0);
  indexRef.current = boardIndex;

  const board = presentation?.boards[Math.min(boardIndex, (presentation?.boards.length ?? 1) - 1)];
  const theme = themeById(presentation?.themeId ?? "paper");

  useEffect(() => {
    loadPresentation()
      .then((p) => {
        if (presRef.current) return; // never clobber edits made while a slower load (Sync pull) finished
        presRef.current = p ?? newPresentation();
        setPresentation(presRef.current);
      })
      .catch((e) => setError(`Could not load your Presentation: ${e.message}`));
  }, []);

  type EditOpts = { record?: boolean; key?: string };
  /** Every edit goes through here: it snapshots the Presentation for Undo (edits with the same `key` in a row, like typing, share one snapshot). */
  function apply(edit: (p: Presentation) => Presentation, opts: EditOpts = {}) {
    const cur = presRef.current;
    if (!cur) return;
    const next = edit(cur);
    if (next === cur) return;
    if (opts.record !== false) {
      if (!opts.key || opts.key !== lastKey.current) history.current = record(history.current, cur);
      lastKey.current = opts.key;
    }
    presRef.current = next;
    setPresentation(next);
    setHistoryVersion((v) => v + 1);
  }
  function update(edit: (b: Board) => Board, opts?: EditOpts) {
    apply((p) => updateBoard(p, indexRef.current, edit), opts);
  }
  function updateDeck(edit: (p: Presentation) => Presentation, opts?: EditOpts) {
    apply(edit, opts);
  }
  function stepHistory(dir: "undo" | "redo") {
    const cur = presRef.current;
    if (!cur) return;
    const r = (dir === "undo" ? undoHistory : redoHistory)(history.current, cur);
    if (!r) return;
    history.current = r.history;
    lastKey.current = undefined;
    presRef.current = r.value;
    setPresentation(r.value); // the save effect persists it like any other change
    setHistoryVersion((v) => v + 1);
    setBoardIndex((i) => Math.min(i, r.value.boards.length - 1));
    setSelected([]);
    setActiveStep(null);
    setEditing(null);
    setMorphTo(null);
    setDrag(null);
  }
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  function reorderBoard(from: number, to: number) {
    const length = presentation?.boards.length ?? 0;
    updateDeck((p) => moveBoard(p, from, to));
    setBoardIndex((sel) => selectionAfterMove(sel, from, to, length));
  }
  function goto(i: number) {
    setBoardIndex(i);
    setSelected([]);
    setActiveStep(null);
    setEditing(null);
    setMorphTo(null);
    setTool("select");
  }

  // Save after each change, one write at a time, and not on every pointer move of a drag.
  useEffect(() => {
    if (!presentation || drag) return;
    saving.current = saving.current
      .then(() => savePresentation(presentation))
      .catch((e) => setError(`Could not save: ${e.message}`));
  }, [presentation, drag]);

  // Decode stored Images for drawing.
  useEffect(() => {
    if (!presentation) return;
    const ids = presentation.boards.flatMap((b) => b.elements.flatMap((e) => (e.imageId ? [e.imageId] : [])));
    if (ids.every((id) => images.current.has(id))) return;
    decodeImages(ids, images.current).then(() => setImagesVersion((v) => v + 1));
  }, [presentation]);

  // Draw every frame so Flows animate; in the editor every Element is visible.
  useEffect(() => {
    if (!board) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const hidden = editing?.draft ? [] : editing ? [editing.id] : [];
    const elements = (drag?.kind === "draw" ? [...board.elements, drag.el] : board.elements).filter((e) => !hidden.includes(e.id));
    const shown: Board = { ...board, elements };
    const view = { ...boardView(shown, []), revealedAt: new Map(elements.map((e) => [e.id, -Infinity])) };
    const env = { theme, images: images.current };
    let frame = requestAnimationFrame(function draw(now) {
      boardRenderer.render(ctx, shown, view, now, env);
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1c7ed6";
      for (const id of selected) {
        const sel = elements.find((e) => e.id === id);
        if (!sel) continue;
        const b = boundsOf(sel);
        ctx.strokeRect(b.x - 8, b.y - 8, b.width + 16, b.height + 16);
      }
      const ghost = drag?.kind === "rect" ? drag.rect : morphTo?.to;
      if (ghost) {
        ctx.strokeStyle = drag?.kind === "rect" ? "#f08c00" : "#2f9e44";
        ctx.strokeRect(ghost.x, ghost.y, ghost.width, ghost.height);
      }
      ctx.setLineDash([]);
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [board, drag, selected, theme, imagesVersion, editing, morphTo]);

  async function addImage(blob: Blob, at?: [number, number]) {
    try {
      const imageId = await writeAsset(blob);
      const bmp = await createImageBitmap(blob);
      images.current.set(imageId, bmp);
      const k = Math.min(1, 600 / bmp.width, 400 / bmp.height);
      const [width, height] = [bmp.width * k, bmp.height * k];
      const [x, y] = at ?? [(BOARD_WIDTH - width) / 2, (BOARD_HEIGHT - height) / 2];
      const el = createElement("image", { x: x - (at ? width / 2 : 0), y: y - (at ? height / 2 : 0), width, height, imageId, fillStyle: "none" });
      update((b) => addElement(b, el));
      setSelected([el.id]);
      setImagesVersion((v) => v + 1);
    } catch (e) {
      setError(`Could not add the image: ${(e as Error).message}`);
    }
  }

  async function addImageFromUrl() {
    try {
      const id = await fetchImageAsset(urlText.trim());
      await addImage(await readAsset(id));
      setUrlText("");
    } catch (e) {
      setError(`Could not fetch that image: ${(e as Error).message}`);
    }
  }

  async function importExcalidraw(file: File) {
    try {
      const doc = JSON.parse(await file.text());
      const imageIds: Record<string, string> = {};
      for (const [fileId, f] of Object.entries(excalidrawFiles(doc))) {
        try {
          imageIds[fileId] = await writeAsset(await dataUrlToBlob(f.dataURL));
        } catch {
          /* the Image is counted as skipped */
        }
      }
      const { board: imported, skipped } = fromExcalidraw(doc, imageIds);
      updateDeck((p) => addBoard(p, indexRef.current, imported));
      goto(indexRef.current + 1);
      setStatus(`Imported ${imported.elements.length} elements${skipped ? `, skipped ${skipped} unsupported` : ""}.`);
    } catch (e) {
      setError(`Could not import: ${(e as Error).message}`);
    }
  }

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t || !presentation) return;
    const r = insertBoard(presentation, boardIndex, templateBoard(t));
    updateDeck(() => r.presentation);
    goto(r.index);
  }

  // A status message clears itself; errors stay until dismissed.
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

  function commitEdit(text: string) {
    const ed = editingRef.current;
    if (!ed) return;
    editingRef.current = null;
    setEditing(null);
    if (ed.draft) {
      const draft = ed.draft;
      if (text.trim()) {
        update((b) => setElementText(addElement(b, draft), draft.id, text, measureWidth));
        setSelected([draft.id]);
        if (!toolLockRef.current) setTool("select");
      }
    } else {
      update((b) => setElementText(b, ed.id, text, measureWidth));
    }
  }

  function startEdit(el: Element, draft = false) {
    setSelected([el.id]);
    setEditing({ id: el.id, ...(draft ? { draft: el } : {}) });
  }

  function duplicate() {
    if (!board || !selected.length) return;
    const r = duplicateElements(board, selected);
    update(() => r.board);
    setSelected(r.ids);
  }

  function deleteSelected() {
    update((b) => selected.reduce(deleteElement, b));
    setSelected([]);
  }

  // ---- Export menu (Excaliflow's exportDropdown: btnSavePng, btnCopyPng, btnSaveJson, btnLoadJson)
  function download(blob: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const fileName = (ext: string) => `${(presentation?.title || "Presentation").replace(/[^\w .-]+/g, "").trim() || "Presentation"}.${ext}`;
  /** The current Board with every Element shown and no editor overlays. */
  function boardPng(): Promise<Blob> {
    const c = document.createElement("canvas");
    c.width = BOARD_WIDTH;
    c.height = BOARD_HEIGHT;
    const v = { ...boardView(board!, []), revealedAt: new Map(board!.elements.map((e) => [e.id, -Infinity])) };
    boardRenderer.render(c.getContext("2d")!, board!, v, 0, { theme, images: images.current });
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("The browser could not make an image"))), "image/png"));
  }
  async function savePng() {
    try {
      download(await boardPng(), fileName("png"));
      setStatus("Saved the Board as a PNG.");
    } catch (e) {
      setError(`Could not save the PNG: ${(e as Error).message}`);
    }
  }
  async function copyPng() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": boardPng() })]);
      setStatus("Copied the Board as a PNG.");
    } catch (e) {
      setError(`Could not copy the PNG: ${(e as Error).message}`);
    }
  }
  function saveJson() {
    if (!presentation) return;
    download(new Blob([JSON.stringify(presentation, null, 2)], { type: "application/json" }), fileName("flowcam.json"));
    setStatus("Saved the Presentation as JSON. Images are not embedded in the file.");
  }
  async function openJson(file: File) {
    try {
      const opened = parsePresentation(JSON.parse(await file.text()));
      updateDeck(() => opened); // undoable like any other edit
      goto(0);
      setStatus(`Opened “${opened.title}”. Images are not embedded in the file, so any not on this device show empty.`);
    } catch (e) {
      setError(`Could not open that file: ${(e as Error).message}`);
    }
  }

  // ---- Zoom and pan of the editor view
  function zoomAt(cx: number, cy: number, factor: number) {
    const v = viewRef.current;
    const rect = stageRef.current!.getBoundingClientRect();
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * factor));
    const k = z / v.z;
    // The point under (cx, cy) stays put: the stage scales from its top-left corner at (rect.left, rect.top).
    const next = { z, x: v.x + (1 - k) * (cx - rect.left), y: v.y + (1 - k) * (cy - rect.top) };
    viewRef.current = next;
    setView(next);
  }
  function zoomCentre(factor: number) {
    const r = viewportRef.current!.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }
  const fit = () => setView({ z: 1, x: 0, y: 0 });
  const actualSize = () => zoomCentre(BOARD_WIDTH / fitW / viewRef.current.z);

  useEffect(() => {
    const vp = viewportRef.current!;
    const canvas = canvasRef.current!;
    const measure = () => {
      setFitW(canvas.offsetWidth);
      setLayoutTick((t) => t + 1);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    // Cmd/Ctrl + wheel (and a trackpad pinch, which arrives as ctrl + wheel) zooms around the cursor; a plain wheel pans.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    // Two-finger touch pinch.
    let pinch: { d: number; cx: number; cy: number } | null = null;
    const read = (t: TouchList) => ({ d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), cx: (t[0].clientX + t[1].clientX) / 2, cy: (t[0].clientY + t[1].clientY) / 2 });
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = read(e.touches);
      dragRef.current = null; // the first finger had started drawing
      setDragState(null);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      const now = read(e.touches);
      zoomAt(now.cx, now.cy, now.d / (pinch.d || 1));
      setView((v) => ({ ...v, x: v.x + now.cx - pinch!.cx, y: v.y + now.cy - pinch!.cy }));
      pinch = now;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    vp.addEventListener("touchstart", onTouchStart, { passive: true });
    vp.addEventListener("touchmove", onTouchMove, { passive: false });
    vp.addEventListener("touchend", onTouchEnd);
    return () => {
      ro.disconnect();
      vp.removeEventListener("wheel", onWheel);
      vp.removeEventListener("touchstart", onTouchStart);
      vp.removeEventListener("touchmove", onTouchMove);
      vp.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isField(e.target) || !board) return;
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        spaceRef.current = true;
        setSpaceDown(true);
      } else if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        stepHistory(e.shiftKey ? "redo" : "undo");
      } else if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        stepHistory("redo");
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
        deleteSelected();
      } else if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(board.elements.map((x) => x.id));
      } else if (meta && e.key.toLowerCase() === "c") {
        clipboard.current = JSON.parse(JSON.stringify(board.elements.filter((x) => selected.includes(x.id))));
        pastes.current = 0;
      } else if (!meta && !e.altKey && e.key.toLowerCase() === "q") {
        setToolLock((l) => !l); // Excaliflow's toggleToolLock shortcut
      } else if (!meta && !e.altKey && KEYS[e.key.toLowerCase()]) {
        setTool(KEYS[e.key.toLowerCase()]);
      } else if (e.key === "Escape") {
        setTool("select");
        setSelected([]);
        setMorphTo(null);
      }
    }
    function onPaste(e: ClipboardEvent) {
      if (isField(e.target) || !board) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        files.forEach((f) => addImage(f));
      } else if (clipboard.current.length) {
        e.preventDefault();
        // Pasted copies are shifted a bit more each time, as in Excaliflow.
        pastes.current += 1;
        const r = duplicateElements({ id: "clip", elements: clipboard.current, steps: [] }, clipboard.current.map((x) => x.id), 28 * pastes.current);
        update((b) => r.board.elements.reduce(addElement, b));
        setSelected(r.ids);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== " ") return;
      spaceRef.current = false;
      setSpaceDown(false);
    }
    const onBlur = () => {
      spaceRef.current = false;
      setSpaceDown(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("paste", onPaste);
    };
  });

  function toBoard(e: React.PointerEvent | React.DragEvent): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOARD_WIDTH, ((e.clientY - r.top) / r.height) * BOARD_HEIGHT];
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!board || editing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || spaceRef.current) {
      setDrag({ kind: "pan", last: [e.clientX, e.clientY] }); // middle-drag or Space+drag pans
      return;
    }
    const [x, y] = toBoard(e);
    if (morphTo) {
      setDrag({ kind: "morph", last: [x, y] });
      return;
    }
    if (tool === "focus") {
      setDrag({ kind: "rect", start: [x, y], rect: { x, y, width: 0, height: 0 } });
      return;
    }
    if (tool === "select") {
      const hit = hitTest(board, x, y);
      if (!hit) setSelected([]);
      else if (e.shiftKey) setSelected((s) => (s.includes(hit.id) ? s.filter((i) => i !== hit.id) : [...s, hit.id]));
      else if (!selected.includes(hit.id)) setSelected([hit.id]);
      if (hit) setDrag({ kind: "move", last: [x, y] });
      return;
    }
    if (tool === "text" || tool === "sticky") {
      // Opens on pointer up: a focus change at mouse down would blur the editor straight away.
      pendingText.current = [x, y];
      return;
    }
    const el = createElement(tool, { x, y, width: 0, height: 0, ...(tool === "arrow" ? { x2: x, y2: y } : {}), ...(tool === "freedraw" ? { points: [[0, 0]] } : {}) });
    setDrag({ kind: "draw", el, start: [x, y] });
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      const [dx, dy] = [e.clientX - drag.last[0], e.clientY - drag.last[1]];
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      setDrag({ ...drag, last: [e.clientX, e.clientY] });
      return;
    }
    const [x, y] = toBoard(e);
    if (drag.kind === "move") {
      // One Undo point for the whole drag: recorded on its first move only.
      update((b) => selected.reduce((acc, id) => moveElement(acc, id, x - drag.last[0], y - drag.last[1]), b), { record: !drag.moved });
      setDrag({ ...drag, last: [x, y], moved: true });
    } else if (drag.kind === "morph") {
      setMorphTo((m) => m && { ...m, to: { ...m.to, x: m.to.x + x - drag.last[0], y: m.to.y + y - drag.last[1] } });
      setDrag({ ...drag, last: [x, y] });
    } else if (drag.kind === "rect") {
      const [sx, sy] = drag.start;
      setDrag({ ...drag, rect: { x: Math.min(x, sx), y: Math.min(y, sy), width: Math.abs(x - sx), height: Math.abs(y - sy) } });
    } else {
      const { el, start } = drag;
      if (el.type === "arrow") setDrag({ ...drag, el: { ...el, x2: x, y2: y, width: Math.abs(x - start[0]), height: Math.abs(y - start[1]) } });
      else if (el.type === "freedraw") setDrag({ ...drag, el: { ...el, points: [...el.points!, [x - start[0], y - start[1]]] } });
      else setDrag({ ...drag, el: { ...el, x: Math.min(x, start[0]), y: Math.min(y, start[1]), width: Math.abs(x - start[0]), height: Math.abs(y - start[1]) } });
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    const pending = pendingText.current;
    pendingText.current = null;
    if (pending && (tool === "text" || tool === "sticky")) {
      const sticky = tool === "sticky";
      const [w, h] = sticky ? [300, 220] : [240, 50];
      startEdit(createElement(tool, { x: pending[0] - w / 2, y: pending[1] - h / 2, width: w, height: h, text: sticky ? "Sticky Note" : "", fillStyle: sticky ? "solid" : "none" }), true);
      return;
    }
    if (drag?.kind === "rect") {
      update((b) => addFocusStep(b, drag.rect));
      setTool("select");
      setActiveStep(board!.steps.length);
    } else if (drag?.kind === "draw") {
      let el = drag.el;
      if (el.type === "freedraw") {
        const xs = el.points!.map((p) => p[0]);
        const ys = el.points!.map((p) => p[1]);
        const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
        el = { ...el, x: el.x + minX, y: el.y + minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY, points: el.points!.map(([px, py]) => [px - minX, py - minY]) };
      } else if (el.type !== "arrow" && el.width < 5 && el.height < 5) {
        el = { ...el, width: 200, height: 120 }; // A click places a default-sized shape.
      }
      if (el.type !== "arrow" || Math.hypot(el.x2! - el.x, el.y2! - el.y) > 5) {
        const added = el;
        update((b) => addElement(b, added));
        setSelected([added.id]);
        if (!toolLockRef.current) setTool("select"); // Excaliflow: the tool drops back to Select unless locked
      }
    }
    setDrag(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const at = toBoard(e);
    for (const f of [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))) addImage(f, at);
  }

  const selectedEl = board && selected.length === 1 ? board.elements.find((e) => e.id === selected[0]) : undefined;
  const step = board && activeStep !== null ? board.steps[activeStep] : undefined;
  const editEl = editing && (editing.draft ?? board?.elements.find((e) => e.id === editing.id));
  const dragFrom = useRef<number | null>(null);
  const isEmpty = presentation?.boards.length === 1 && isEmptyBoard(presentation.boards[0]);
  const firstSelected = board?.elements.find((e) => e.id === selected[0]);
  const restyle = (patch: Parameters<typeof restyleElements>[2], key?: string) => update((b) => restyleElements(b, selected, patch), { key });
  const selectedEls = board ? board.elements.filter((e) => selected.includes(e.id)) : [];
  const selectedArrows = selectedEls.filter((e) => e.type === "arrow");
  const empty = board?.elements.length === 0;

  // The quick action bar floats above the selection (below it when there is no room), in viewport pixels.
  function quickBarPos(): { left: number; top: number } | null {
    const cv = canvasRef.current;
    const vp = viewportRef.current;
    if (!cv || !vp || !selectedEls.length || tool !== "select" || drag || editing) return null;
    const r = cv.getBoundingClientRect();
    const v = vp.getBoundingClientRect();
    const bs = selectedEls.map(boundsOf);
    const [x1, x2] = [Math.min(...bs.map((b) => b.x)), Math.max(...bs.map((b) => b.x + b.width))];
    const [y1, y2] = [Math.min(...bs.map((b) => b.y)), Math.max(...bs.map((b) => b.y + b.height))];
    const sx = (bx: number) => r.left - v.left + (bx / BOARD_WIDTH) * r.width;
    const sy = (by: number) => r.top - v.top + (by / BOARD_HEIGHT) * r.height;
    const above = sy(y1) - 8 - 52;
    return { left: Math.min(Math.max((sx(x1) + sx(x2)) / 2, 170), Math.max(170, v.width - 170)), top: above >= 8 ? above : Math.min(sy(y2) + 20, v.height - 120) };
  }
  const barPos = quickBarPos();

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-muted/40 text-foreground">
        <TopBar
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1"><Download /> Export <ChevronDown /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={!board} onSelect={savePng}>Save PNG</DropdownMenuItem>
                  <DropdownMenuItem disabled={!board} onSelect={copyPng}>Copy PNG</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!presentation} onSelect={saveJson}>Save Presentation (JSON)</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportRef.current?.click()}>Open Presentation (JSON)…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild variant="outline"><a href="/record">Try</a></Button>
              <Button asChild><a href="/record">Record</a></Button>
              <Button variant="outline" disabled>Share <Badge variant="secondary">Pro</Badge></Button>
            </>
          }
        >
          <Input
            aria-label="Presentation title"
            className="h-8 max-w-64 border-transparent bg-transparent font-medium shadow-none hover:border-input"
            value={presentation?.title ?? ""}
            onChange={(e) => updateDeck((p) => ({ ...p, title: e.target.value }), { key: "title" })}
          />
          <select aria-label="Theme" className={selectCls} value={presentation?.themeId ?? "paper"} onChange={(e) => updateDeck((p) => ({ ...p, themeId: e.target.value }))}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div role="group" aria-label="History" className="flex items-center">
            <IconButton label="Undo" tip="Undo (⌘Z)" disabled={!canUndo} onClick={() => stepHistory("undo")}><Undo2 /></IconButton>
            <IconButton label="Redo" tip="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => stepHistory("redo")}><Redo2 /></IconButton>
          </div>
          <SyncStatus />
        </TopBar>
        <h1 className="sr-only">Flowcam Studio</h1>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Boards" className={cn("flex shrink-0 flex-col gap-2 border-r bg-background p-2", boardsOpen ? "w-52" : "w-12 items-center")}>
            <div className="flex items-center justify-between">
              {boardsOpen && <h2 className="px-1 text-xs font-semibold text-muted-foreground">Boards</h2>}
              <div className="flex items-center">
                {boardsOpen && (
                  <>
                    <IconButton label="Add Board" onClick={() => { updateDeck((p) => addBoard(p, boardIndex)); goto(boardIndex + 1); }}><Plus /></IconButton>
                    <IconButton
                      label="Delete Board"
                      onClick={() => {
                        if (board!.elements.length && !window.confirm(`Delete Board ${boardIndex + 1} and its ${board!.elements.length} Elements?`)) return;
                        updateDeck((p) => deleteBoard(p, boardIndex));
                        goto(Math.max(0, boardIndex - 1));
                      }}
                    >
                      <Trash2 />
                    </IconButton>
                  </>
                )}
                <IconButton label={boardsOpen ? "Collapse Boards" : "Expand Boards"} onClick={() => setBoardsOpen((o) => !o)}>
                  {boardsOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
                </IconButton>
              </div>
            </div>
            {boardsOpen && presentation && (
              <>
                <label className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                  Transition
                  <select aria-label="Transition" className={cn(selectCls, "min-w-0 flex-1")} value={board?.transition ?? "fade"} onChange={(e) => updateDeck((p) => setTransition(p, boardIndex, e.target.value as Transition))}>
                    {TRANSITIONS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0.5">
                  {presentation.boards.map((b, i) => (
                    <li
                      key={b.id}
                      className="flex items-start gap-1"
                      draggable
                      onDragStart={() => (dragFrom.current = i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragFrom.current !== null) reorderBoard(dragFrom.current, i);
                        dragFrom.current = null;
                      }}
                    >
                      <button
                        aria-current={i === boardIndex}
                        className="flex-1 rounded-lg p-1 text-left text-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground aria-[current=true]:ring-2 aria-[current=true]:ring-primary"
                        onClick={() => goto(i)}
                      >
                        <BoardThumb board={b} theme={theme} images={images.current} version={imagesVersion} />
                        <span className="mt-1 block">Board {i + 1} ({b.elements.length})</span>
                      </button>
                      <div className="flex flex-col">
                        <IconButton label={`Move Board ${i + 1} up`} size="icon-xs" onClick={() => reorderBoard(i, i - 1)}><ArrowUp /></IconButton>
                        <IconButton label={`Move Board ${i + 1} down`} size="icon-xs" onClick={() => reorderBoard(i, i + 1)}><ArrowDown /></IconButton>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </nav>

          <main className="flex min-w-0 flex-1 flex-col">
            {isEmpty && (
              <section aria-label="Start from" className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
                <h2 className="mr-1 text-sm font-medium">Start from</h2>
                {TEMPLATES.map((t) => (
                  <Button key={t.id} size="sm" variant="outline" title={t.group} onClick={() => applyTemplate(t.id)}>{t.name}</Button>
                ))}
              </section>
            )}
            <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
              <div className="absolute inset-4 grid place-items-center [container-type:size]">
                <div
                  ref={stageRef}
                  style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}
                  className="relative aspect-video w-[min(100cqw,calc(100cqh*16/9))] [container-type:inline-size]"
                >
                  <canvas
                    ref={canvasRef}
                    width={BOARD_WIDTH}
                    height={BOARD_HEIGHT}
                    className={cn("block aspect-video w-full touch-none rounded-lg border bg-white shadow-[var(--panel-shadow)]", (spaceDown || drag?.kind === "pan") && "cursor-grab")}
                    aria-label="Board"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDrag(null)}
                    onDoubleClick={(e) => {
                      if (!board || tool !== "select") return;
                      const r = canvasRef.current!.getBoundingClientRect();
                      const hit = hitTest(board, ((e.clientX - r.left) / r.width) * BOARD_WIDTH, ((e.clientY - r.top) / r.height) * BOARD_HEIGHT);
                      if (hit && TEXTUAL.has(hit.type)) startEdit(hit);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                  />
                  {editEl && (
                    // Inline text editor, ported from Excaliflow's startInlineEditing / commitInlineEditor: a textarea over the Element.
                    <textarea
                      key={editing!.id}
                      aria-label="Edit text"
                      className="absolute box-border resize-none overflow-hidden border-2 border-primary bg-white/90 text-center font-sans"
                      style={{
                        left: `${(editEl.x / BOARD_WIDTH) * 100}%`,
                        top: `${(editEl.y / BOARD_HEIGHT) * 100}%`,
                        width: `${(Math.max(editEl.width, 160) / BOARD_WIDTH) * 100}%`,
                        height: `${(Math.max(editEl.height, 48) / BOARD_HEIGHT) * 100}%`,
                        fontSize: `${(editEl.fontSize / BOARD_WIDTH) * 100}cqw`,
                        color: editEl.strokeColor,
                      }}
                      defaultValue={editEl.text}
                      ref={(ta) => ta?.focus()}
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={(e) => commitEdit(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") commitEdit(e.currentTarget.value);
                      }}
                    />
                  )}
                </div>
              </div>
                  {/* Excaliflow's floating tool island (#bottomToolDock, .glass-panel, .dock-tool-btn, .dock-key). */}
                  <Panel role="toolbar" aria-label="Drawing tools" className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 p-1">
                    {TOOLS.map((t) => (
                      <Tooltip key={t.tool}>
                        <TooltipTrigger asChild>
                          <button
                            aria-label={t.label}
                            aria-pressed={tool === t.tool}
                            onClick={() => setTool(t.tool)}
                            className="relative grid size-9 place-items-center rounded-lg border border-transparent text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                          >
                            <svg aria-hidden viewBox="0 0 24 24" className="size-[17px] fill-none stroke-current stroke-[1.85]" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                            <span aria-hidden className="pointer-events-none absolute right-[3px] bottom-0.5 text-[9px] leading-none font-semibold opacity-70">{t.hint}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t.label} ({t.key.toUpperCase()} or {t.hint})</TooltipContent>
                      </Tooltip>
                    ))}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label="Lock tool"
                          aria-pressed={toolLock}
                          onClick={() => setToolLock((l) => !l)}
                          className="grid size-9 place-items-center rounded-lg border border-transparent text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                        >
                          {toolLock ? <Lock className="size-[17px]" /> : <LockOpen className="size-[17px]" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Keep the tool after drawing (Q)</TooltipContent>
                    </Tooltip>
                    <div aria-hidden className="mx-1 h-5 w-px bg-border" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1">Insert <ChevronDown /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="top" align="end">
                        <DropdownMenuItem onSelect={() => uploadRef.current?.click()}>Upload image…</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setUrlOpen(true)}>Image from URL…</DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Template</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {TEMPLATES.map((t) => (
                              <DropdownMenuItem key={t.id} onSelect={() => applyTemplate(t.id)}>{t.name}</DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => importRef.current?.click()}>Import .excalidraw…</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Panel>
              {/* Quick action bar: Excaliflow's quickHud (hudColorDots, hudDuplicateBtn, hudDeleteBtn, hudFlipArrowBtn, hudArrowFlowBtn, hudFontGroup). */}
              {barPos && firstSelected && (
                <Panel role="toolbar" aria-label="Quick actions" style={{ left: barPos.left, top: barPos.top }} className="absolute z-10 flex h-11 -translate-x-1/2 items-center gap-1 px-2">
                  <div role="group" aria-label="Quick colour" className="flex items-center gap-1">
                    {theme.palette.map((c) => (
                      <button
                        key={c}
                        aria-label={`Quick colour ${c}`}
                        aria-pressed={firstSelected.strokeColor === c}
                        style={{ background: c }}
                        onClick={() => restyle({ strokeColor: c })}
                        className="size-5 rounded-full border outline-none transition hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-1 aria-pressed:ring-offset-background"
                      />
                    ))}
                  </div>
                  <div aria-hidden className="mx-0.5 h-5 w-px bg-border" />
                  <IconButton label="Duplicate" tip="Duplicate (⌘D)" onClick={duplicate}><Copy /></IconButton>
                  <IconButton label="Delete selection" tip="Delete (Del)" onClick={deleteSelected}><Trash2 /></IconButton>
                  {selectedArrows.length > 0 && (
                    <>
                      <IconButton label="Flip arrow" tip="Reverse arrow direction" onClick={() => update((b) => flipArrows(b, selected))}><ArrowLeftRight /></IconButton>
                      <IconButton
                        label={selectedArrows[0].flowEnabled === false ? "Turn Flow on" : "Turn Flow off"}
                        tip={selectedArrows[0].flowEnabled === false ? "Flow is off: turn on" : "Flow is on: turn off"}
                        onClick={() => update((b) => toggleArrowFlow(b, selected))}
                      >
                        {selectedArrows[0].flowEnabled === false ? <ZapOff /> : <Zap />}
                      </IconButton>
                    </>
                  )}
                  {selectedEls.some((e) => TEXTUAL.has(e.type)) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Quick font"><Type /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {FONT_IDS.map((id) => (
                          <DropdownMenuItem key={id} style={{ fontFamily: FONT_STACKS[id] }} onSelect={() => restyle({ fontOverride: id })}>{FONT_LABELS[id]}</DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onSelect={() => restyle({ fontOverride: undefined })}>Theme default</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </Panel>
              )}

              {/* Excaliflow's canvasHintPill, shown only on an empty Board. */}
              {empty && !drag && !editing && (
                <Panel className="pointer-events-none absolute bottom-20 left-1/2 flex -translate-x-1/2 gap-3 px-3 py-1.5 text-xs text-muted-foreground">
                  <span>Pick a tool and <b>drag</b> on the Board</span>
                  <span><b>Space</b> + drag pans</span>
                  <span><b>⌘</b> + scroll zooms</span>
                </Panel>
              )}

              {/* Excaliflow's zoomPill. 100% is the Board at its real 1920 pixel width; Fit is the whole Board in view. */}
              <Panel role="group" aria-label="Zoom" className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 p-1">
                <IconButton label="Zoom out" onClick={() => zoomCentre(1 / 1.25)}><Minus /></IconButton>
                <Button variant="ghost" size="sm" className="min-w-14 tabular-nums" aria-label={`Zoom ${Math.round(((view.z * fitW) / BOARD_WIDTH) * 100)}%, click to reset to 100%`} onClick={actualSize}>
                  {Math.round(((view.z * fitW) / BOARD_WIDTH) * 100)}%
                </Button>
                <IconButton label="Zoom in" onClick={() => zoomCentre(1.25)}><Plus /></IconButton>
                <Button variant="ghost" size="sm" aria-label="Fit Board to screen" onClick={fit}>Fit</Button>
              </Panel>

              {/* Excaliflow's studioToast: saved, copied and error messages. */}
              {error && (
                <p role="alert" className="pointer-events-none absolute top-3 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-lg border border-destructive/30 bg-background px-3 py-1.5 text-sm text-destructive shadow-[var(--panel-shadow)]">
                  {error} <Button size="xs" variant="outline" className="pointer-events-auto" onClick={() => setError(null)}>Dismiss</Button>
                </p>
              )}
              {!error && status && <p role="status" className="pointer-events-none absolute top-3 left-1/2 z-20 max-w-[90%] -translate-x-1/2 rounded-lg border bg-background px-3 py-1.5 text-sm shadow-[var(--panel-shadow)]">{status}</p>}
            </div>
            <input ref={exportRef} type="file" hidden aria-label="Open Presentation JSON" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) openJson(f); e.target.value = ""; }} />
            <input ref={uploadRef} type="file" hidden aria-label="Upload image" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = ""; }} />
            <input ref={importRef} type="file" hidden aria-label="Import .excalidraw" accept=".excalidraw,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importExcalidraw(f); e.target.value = ""; }} />
            <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Insert from a web address</DialogTitle></DialogHeader>
                <Input aria-label="Image URL" placeholder="Image URL" value={urlText} onChange={(e) => setUrlText(e.target.value)} />
                <DialogFooter>
                  <Button disabled={!urlText.trim()} onClick={() => { setUrlOpen(false); addImageFromUrl(); }}>Add image from URL</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </main>

          <aside aria-label="Steps" className={cn("flex shrink-0 flex-col border-l bg-background", panelOpen ? "w-80" : "w-12 items-center p-2")}>
            {!panelOpen && <IconButton label="Expand panel" onClick={() => setPanelOpen(true)}><PanelRightOpen /></IconButton>}
            {panelOpen && (
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="min-h-0 flex-1 gap-0">
                <div className="flex items-center justify-between gap-2 border-b p-2">
                  <TabsList>
                    <TabsTrigger value="style">Style</TabsTrigger>
                    <TabsTrigger value="steps">Steps</TabsTrigger>
                    <TabsTrigger value="script">Script</TabsTrigger>
                  </TabsList>
                  <IconButton label="Collapse panel" onClick={() => setPanelOpen(false)}><PanelRightClose /></IconButton>
                </div>

                <TabsContent value="style" className="flex flex-col gap-4 overflow-y-auto p-3">
                  {!firstSelected ? (
                    <p className="text-sm text-muted-foreground">Select an Element on the Board to change its look.</p>
                  ) : (
                    <>
                      {/* Excaliflow's .swatch-row / .color-swatch, filled from the Theme's palette. */}
                      <Section title="Stroke">
                        <div role="group" aria-label="Stroke colour" className="flex flex-wrap gap-1.5 py-0.5">
                          {theme.palette.map((c) => (
                            <button
                              key={c}
                              aria-label={`Stroke ${c}`}
                              aria-pressed={firstSelected.strokeColor === c}
                              style={{ background: c }}
                              onClick={() => restyle({ strokeColor: c })}
                              className="size-6 rounded-md border outline-none transition hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-background"
                            />
                          ))}
                        </div>
                      </Section>
                      <Section title="Fill">
                        <Segmented label="Fill style" value={firstSelected.fillStyle} options={FILLS} onChange={(v) => restyle({ fillStyle: v as Element["fillStyle"] })} />
                      </Section>
                      <Section title="Stroke style">
                        <Segmented label="Stroke style" value={firstSelected.strokeStyle} options={STROKES} onChange={(v) => restyle({ strokeStyle: v as Element["strokeStyle"] })} />
                      </Section>
                      <Section title="Stroke width">
                        <Segmented label="Stroke width" value={String(firstSelected.strokeWidth)} options={WIDTHS} onChange={(v) => restyle({ strokeWidth: Number(v) })} />
                      </Section>
                      <Section title="Roughness">
                        <Segmented wrap label="Roughness" value={firstSelected.roughnessOverride === undefined ? "theme" : String(firstSelected.roughnessOverride)} options={ROUGHNESSES} onChange={(v) => restyle({ roughnessOverride: v === "theme" ? undefined : Number(v) })} />
                      </Section>
                      <Section title="Font">
                        <Button size="sm" variant="outline" aria-pressed={firstSelected.fontOverride === undefined} className="aria-pressed:bg-accent aria-pressed:text-accent-foreground" onClick={() => restyle({ fontOverride: undefined })}>Theme default</Button>
                        <FontPicker value={firstSelected.fontOverride ?? (theme.fontFamily as FontId)} onChange={(f) => restyle({ fontOverride: f })} />
                      </Section>
                      {firstSelected.type === "arrow" && (
                        <>
                          <Section title="Arrow">
                            <Segmented label="Curve" value={firstSelected.curveType ?? "curved"} options={CURVES} onChange={(v) => restyle({ curveType: v as "curved" | "straight", ...(v === "curved" && !firstSelected.curveOffset ? { curveOffset: 40 } : {}) })} />
                          </Section>
                          <Section title="Flow mode">
                            <Segmented wrap label="Flow mode" value={firstSelected.flowMode ?? "comets"} options={FLOW_LABELS as [string, string][]} onChange={(v) => restyle({ flowMode: v as FlowMode })} />
                          </Section>
                          <Section title={`Flow speed (${(firstSelected.flowSpeed ?? 1).toFixed(2)}x)`}>
                            <input
                              type="range"
                              aria-label="Flow speed"
                              min={MIN_FLOW_SPEED}
                              max={MAX_FLOW_SPEED}
                              step={0.05}
                              value={firstSelected.flowSpeed ?? 1}
                              onChange={(e) => restyle({ flowSpeed: Number(e.target.value) }, "flowSpeed")}
                              className="w-full accent-primary"
                            />
                          </Section>
                        </>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="steps" className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
                  {board && (
                    <>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" disabled={!selected.length} onClick={() => { update((b) => addHighlightStep(b, selected)); setActiveStep(board.steps.length); }}>Add Highlight Step</Button>
                        <Button size="sm" variant="outline" onClick={() => { setTool("focus"); setMorphTo(null); }} aria-pressed={tool === "focus"} className="aria-pressed:bg-accent aria-pressed:text-accent-foreground">Add Focus Step</Button>
                        <Button size="sm" variant="outline" onClick={() => { update((b) => addFocusStep(b, null)); setActiveStep(board.steps.length); }}>Focus out</Button>
                        <Button size="sm" variant="outline" disabled={!selectedEl || selectedEl.type === "arrow"} onClick={() => { const b = boundsOf(selectedEl!); setMorphTo({ id: selectedEl!.id, to: { ...b } }); setTool("select"); }}>Move in a Step</Button>
                        {selectedEl?.type === "arrow" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => update((b) => addFlowStep(b, selectedEl.id, true))}>Add Flow on Step</Button>
                            <Button size="sm" variant="outline" onClick={() => update((b) => addFlowStep(b, selectedEl.id, false))}>Add Flow off Step</Button>
                          </>
                        )}
                      </div>
                      {tool === "focus" && <p className="text-sm text-muted-foreground">Drag a rectangle on the Board to zoom onto it.</p>}
                      {morphTo && (
                        <div role="group" aria-label="Move in a Step" className="flex flex-col gap-1.5 rounded-lg bg-accent p-2 text-sm text-accent-foreground">
                          Drag the Element&apos;s outline to where it should go.
                          <div className="flex gap-1">
                            <Button size="sm" onClick={() => { update((b) => addMorphStep(b, morphTo.id, morphTo.to)); setMorphTo(null); setActiveStep(board.steps.length); }}>Confirm move</Button>
                            <Button size="sm" variant="outline" onClick={() => setMorphTo(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
                        {board.steps.map((s, i) => (
                          <li key={s.id} aria-current={i === activeStep} className="flex items-center gap-0.5 rounded-lg pl-1 aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground">
                            <button className="min-w-0 flex-1 truncate rounded-md py-1 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [li[aria-current=true]_&]:font-semibold" onClick={() => setActiveStep(i)}>{stepLabel(board, i)}</button>
                            <IconButton label={`Move Step ${i + 1} up`} size="icon-xs" onClick={() => { update((b) => moveStep(b, i, i - 1)); if (i === activeStep && i > 0) setActiveStep(i - 1); }}><ArrowUp /></IconButton>
                            <IconButton label={`Move Step ${i + 1} down`} size="icon-xs" onClick={() => { update((b) => moveStep(b, i, i + 1)); if (i === activeStep && i < board.steps.length - 1) setActiveStep(i + 1); }}><ArrowDown /></IconButton>
                            <IconButton label={`Delete Step ${i + 1}`} size="icon-xs" onClick={() => { update((b) => deleteStep(b, i)); setActiveStep(null); }}><X /></IconButton>
                          </li>
                        ))}
                      </ol>
                      {step && activeStep !== null && (
                        <section aria-label={`Step ${activeStep + 1}`} className="flex flex-col gap-2 border-t pt-2">
                          <h3 className="text-xs font-medium text-muted-foreground">Step {activeStep + 1}</h3>
                          <label className="flex items-center justify-between gap-2 text-sm">
                            Layout
                            <select aria-label="Layout" className={selectCls} value={step.layout ?? ""} onChange={(e) => update((b) => updateStep(b, activeStep, { layout: (e.target.value || null) as Layout | null }))}>
                              <option value="">unset</option>
                              {LAYOUTS.map((l) => (
                                <option key={l}>{l}</option>
                              ))}
                            </select>
                          </label>
                          {step.kind === "reveal" && (
                            <>
                              <label className="flex items-center justify-between gap-2 text-sm">
                                Effect
                                <select aria-label="Effect" className={selectCls} value={step.effect ?? "fade"} onChange={(e) => update((b) => updateStep(b, activeStep, { effect: e.target.value as "fade" | "draw-on" }))}>
                                  <option value="fade">fade</option>
                                  <option value="draw-on">draw-on</option>
                                </select>
                              </label>
                              {board.steps[activeStep + 1]?.kind === "reveal" && (
                                <Button size="sm" variant="outline" onClick={() => update((b) => mergeReveals(b, activeStep))}>Merge with next</Button>
                              )}
                            </>
                          )}
                        </section>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="script" className="flex flex-col gap-2 p-3">
                  {step && activeStep !== null ? (
                    <>
                      <h3 className="text-xs font-medium text-muted-foreground">Step {activeStep + 1}</h3>
                      <textarea
                        aria-label="Script"
                        rows={8}
                        placeholder="Words to say during this Step"
                        className="w-full rounded-lg border border-input bg-background p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={step.script ?? ""}
                        onChange={(e) => update((b) => updateStep(b, activeStep, { script: e.target.value }), { key: `script-${indexRef.current}-${activeStep}` })}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Pick a Step in the Steps tab to write its Script.</p>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
