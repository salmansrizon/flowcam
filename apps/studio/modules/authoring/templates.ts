import type { Binding, Board, Element, ElementType, Step } from "@flowcam/domain";
import { createElement } from "./board-edits";

// Templates. The first four are converted from Excaliflow's loadTemplate() graphs (Apache-2.0, see
// packages/renderer/NOTICE): same nodes, labels and colours, scaled from its ~1000 px canvas to the 1920x1080 Board
// and given a reveal Step per Element plus a script line per node. The rest are Flowcam's own.

type Node = [id: string, type: ElementType, x: number, y: number, w: number, h: number, text: string, color: string, script?: string];
type Edge = [from: string, to: string, curve?: number];
export interface Template {
  id: string;
  name: string;
  group: "Lesson" | "Explainer" | "System design";
  nodes: Node[];
  edges: Edge[];
}

const SCALE = 1.7;
const sideOf = (a: number): Binding["side"] => (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? "right" : "left") : Math.sin(a) > 0 ? "bottom" : "top");

/** Builds a Board: each node then the arrows whose both ends now exist, one reveal Step each (drawing order). */
export function templateBoard(t: Template): Board {
  const elements: Element[] = [];
  const steps: Step[] = [];
  const byId = new Map<string, Element>();
  const reveal = (el: Element, script?: string) => {
    elements.push(el);
    steps.push({ id: `step_${el.id}`, kind: "reveal", elementIds: [el.id], ...(script ? { script } : {}) });
  };
  t.nodes.forEach(([id, type, x, y, w, h, text, color, script], n) => {
    const el = createElement(type, { id: `${t.id}_${id}`, x: x * SCALE + 60, y: y * SCALE + 90, width: w * SCALE, height: h * SCALE, text, strokeColor: color, fontSize: 28, seed: n + 1 });
    byId.set(id, el);
    reveal(el, script);
    for (const [from, to, curve = 0] of t.edges) {
      if (!((to === id && byId.has(from)) || (from === id && byId.has(to)))) continue;
      const [a, b] = [byId.get(from)!, byId.get(to)!];
      const [ac, bc] = [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: b.x + b.width / 2, y: b.y + b.height / 2 }];
      const out = Math.atan2(bc.y - ac.y, bc.x - ac.x);
      const inn = Math.atan2(ac.y - bc.y, ac.x - bc.x);
      const arrow = createElement("arrow", {
        id: `${t.id}_${from}_${to}`, x: ac.x, y: ac.y, x2: bc.x, y2: bc.y,
        width: Math.abs(bc.x - ac.x), height: Math.abs(bc.y - ac.y),
        curveOffset: curve, curveType: Math.abs(curve) > 1 ? "curved" : "straight", strokeColor: a.strokeColor, seed: n + 100,
        startBinding: { elementId: a.id, focusAngle: out, coreCenter: false, side: sideOf(out), gap: 4 },
        endBinding: { elementId: b.id, focusAngle: inn, coreCenter: false, side: sideOf(inn), gap: 4 },
      });
      reveal(arrow);
    }
  });
  return { id: crypto.randomUUID(), elements, steps };
}

const B = "#0070f3", P = "#7928ca", C = "#06b6d4", O = "#f59e0b", G = "#10b981", R = "#ef4444";

