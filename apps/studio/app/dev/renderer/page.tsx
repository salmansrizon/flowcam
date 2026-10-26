"use client";

import { useEffect, useRef } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, boardView, presentationViewAt, themeById, type Board, type BoardView, type ClipLog, type Element, type Presentation, type RenderEnv } from "@flowcam/domain";
import { boardRenderer, renderFrame } from "@flowcam/renderer";

// Dev harness for the golden-frame tests: draws a fixed Board at `?t=<ms>` into a 1920x1080 canvas.
// `?scene=effects` (sticky, Image, draw-on, highlight, morph, focus) and `?scene=transition` (two Boards) draw a Presentation through renderFrame;
// `?theme=<id>` applies a Theme, `?kind=fade|slide|none` sets the transition.
// Tests can also call `window.renderAt(t)` to redraw the same canvas.

const base = { strokeColor: "#171717", fillStyle: "hachure", strokeWidth: 2.2, strokeStyle: "solid", roughness: 0.85, fontFamily: "hand", fontSize: 24, text: "", curveType: "curved" } as const;
const binding = (elementId: string, side: "left" | "right") => ({ elementId, focusAngle: null, coreCenter: false, side, gap: 4 });

const elements: Element[] = [
  { ...base, id: "rect", type: "rectangle", x: 160, y: 200, width: 300, height: 160, seed: 11, strokeColor: "#0070f3", text: "Client" },
  { ...base, id: "ell", type: "ellipse", x: 700, y: 180, width: 320, height: 200, seed: 22, strokeColor: "#10b981", text: "Server" },
  { ...base, id: "dia", type: "diamond", x: 1280, y: 160, width: 340, height: 240, seed: 33, strokeColor: "#f59e0b", fillStyle: "solid", text: "Ok?" },
  { ...base, id: "a1", type: "arrow", x: 460, y: 280, width: 240, height: 0, x2: 700, y2: 280, seed: 44, curveOffset: 40, flowEnabled: true, startBinding: binding("rect", "right"), endBinding: binding("ell", "left") },
  { ...base, id: "a2", type: "arrow", x: 1020, y: 280, width: 260, height: 0, x2: 1280, y2: 280, seed: 55, curveType: "straight", startBinding: binding("ell", "right"), endBinding: binding("dia", "left") },
  { ...base, id: "txt", type: "text", x: 160, y: 520, width: 700, height: 60, seed: 66, fillStyle: "none", fontSize: 36, text: "Hand-drawn Flow" },
  { ...base, id: "free", type: "freedraw", x: 200, y: 700, width: 400, height: 120, seed: 77, strokeColor: "#7928ca", fillStyle: "none", points: [[0, 60], [60, 10], [120, 100], [180, 20], [240, 110], [300, 30], [360, 90]] },
];

const board: Board = { id: "fixture", elements, steps: [] };

function viewFor(): BoardView {
  return {
    ...boardView(board, []),
    stepIndex: 0,
    // a2 is mid fade-in at t=1500.
    revealedAt: new Map<string, number>([...elements.map((e) => [e.id, -Infinity] as [string, number]), ["a2", 1400]]),
    flowing: new Set(["a1", "a2"]),
    ink: [{ id: "ink1", points: [[900, 700, 0], [1000, 640, 10], [1100, 720, 20], [1200, 650, 30], [1300, 740, 40]] }],
    pointer: { x: 1300, y: 740 },
  };
}

const sceneBase = { ...base, fillStyle: "solid", roughness: 0.85 } as const;

