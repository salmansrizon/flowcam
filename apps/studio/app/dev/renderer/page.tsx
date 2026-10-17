"use client";

import { useEffect, useRef } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, type Board, type BoardView, type Element } from "@flowcam/domain";
import { boardRenderer } from "@flowcam/renderer";

// Dev harness for the golden-frame tests: draws a fixed Board at `?t=<ms>` into a 1920x1080 canvas.
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
    stepIndex: 0,
    // a2 is mid fade-in at t=1500.
    revealedAt: new Map<string, number>([...elements.map((e) => [e.id, -Infinity] as [string, number]), ["a2", 1400]]),
    flowing: new Set(["a1", "a2"]),
    ink: [{ id: "ink1", points: [[900, 700, 0], [1000, 640, 10], [1100, 720, 20], [1200, 650, 30], [1300, 740, 40]] }],
    pointer: { x: 1300, y: 740 },
  };
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
    const renderAt = (t: number) => {
      boardRenderer.render(ctx, board, viewFor(), t);
      return canvas.toDataURL();
    };
    window.renderAt = renderAt;
    const t = Number(new URLSearchParams(window.location.search).get("t") ?? 0);
    // Wait for fonts so text is drawn with the same face on every load.
    document.fonts.ready.then(() => {
      renderAt(t);
      canvas.dataset.ready = "true";
    });
  }, []);

  return <canvas id="board" ref={ref} width={BOARD_WIDTH} height={BOARD_HEIGHT} style={{ width: "100%", height: "auto" }} />;
}
