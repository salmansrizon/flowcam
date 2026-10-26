"use client";

import { useEffect, useRef, useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, type Board, type Element, type ElementType, type Presentation } from "@flowcam/domain";
import { boardRenderer } from "@flowcam/renderer";
import { addElement, addFlowStep, createElement, deleteElement, deleteStep, hitTest, moveElement, moveStep } from "./board-edits";
import { loadPresentation, newPresentation, savePresentation } from "../presentation/store";
import styles from "./Editor.module.css";

type Tool = "select" | ElementType;
const TOOLS: { tool: Tool; label: string }[] = [
  { tool: "select", label: "Select" },
  { tool: "rectangle", label: "Rectangle" },
  { tool: "ellipse", label: "Ellipse" },
  { tool: "diamond", label: "Diamond" },
  { tool: "arrow", label: "Arrow" },
  { tool: "text", label: "Text" },
  { tool: "freedraw", label: "Freehand" },
];

type Drag =
  | { kind: "move"; id: string; last: [number, number] }
  | { kind: "draw"; el: Element; start: [number, number] };

function stepLabel(board: Board, i: number): string {
  const s = board.steps[i];
  const name = (id: string) => {
    const el = board.elements.find((e) => e.id === id);
    return el ? (el.text ? `${el.type} “${el.text}”` : el.type) : "?";
  };
  return s.kind === "reveal" ? `Reveal ${s.elementIds.map(name).join(", ")}` : `Flow ${s.on ? "on" : "off"}: ${name(s.arrowId)}`;
}

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Pointer events can arrive faster than React re-renders, so handlers read the live drag from a ref.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const saving = useRef(Promise.resolve());
  const [error, setError] = useState<string | null>(null);

  const board = presentation?.boards[0];

  useEffect(() => {
    loadPresentation()
      .then((p) => setPresentation(p ?? newPresentation()))
      .catch((e) => setError(`Could not load your Presentation: ${e.message}`));
  }, []);

  function update(edit: (b: Board) => Board) {
    setPresentation((p) => (p ? { ...p, boards: [edit(p.boards[0])] } : p));
  }

  // Save after each change, one write at a time, and not on every pointer move of a drag.
  useEffect(() => {
    if (!presentation || drag) return;
    saving.current = saving.current
      .then(() => savePresentation(presentation))
      .catch((e) => setError(`Could not save: ${e.message}`));
  }, [presentation, drag]);

  // Draw every frame so Flows animate; in the editor every Element is visible.
  useEffect(() => {
    if (!board) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const elements = drag?.kind === "draw" ? [...board.elements, drag.el] : board.elements;
    const shown: Board = { ...board, elements };
    const view = {
      stepIndex: board.steps.length,
      revealedAt: new Map(elements.map((e) => [e.id, -Infinity])),
      flowing: new Set(elements.filter((e) => e.type === "arrow" && e.flowEnabled).map((e) => e.id)),
      ink: [],
      pointer: null,
    };
    let frame = requestAnimationFrame(function draw(now) {
      boardRenderer.render(ctx, shown, view, now);
      const sel = elements.find((e) => e.id === selected);
      if (sel) {
        ctx.strokeStyle = "#1c7ed6";
        ctx.setLineDash([8, 6]);
        const [x1, y1] = [Math.min(sel.x, sel.x2 ?? sel.x), Math.min(sel.y, sel.y2 ?? sel.y)];
        ctx.strokeRect(x1 - 8, y1 - 8, sel.width + 16, sel.height + 16);
        ctx.setLineDash([]);
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [board, drag, selected]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target instanceof HTMLInputElement)) {
        update((b) => deleteElement(b, selected));
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function toBoard(e: React.PointerEvent): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOARD_WIDTH, ((e.clientY - r.top) / r.height) * BOARD_HEIGHT];
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!board) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toBoard(e);
    if (tool === "select") {
      const hit = hitTest(board, x, y);
      setSelected(hit?.id ?? null);
      if (hit) setDrag({ kind: "move", id: hit.id, last: [x, y] });
      return;
    }
    if (tool === "text") {
      // ponytail: native prompt for text entry; an inline editor comes with the full Authoring UI.
      const text = window.prompt("Text");
      if (text) update((b) => addElement(b, createElement("text", { x, y, width: Math.max(40, text.length * 16), height: 40, text })));
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
      update((b) => moveElement(b, drag.id, x - drag.last[0], y - drag.last[1]));
      setDrag({ ...drag, last: [x, y] });
      return;
    }
    const { el, start } = drag;
    if (el.type === "arrow") {
      setDrag({ ...drag, el: { ...el, x2: x, y2: y, width: Math.abs(x - start[0]), height: Math.abs(y - start[1]) } });
    } else if (el.type === "freedraw") {
      setDrag({ ...drag, el: { ...el, points: [...el.points!, [x - start[0], y - start[1]]] } });
    } else {
      setDrag({ ...drag, el: { ...el, x: Math.min(x, start[0]), y: Math.min(y, start[1]), width: Math.abs(x - start[0]), height: Math.abs(y - start[1]) } });
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (drag?.kind === "draw") {
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
        setSelected(added.id);
      }
    }
    setDrag(null);
  }

  const selectedEl = board?.elements.find((e) => e.id === selected);

  return (
    <div className={styles.editor}>
      <header className={styles.top}>
        <h1>Flowcam Studio</h1>
        <a href="/record">Record</a>
      </header>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div role="toolbar" aria-label="Drawing tools" className={styles.tools}>
        {TOOLS.map((t) => (
          <button key={t.tool} aria-pressed={tool === t.tool} onClick={() => setTool(t.tool)}>
            {t.label}
          </button>
        ))}
      </div>
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
      />
      <aside className={styles.steps} aria-label="Steps">
        <h2>Steps</h2>
        {selectedEl?.type === "arrow" && (
          <p>
            <button onClick={() => update((b) => addFlowStep(b, selectedEl.id, true))}>Add Flow on Step</button>{" "}
            <button onClick={() => update((b) => addFlowStep(b, selectedEl.id, false))}>Add Flow off Step</button>
          </p>
        )}
        <ol>
          {board?.steps.map((s, i) => (
            <li key={s.id}>
              {stepLabel(board, i)}{" "}
              <button aria-label={`Move Step ${i + 1} up`} onClick={() => update((b) => moveStep(b, i, i - 1))}>↑</button>
              <button aria-label={`Move Step ${i + 1} down`} onClick={() => update((b) => moveStep(b, i, i + 1))}>↓</button>
              <button aria-label={`Delete Step ${i + 1}`} onClick={() => update((b) => deleteStep(b, i))}>✕</button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
