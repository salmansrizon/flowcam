import { stepsFromDrawingOrder, type Element, type Presentation } from "@flowcam/domain";

// Recorded when OPFS has no presentation.json yet (Authoring is not built).

const base = {
  strokeColor: "#1e1e1e",
  fillStyle: "none",
  strokeWidth: 3,
  strokeStyle: "solid",
  roughness: 1,
  fontFamily: "Virgil",
  fontSize: 32,
  text: "",
} as const;

const elements: Element[] = [
  { ...base, id: "client", type: "rectangle", x: 280, y: 440, width: 400, height: 220, seed: 11 },
  { ...base, id: "server", type: "rectangle", x: 1240, y: 440, width: 400, height: 220, seed: 12 },
  { ...base, id: "request", type: "arrow", x: 680, y: 550, x2: 1240, y2: 550, width: 560, height: 0, seed: 13, flowEnabled: false },
  { ...base, id: "title", type: "text", x: 660, y: 180, width: 600, height: 80, fontSize: 56, text: "How a request flows", seed: 14 },
];

export const fixturePresentation: Presentation = {
  version: 1,
  id: "fixture",
  title: "How a request flows",
  themeId: "paper",
  boards: [{ id: "board_fixture", elements, steps: stepsFromDrawingOrder(elements) }],
};
