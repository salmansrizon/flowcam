"use client";

import { useEffect, useRef, useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, LAYOUTS, THEMES, TRANSITIONS, boardView, boundsOf, themeById, type Board, type Element, type ElementType, type Layout, type Presentation, type Rect, type Transition } from "@flowcam/domain";
import { boardRenderer } from "@flowcam/renderer";
import { addElement, addFlowStep, createElement, deleteElement, deleteStep, hitTest, moveElement, moveStep } from "./board-edits";
import { addBoard, deleteBoard, insertBoard, isEmptyBoard, moveBoard, setTransition, updateBoard } from "./deck-edits";
import { addFocusStep, addHighlightStep, addMorphStep, duplicateElements, mergeReveals, setElementText, updateStep } from "./step-edits";
import { fromExcalidraw, excalidrawFiles } from "./excalidraw";
import { TEMPLATES, templateBoard } from "./templates";
import { dataUrlToBlob, decodeImages, fetchImageAsset, readAsset, writeAsset } from "../presentation/assets";
import { loadPresentation, newPresentation, savePresentation } from "../presentation/store";
import styles from "./Editor.module.css";

type Tool = "select" | Exclude<ElementType, "image"> | "focus";
const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "Select", key: "v" },
  { tool: "rectangle", label: "Rectangle", key: "r" },
  { tool: "ellipse", label: "Ellipse", key: "o" },
  { tool: "diamond", label: "Diamond", key: "d" },
  { tool: "arrow", label: "Arrow", key: "a" },
  { tool: "text", label: "Text", key: "t" },
  { tool: "sticky", label: "Sticky", key: "n" },
  { tool: "freedraw", label: "Freehand", key: "p" },
];
// Shortcuts follow Excaliflow's shortcutMap (number keys and letters), minus the tools Flowcam does not have.
const KEYS: Record<string, Tool> = { "1": "select", "2": "rectangle", "3": "diamond", "4": "ellipse", "5": "arrow", "7": "freedraw", "8": "text", "9": "sticky", ...Object.fromEntries(TOOLS.map((t) => [t.key, t.tool])) };