const effectsBoard: Board = {
  id: "effects",
  elements: [
    { ...sceneBase, id: "sticky", type: "sticky", x: 120, y: 120, width: 300, height: 220, seed: 5, fillStyle: "solid", text: "Remember\nthis", fontSize: 32 },
    { ...sceneBase, id: "img", type: "image", x: 520, y: 100, width: 320, height: 240, seed: 6, fillStyle: "none", imageId: "pic" },
    { ...sceneBase, id: "missing", type: "image", x: 940, y: 100, width: 240, height: 180, seed: 7, fillStyle: "none", imageId: "nope" },
    { ...sceneBase, id: "draw", type: "rectangle", x: 120, y: 480, width: 400, height: 220, seed: 8, fillStyle: "none", strokeColor: "#ff00aa", text: "Draw-on" },
    { ...sceneBase, id: "hl", type: "ellipse", x: 640, y: 480, width: 300, height: 200, seed: 9, fillStyle: "none", strokeColor: "#12ab34", text: "Glow" },
    { ...sceneBase, id: "mv", type: "diamond", x: 1060, y: 460, width: 200, height: 160, seed: 10, fillStyle: "none", strokeColor: "#3366ff", text: "Move" },
    { ...sceneBase, id: "arr", type: "arrow", x: 940, y: 580, width: 120, height: 0, x2: 1060, y2: 540, seed: 11, curveType: "straight", startBinding: { elementId: "hl", focusAngle: null, coreCenter: false, side: "right", gap: 4 }, endBinding: { elementId: "mv", focusAngle: null, coreCenter: false, side: "left", gap: 4 } },
  ],
  steps: [
    { id: "s1", kind: "reveal", elementIds: ["draw"], effect: "draw-on" },
    { id: "s2", kind: "morph", elementId: "mv", to: { x: 1400, y: 700, width: 300, height: 240 } },
    { id: "s3", kind: "focus", rect: { x: 100, y: 400, width: 960, height: 540 } },
    { id: "s4", kind: "highlight", elementIds: ["hl"] },
  ],
};
// Steps appear at 1000, 2000, 3000 and 4000 ms.
const effectsLog: ClipLog = { version: 2, clipId: "c", startBoard: 0, startStep: 0, durationMs: 6000, events: [1, 2, 3, 4].map((i) => ({ t: i * 1000, type: "step" as const, index: i })) };

const boardOf = (id: string, color: string, text: string, kind: Board["transition"]): Board => ({
  id,
  transition: kind,
  elements: [{ ...sceneBase, id: `${id}-box`, type: "rectangle", x: 300, y: 300, width: 800, height: 400, seed: 3, strokeColor: color, text, fontSize: 64 }],
  steps: [],
});

function transitionPresentation(kind: Board["transition"]): Presentation {
  return { version: 1, id: "p", title: "t", themeId: "paper", boards: [boardOf("a", "#0070f3", "One", undefined), boardOf("b", "#f59e0b", "Two", kind)] };
}
const transitionLog: ClipLog = { version: 2, clipId: "c", startBoard: 0, startStep: 0, durationMs: 4000, events: [{ t: 1000, type: "board", index: 1 }] };

function makePicture(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 120;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 160, 120);
  grad.addColorStop(0, "#ff6b6b");
  grad.addColorStop(1, "#4dabf7");
  g.fillStyle = grad;
  g.fillRect(0, 0, 160, 120);
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(110, 40, 18, 0, Math.PI * 2);
  g.fill();
  return c;
}

declare global {
  interface Window {
    renderAt?: (t: number) => string;
  }
}

export default function RendererHarness() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const q = new URLSearchParams(window.location.search);
    const scene = q.get("scene");
    const themeId = q.get("theme");
    const env: RenderEnv | undefined = scene || themeId ? { theme: themeById(themeId ?? "paper"), images: new Map([["pic", makePicture()]]) } : undefined;
    const kind = (q.get("kind") ?? "fade") as Board["transition"];
    const presentation: Presentation | null = scene === "effects" ? { version: 1, id: "p", title: "t", themeId: "paper", boards: [effectsBoard] } : scene === "transition" ? transitionPresentation(kind) : null;
    const log = scene === "effects" ? effectsLog : transitionLog;
    const renderAt = (t: number) => {
      if (presentation) renderFrame(ctx, presentation, presentationViewAt(presentation, log, t), t, env);
      else boardRenderer.render(ctx, board, viewFor(), t, env);
      return canvas.toDataURL();
    };
    window.renderAt = renderAt;
    const t = Number(q.get("t") ?? 0);
    // Wait for fonts so text is drawn with the same face on every load.
    document.fonts.ready.then(() => {
      renderAt(t);
      canvas.dataset.ready = "true";
    });
  }, []);

  return <canvas id="board" ref={ref} width={BOARD_WIDTH} height={BOARD_HEIGHT} style={{ width: "100%", height: "auto" }} />;
}
