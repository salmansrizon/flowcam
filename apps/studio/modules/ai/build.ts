import type { Presentation } from "@flowcam/domain";
import { createElement } from "../authoring/board-edits";

/** An outline (what a model returns, cheap to get right) turned into a valid Presentation: nodes in a row, one reveal Step each. */
export interface Outline {
  title: string;
  boards: { nodes: { text: string; script: string }[] }[];
}

export function presentationFromOutline(o: Outline): Presentation {
  return {
    version: 1,
    id: crypto.randomUUID(),
    title: o.title,
    themeId: "paper",
    boards: o.boards.map((b) => {
      const n = Math.max(1, b.nodes.length);
      const w = Math.min(320, (1920 - 120) / n - 40);
      const elements = b.nodes.map((node, i) =>
        createElement("rectangle", { id: `n${i}`, x: 60 + i * (w + 40), y: 400, width: w, height: 200, text: node.text, seed: i + 1, fontSize: 28 }),
      );
      return {
        id: crypto.randomUUID(),
        elements,
        steps: b.nodes.map((node, i) => ({ id: `s${i}`, kind: "reveal" as const, elementIds: [`n${i}`], script: node.script })),
      };
    }),
  };
}