type Drag =
  | { kind: "move"; last: [number, number] }
  | { kind: "draw"; el: Element; start: [number, number] }
  | { kind: "rect"; start: [number, number]; rect: Rect }
  | { kind: "morph"; last: [number, number] };
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
  const [tab, setTab] = useState<"steps" | "script">("steps");
  const [drag, setDragState] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [morphTo, setMorphTo] = useState<{ id: string; to: Rect } | null>(null);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [urlText, setUrlText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      .then((p) => setPresentation(p ?? newPresentation()))
      .catch((e) => setError(`Could not load your Presentation: ${e.message}`));
  }, []);

  function update(edit: (b: Board) => Board) {
    setPresentation((p) => (p ? updateBoard(p, indexRef.current, edit) : p));
  }
  function updateDeck(edit: (p: Presentation) => Presentation) {
    setPresentation((p) => (p ? edit(p) : p));
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
    setPresentation(r.presentation);
    goto(r.index);
  }

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isField(e.target) || !board) return;
      const meta = e.metaKey || e.ctrlKey;
      if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
        update((b) => selected.reduce(deleteElement, b));
        setSelected([]);
      } else if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(board.elements.map((x) => x.id));
      } else if (meta && e.key.toLowerCase() === "c") {
        clipboard.current = JSON.parse(JSON.stringify(board.elements.filter((x) => selected.includes(x.id))));
        pastes.current = 0;
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
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
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
    const [x, y] = toBoard(e);
    if (drag.kind === "move") {
      update((b) => selected.reduce((acc, id) => moveElement(acc, id, x - drag.last[0], y - drag.last[1]), b));
      setDrag({ ...drag, last: [x, y] });
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

  return (
    <div className={styles.editor}>
      <header className={styles.top}>
        <h1>Flowcam Studio</h1>
        <label>
          Theme{" "}
          <select aria-label="Theme" value={presentation?.themeId ?? "paper"} onChange={(e) => updateDeck((p) => ({ ...p, themeId: e.target.value }))}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <a href="/record">Record</a>
      </header>
      {error && (
        <p role="alert" className={styles.error}>
          {error} <button onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      {status && <p role="status" className={styles.status}>{status}</p>}

      <nav className={styles.boards} aria-label="Boards">
        <h2>Boards</h2>
        <ol>
          {presentation?.boards.map((b, i) => (
            <li
              key={b.id}
              draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom.current !== null) updateDeck((p) => moveBoard(p, dragFrom.current!, i));
                if (dragFrom.current === boardIndex) setBoardIndex(i);
                dragFrom.current = null;
              }}
            >
              <button aria-current={i === boardIndex} className={styles.boardBtn} onClick={() => goto(i)}>
                Board {i + 1} ({b.elements.length})
              </button>
              <button aria-label={`Move Board ${i + 1} up`} onClick={() => { updateDeck((p) => moveBoard(p, i, i - 1)); if (i === boardIndex && i > 0) setBoardIndex(i - 1); }}>↑</button>
              <button aria-label={`Move Board ${i + 1} down`} onClick={() => { updateDeck((p) => moveBoard(p, i, i + 1)); if (i === boardIndex && i < presentation.boards.length - 1) setBoardIndex(i + 1); }}>↓</button>
            </li>
          ))}
        </ol>
        <p>
          <button onClick={() => { updateDeck((p) => addBoard(p, boardIndex)); goto(boardIndex + 1); }}>Add Board</button>{" "}
          <button
            onClick={() => {
              if (board!.elements.length && !window.confirm(`Delete Board ${boardIndex + 1} and its ${board!.elements.length} Elements?`)) return;
              updateDeck((p) => deleteBoard(p, boardIndex));
              goto(Math.max(0, boardIndex - 1));
            }}
          >
            Delete Board
          </button>
        </p>
        <label>
          Transition{" "}
          <select aria-label="Transition" value={board?.transition ?? "fade"} onChange={(e) => updateDeck((p) => setTransition(p, boardIndex, e.target.value as Transition))}>
            {TRANSITIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <section aria-label="Start from">
          <h2>Start from</h2>
          {isEmpty ? (
            <ul className={styles.chooser}>
              {TEMPLATES.map((t) => (
                <li key={t.id}>
                  <button onClick={() => applyTemplate(t.id)}>{t.name}</button> <small>{t.group}</small>
                </li>
              ))}
            </ul>
          ) : (
            <select aria-label="Add Template" value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
              <option value="">Add a Template Board…</option>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </section>
        <label className={styles.file}>
          Import .excalidraw
          <input type="file" aria-label="Import .excalidraw" accept=".excalidraw,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importExcalidraw(f); e.target.value = ""; }} />
        </label>
      </nav>

      <div role="toolbar" aria-label="Drawing tools" className={styles.tools}>
        {TOOLS.map((t) => (
          <button key={t.tool} aria-pressed={tool === t.tool} title={`${t.label} (${t.key})`} onClick={() => setTool(t.tool)}>
            {t.label}
          </button>
        ))}
        <label className={styles.file}>
          Upload image
          <input type="file" aria-label="Upload image" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = ""; }} />
        </label>
        <input aria-label="Image URL" placeholder="Image URL" value={urlText} onChange={(e) => setUrlText(e.target.value)} />
        <button disabled={!urlText.trim()} onClick={addImageFromUrl}>Add image from URL</button>
      </div>

      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          className={styles.canvas}
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
            className={styles.inline}
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

      <aside className={styles.steps} aria-label="Steps">
        <div role="tablist" className={styles.tabs}>
          <button role="tab" aria-selected={tab === "steps"} onClick={() => setTab("steps")}>Steps</button>
          <button role="tab" aria-selected={tab === "script"} onClick={() => setTab("script")}>Script</button>
        </div>
        {tab === "steps" && board && (
          <>
            <p className={styles.actions}>
              <button disabled={!selected.length} onClick={() => { update((b) => addHighlightStep(b, selected)); setActiveStep(board.steps.length); }}>Add Highlight Step</button>
              <button onClick={() => { setTool("focus"); setMorphTo(null); }} aria-pressed={tool === "focus"}>Add Focus Step</button>
              <button onClick={() => { update((b) => addFocusStep(b, null)); setActiveStep(board.steps.length); }}>Focus out</button>
              <button disabled={!selectedEl || selectedEl.type === "arrow"} onClick={() => { const b = boundsOf(selectedEl!); setMorphTo({ id: selectedEl!.id, to: { ...b } }); setTool("select"); }}>Move in a Step</button>
              {selectedEl?.type === "arrow" && (
                <>
                  <button onClick={() => update((b) => addFlowStep(b, selectedEl.id, true))}>Add Flow on Step</button>
                  <button onClick={() => update((b) => addFlowStep(b, selectedEl.id, false))}>Add Flow off Step</button>
                </>
              )}
            </p>
            {tool === "focus" && <p>Drag a rectangle on the Board to zoom onto it.</p>}
            {morphTo && (
              <p role="group" aria-label="Move in a Step">
                Drag the Element&apos;s outline to where it should go.{" "}
                <button onClick={() => { update((b) => addMorphStep(b, morphTo.id, morphTo.to)); setMorphTo(null); setActiveStep(board.steps.length); }}>Confirm move</button>{" "}
                <button onClick={() => setMorphTo(null)}>Cancel</button>
              </p>
            )}
            <ol>
              {board.steps.map((s, i) => (
                <li key={s.id} aria-current={i === activeStep} className={i === activeStep ? styles.active : undefined}>
                  <button className={styles.stepBtn} onClick={() => setActiveStep(i)}>{stepLabel(board, i)}</button>{" "}
                  <button aria-label={`Move Step ${i + 1} up`} onClick={() => { update((b) => moveStep(b, i, i - 1)); if (i === activeStep && i > 0) setActiveStep(i - 1); }}>↑</button>
                  <button aria-label={`Move Step ${i + 1} down`} onClick={() => { update((b) => moveStep(b, i, i + 1)); if (i === activeStep && i < board.steps.length - 1) setActiveStep(i + 1); }}>↓</button>
                  <button aria-label={`Delete Step ${i + 1}`} onClick={() => { update((b) => deleteStep(b, i)); setActiveStep(null); }}>✕</button>
                </li>
              ))}
            </ol>
          </>
        )}
        {step && activeStep !== null && board && (
          <section aria-label={`Step ${activeStep + 1}`} className={styles.detail}>
            <h3>Step {activeStep + 1}</h3>
            {tab === "script" ? (
              <textarea aria-label="Script" rows={8} placeholder="Words to say during this Step" value={step.script ?? ""} onChange={(e) => update((b) => updateStep(b, activeStep, { script: e.target.value }))} />
            ) : (
              <>
                <label>
                  Layout{" "}
                  <select aria-label="Layout" value={step.layout ?? ""} onChange={(e) => update((b) => updateStep(b, activeStep, { layout: (e.target.value || null) as Layout | null }))}>
                    <option value="">unset</option>
                    {LAYOUTS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                {step.kind === "reveal" && (
                  <>
                    <label>
                      {" "}Effect{" "}
                      <select aria-label="Effect" value={step.effect ?? "fade"} onChange={(e) => update((b) => updateStep(b, activeStep, { effect: e.target.value as "fade" | "draw-on" }))}>
                        <option value="fade">fade</option>
                        <option value="draw-on">draw-on</option>
                      </select>
                    </label>
                    {board.steps[activeStep + 1]?.kind === "reveal" && (
                      <p><button onClick={() => update((b) => mergeReveals(b, activeStep))}>Merge with next</button></p>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        )}
        {tab === "script" && !step && <p>Pick a Step in the Steps tab to write its Script.</p>}
      </aside>
    </div>
  );
}