export const TEMPLATES: Template[] = [
  // --- from Excaliflow ---
  { id: "browser", name: "How Browsers Work", group: "Explainer",
    nodes: [
      ["url", "ellipse", 70, 220, 148, 70, "URL Request\nHTTPS / DNS", B, "It starts with a URL."],
      ["html", "rectangle", 295, 125, 156, 70, "HTML Parser\nDOM Tree", P, "The HTML becomes a DOM tree."],
      ["css", "rectangle", 295, 315, 156, 70, "CSS Parser\nCSSOM", C, "The CSS becomes the CSSOM."],
      ["render", "diamond", 530, 208, 174, 96, "Render Tree\n& Layout", O, "Both merge into the render tree."],
      ["paint", "rectangle", 780, 220, 162, 70, "Composite &\n60fps Paint", G, "Finally the page is painted."],
    ],
    edges: [["url", "html", -20], ["url", "css", 20], ["html", "render", 16], ["css", "render", -16], ["render", "paint"]] },
  { id: "rag", name: "RAG Pipeline", group: "System design",
    nodes: [
      ["q", "ellipse", 70, 225, 146, 70, "User Query", B, "A user asks a question."],
      ["emb", "rectangle", 285, 225, 158, 70, "Embedding\nEncoder", P, "We embed the question."],
      ["vec", "diamond", 515, 120, 170, 94, "Vector DB\nTop-K Search", C, "Search finds the closest chunks."],
      ["rerank", "rectangle", 520, 320, 158, 70, "Cross-Encoder\nReranker", O, "A reranker orders them."],
      ["llm", "rectangle", 765, 225, 164, 72, "LLM Context\nSynthesizer", G, "The model answers from that context."],
    ],
    edges: [["q", "emb"], ["emb", "vec", -18], ["vec", "rerank"], ["rerank", "llm", 18], ["emb", "llm", -28]] },
  { id: "microservices", name: "Microservices", group: "System design",
    nodes: [
      ["gw", "diamond", 70, 215, 166, 94, "API Gateway\nRate Limiter", B, "Every request enters through the gateway."],
      ["auth", "rectangle", 315, 100, 152, 68, "Auth Service\nJWT Verify", P, "Auth verifies the token."],
      ["ord", "rectangle", 315, 228, 152, 68, "Order Engine", G, "Orders are handled here."],
      ["pay", "rectangle", 315, 355, 152, 68, "Payment Worker", O, "Payments run in a worker."],
      ["kafka", "ellipse", 565, 228, 160, 72, "Event Bus\nKafka Stream", R, "Services talk through events."],
      ["db", "rectangle", 800, 228, 156, 70, "Read Replica\nAnalytics", C, "Analytics reads a replica."],
    ],
    edges: [["gw", "auth", -20], ["gw", "ord"], ["gw", "pay", 20], ["ord", "kafka"], ["pay", "kafka", -18], ["kafka", "db"]] },
  { id: "agents", name: "AI Agent Swarm", group: "System design",
    nodes: [
      ["user", "ellipse", 70, 225, 146, 70, "User Task\nSpec", B, "The user gives a task."],
      ["plan", "diamond", 285, 212, 170, 94, "Orchestrator\nPlanner", P, "An orchestrator plans the work."],
      ["code", "rectangle", 530, 115, 160, 70, "Coder Agent\nSandbox", G, "A coder agent writes the code."],
      ["res", "rectangle", 530, 325, 160, 70, "Research Agent\nWeb & Docs", C, "A research agent reads the docs."],
      ["ver", "rectangle", 780, 225, 164, 70, "Verifier Agent\nTest Runner", O, "A verifier runs the tests."],
    ],
    edges: [["user", "plan"], ["plan", "code", -20], ["plan", "res", 20], ["code", "ver", 18], ["res", "ver", -18]] },
  // --- Flowcam's own ---
  { id: "lesson3", name: "Three-point lesson", group: "Lesson",
    nodes: [
      ["title", "text", 300, 20, 360, 50, "Today's topic", B, "Here is what we will cover."],
      ["one", "rectangle", 60, 170, 220, 110, "1. The idea", P, "First, the idea."],
      ["two", "rectangle", 380, 170, 220, 110, "2. An example", G, "Second, an example."],
      ["three", "rectangle", 700, 170, 220, 110, "3. Try it", O, "Third, try it yourself."],
    ],
    edges: [["one", "two"], ["two", "three"]] },
  { id: "compare", name: "Compare two options", group: "Lesson",
    nodes: [
      ["a", "rectangle", 60, 140, 300, 120, "Option A\nfast, simple", B, "Option A is fast and simple."],
      ["vs", "ellipse", 420, 160, 120, 80, "vs", R, "But compare it with B."],
      ["b", "rectangle", 600, 140, 300, 120, "Option B\nflexible, slower", G, "Option B is flexible but slower."],
      ["pick", "diamond", 340, 330, 280, 110, "Which fits\nyour case?", O, "Pick by your constraints."],
    ],
    edges: [["a", "pick"], ["b", "pick"]] },
  { id: "timeline", name: "Timeline", group: "Explainer",
    nodes: [
      ["t1", "ellipse", 40, 200, 150, 80, "Start", B, "It begins here."],
      ["t2", "ellipse", 270, 200, 150, 80, "Growth", P, "Then it grows."],
      ["t3", "ellipse", 500, 200, 150, 80, "Peak", O, "It reaches a peak."],
      ["t4", "ellipse", 730, 200, 150, 80, "Today", G, "And where we are today."],
    ],
    edges: [["t1", "t2"], ["t2", "t3"], ["t3", "t4"]] },
  { id: "cycle", name: "Feedback loop", group: "Explainer",
    nodes: [
      ["plan", "rectangle", 100, 100, 200, 80, "Plan", B, "Plan the change."],
      ["do", "rectangle", 600, 100, 200, 80, "Do", P, "Do it."],
      ["check", "rectangle", 600, 320, 200, 80, "Check", O, "Check the result."],
      ["act", "rectangle", 100, 320, 200, 80, "Act", G, "Act on what you learned."],
    ],
    edges: [["plan", "do"], ["do", "check"], ["check", "act"], ["act", "plan", 30]] },
  { id: "clientserver", name: "Client and server", group: "System design",
    nodes: [
      ["client", "rectangle", 50, 200, 190, 90, "Browser\nClient", B, "The browser sends a request."],
      ["api", "diamond", 340, 190, 200, 110, "API\nServer", P, "The API handles it."],
      ["cache", "ellipse", 640, 80, 190, 80, "Cache", O, "Hot data comes from the cache."],
      ["db", "rectangle", 640, 320, 190, 90, "Database", G, "Everything else is read from the database."],
    ],
    edges: [["client", "api"], ["api", "cache", -14], ["api", "db", 14]] },
  { id: "cicd", name: "CI/CD pipeline", group: "System design",
    nodes: [
      ["push", "ellipse", 40, 220, 140, 70, "git push", B, "A push starts the pipeline."],
      ["build", "rectangle", 240, 215, 140, 70, "Build", P, "Build the app."],
      ["test", "rectangle", 440, 215, 140, 70, "Test", O, "Run the tests."],
      ["deploy", "diamond", 640, 200, 160, 100, "Deploy?", G, "If green, deploy."],
      ["prod", "rectangle", 860, 215, 120, 70, "Prod", R, "Live in production."],
    ],
    edges: [["push", "build"], ["build", "test"], ["test", "deploy"], ["deploy", "prod"]] },
];
