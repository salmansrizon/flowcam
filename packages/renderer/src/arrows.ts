// Ported from Excaliflow (Apache-2.0), see ../NOTICE: advanced_llm_apps/excaliflow/index.html @ 40b16b6.
// Arrow geometry, graph depth and Flow particles. Elbow arrows are not part of the domain model, so they are dropped.
import { MAX_FLOW_SPEED, MIN_FLOW_SPEED, type Binding, type Canvas2D, type Element, type FlowMode } from "@flowcam/domain";
import { applyDashStyle, applyDrawOn, mulberry32, resolveStrokeColor, type Look } from "./shapes";

/** Excaliflow's flowSpeed setting (1.0) times its 0.55 base speed: loops per second. */
const FLOW_SPEED = 1.0 * 0.55;

type Pt = { x: number; y: number };
type Sample = Pt & { tx: number; ty: number };
export interface ArrowGeometry {
  p0: Pt;
  p1: Pt;
  cp: Pt;
  tipAngle: number;
  samples: Sample[];
  cumLen: Float64Array;
  totalLen: number;
}

const isNode = (el: Element) => el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond" || el.type === "text";

function angleToSide(angle: number): Binding["side"] {
  const deg = (angle * 180) / Math.PI;
  if (deg >= -45 && deg <= 45) return "right";
  if (deg > 45 && deg < 135) return "bottom";
  if (deg >= -135 && deg < -45) return "top";
  return "left";
}

function getBindingBoundaryPoint(shape: Element, binding: Pick<Binding, "focusAngle" | "coreCenter" | "gap"> | null, fallbackRefPt: Pt | null, gap = 4): Pt {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;

  let theta = 0;
  if (binding && typeof binding.focusAngle === "number" && !Number.isNaN(binding.focusAngle) && !binding.coreCenter) {
    theta = binding.focusAngle;
  } else if (fallbackRefPt && (Math.abs(fallbackRefPt.x - cx) > 0.01 || Math.abs(fallbackRefPt.y - cy) > 0.01)) {
    theta = Math.atan2(fallbackRefPt.y - cy, fallbackRefPt.x - cx);
  } else if (binding && typeof binding.focusAngle === "number") {
    theta = binding.focusAngle;
  }

  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const g = binding && typeof binding.gap === "number" ? binding.gap : Number(gap) || 0;
  const hw = Math.max(1, shape.width / 2 + g);
  const hh = Math.max(1, shape.height / 2 + g);

  if (shape.type === "ellipse") {
    const t = 1 / (Math.hypot(ux / hw, uy / hh) || 1);
    return { x: cx + t * ux, y: cy + t * uy };
  }
  if (shape.type === "diamond") {
    const t = 1 / (Math.abs(ux) / hw + Math.abs(uy) / hh || 1);
    return { x: cx + t * ux, y: cy + t * uy };
  }
  const tx = Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + t * ux, y: cy + t * uy };
}

/** Flips a binding's angle when the shapes have moved to opposite sides. Upstream mutated the Element; this returns a copy. */
function correctedBinding(binding: Binding | null | undefined, shape: Element | undefined, from: Pt, to: Pt): Binding | null {
  if (!binding || !shape || typeof binding.focusAngle !== "number") return binding ?? null;
  const natAng = Math.atan2(to.y - from.y, to.x - from.x);
  const diff = Math.abs(Math.atan2(Math.sin(natAng - binding.focusAngle), Math.cos(natAng - binding.focusAngle)));
  return diff > Math.PI * 0.55 ? { ...binding, focusAngle: natAng, side: angleToSide(natAng) } : binding;
}

export function pointAtArcLength(geom: Pick<ArrowGeometry, "samples" | "cumLen" | "totalLen">, dist: number): Sample {
  const { samples, cumLen } = geom;
  const N = samples.length - 1;
  if (N <= 0) return { x: 0, y: 0, tx: 1, ty: 0 };
  const clamped = Math.max(0, Math.min(geom.totalLen, dist));
  let lo = 0;
  let hi = N;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumLen[mid] < clamped) lo = mid + 1;
    else hi = mid;
  }
  const idx = Math.max(1, lo);
  const d0 = cumLen[idx - 1];
  const seg = cumLen[idx] - d0;
  const f = seg > 1e-6 ? (clamped - d0) / seg : 0;
  const a = samples[idx - 1];
  const b = samples[idx];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx: a.tx + (b.tx - a.tx) * f, ty: a.ty + (b.ty - a.ty) * f };
}

export function getArrowGeometry(el: Element, elementsMap: ReadonlyMap<string, Element>): ArrowGeometry {
  const startShape = el.startBinding?.elementId ? elementsMap.get(el.startBinding.elementId) : undefined;
  const endShape = el.endBinding?.elementId ? elementsMap.get(el.endBinding.elementId) : undefined;

  const rawP0 = { x: Number(el.x) || 0, y: Number(el.y) || 0 };
  const rawP1 = {
    x: typeof el.x2 === "number" ? el.x2 : rawP0.x + (Number(el.width) || 120),
    y: typeof el.y2 === "number" ? el.y2 : rawP0.y + (Number(el.height) || 0),
  };
  const startCenter = startShape ? { x: startShape.x + startShape.width / 2, y: startShape.y + startShape.height / 2 } : rawP0;
  const endCenter = endShape ? { x: endShape.x + endShape.width / 2, y: endShape.y + endShape.height / 2 } : rawP1;

  const startBinding = correctedBinding(el.startBinding, startShape, startCenter, endCenter);
  const endBinding = correctedBinding(el.endBinding, endShape, endCenter, startCenter);

  const p0 = startShape ? getBindingBoundaryPoint(startShape, startBinding, endShape ? endCenter : rawP1, 4) : rawP0;
  const p1 = endShape ? getBindingBoundaryPoint(endShape, endBinding, startShape ? startCenter : p0, 4) : rawP1;

  const curveOffset = el.curveType === "straight" ? 0 : Number(el.curveOffset) || 0;
  const chordDx = p1.x - p0.x;
  const chordDy = p1.y - p0.y;
  const chordLen = Math.hypot(chordDx, chordDy) || 1;
  const cp = { x: (p0.x + p1.x) / 2 + (-chordDy / chordLen) * curveOffset, y: (p0.y + p1.y) / 2 + (chordDx / chordLen) * curveOffset };

  const N = 40;
  const samples: Sample[] = [];
  const cumLenArr = [0];
  let totalLen = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x;
    const y = mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y;
    const dxdt = 2 * mt * (cp.x - p0.x) + 2 * t * (p1.x - cp.x);
    const dydt = 2 * mt * (cp.y - p0.y) + 2 * t * (p1.y - cp.y);
    const dLen = Math.hypot(dxdt, dydt) || 1;
    if (i > 0) {
      totalLen += Math.hypot(x - samples[i - 1].x, y - samples[i - 1].y);
      cumLenArr.push(totalLen);
    }
    samples.push({ x, y, tx: dxdt / dLen, ty: dydt / dLen });
  }
  const end = samples[samples.length - 1];
  return { p0, p1, cp, tipAngle: Math.atan2(end.ty, end.tx), samples, cumLen: Float64Array.from(cumLenArr), totalLen: Math.max(1, totalLen) };
}

/** Breadth-first hop count from the graph's sources, so Flow waves ripple along the chain. Arrow depth = depth of its start node. */
export function computeArrowDepths(elements: readonly Element[]): Map<string, number> {
  const nodeDepths = new Map<string, number>();
  const arrowDepths = new Map<string, number>();
  const adj = new Map<string, { target: string; arrowId: string }[]>();
  const inDeg = new Map<string, number>();
  const nodes = elements.filter(isNode);
  const arrows = elements.filter((e) => e.type === "arrow");

  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const arr of arrows) {
    const u = arr.startBinding?.elementId;
    const v = arr.endBinding?.elementId;
    if (u && v && adj.has(u) && adj.has(v)) {
      adj.get(u)!.push({ target: v, arrowId: arr.id });
      inDeg.set(v, (inDeg.get(v) || 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const n of nodes) {
    if ((inDeg.get(n.id) || 0) === 0) {
      nodeDepths.set(n.id, 0);
      queue.push(n.id);
    }
  }
  if (queue.length === 0 && nodes.length > 0) {
    nodeDepths.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    const d = nodeDepths.get(u) || 0;
    for (const edge of adj.get(u) || []) {
      arrowDepths.set(edge.arrowId, d);
      if (!nodeDepths.has(edge.target)) {
        nodeDepths.set(edge.target, d + 1);
        queue.push(edge.target);
      }
    }
  }
  for (const arr of arrows) {
    if (!arrowDepths.has(arr.id)) {
      const u = arr.startBinding?.elementId;
      arrowDepths.set(arr.id, u && nodeDepths.has(u) ? nodeDepths.get(u)! : 0);
    }
  }
  return arrowDepths;
}

/** Other Flow modes (Excaliflow's pulses, neon and dashed branches of drawFlowParticleAt). All are pure in their arguments. */
function drawModeParticle(ctx: Canvas2D, geom: ArrowGeometry, dist: number, phase: number, color: string, sw: number, mode: Exclude<FlowMode, "comets">, dark: boolean) {
  const pt = pointAtArcLength(geom, dist);
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  if (mode === "pulse") {
    const ringExpand = (phase * 4) % 1;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = baseAlpha * (1 - ringExpand) * 0.75;
    ctx.lineWidth = 1.8;
    ctx.arc(pt.x, pt.y, 3 + ringExpand * 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(pt.x, pt.y, Math.max(3, sw * 1.3), 0, Math.PI * 2);
    ctx.fill();
  } else if (mode === "neon") {
    const pTail = pointAtArcLength(geom, Math.max(0, dist - Math.min(28, geom.totalLen * 0.18)));
    ctx.beginPath();
    ctx.shadowColor = color;
    ctx.shadowBlur = dark ? 18 : 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = sw * 2.6;
    ctx.globalAlpha = baseAlpha * 0.85;
    ctx.moveTo(pTail.x, pTail.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.4, sw * 0.95);
    ctx.globalAlpha = baseAlpha * 0.95;
    ctx.moveTo(pTail.x, pTail.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  } else {
    const pBack = pointAtArcLength(geom, Math.max(0, dist - 10));
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = sw * 1.9;
    ctx.moveTo(pBack.x, pBack.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** The "comets" Flow mode: a fading tail and a glowing head at `dist` along the arrow. */
function drawFlowParticleAt(ctx: Canvas2D, geom: ArrowGeometry, dist: number, color: string, sw: number) {
  const pt = pointAtArcLength(geom, dist);
  ctx.save();
  const tailLen = Math.min(34, geom.totalLen * 0.22);
  const segs = 7;
  const baseAlpha = ctx.globalAlpha;
  for (let s = 0; s < segs; s++) {
    const d0 = Math.max(0, dist - (s / segs) * tailLen);
    const d1 = Math.max(0, dist - ((s + 1) / segs) * tailLen);
    if (d0 <= d1) continue;
    const pA = pointAtArcLength(geom, d0);
    const pB = pointAtArcLength(geom, d1);
    const frac = 1 - s / segs;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = baseAlpha * frac * 0.82;
    ctx.lineWidth = Math.max(1.2, sw * 2.1 * frac);
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
    ctx.stroke();
  }
  ctx.globalAlpha = baseAlpha;
  ctx.beginPath();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.arc(pt.x, pt.y, Math.max(2.8, sw * 1.35), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws one arrow (shaft with hand-drawn extra passes, arrowhead) and, when `flowing`, its Flow particles at `timeMs`. */
export function drawArrowAndParticles(ctx: Canvas2D, el: Element, geom: ArrowGeometry, depth: number, timeMs: number, flowing: boolean, look: Look, progress = 1) {
  const strokeColor = resolveStrokeColor(el.strokeColor, look);
  const sw = Number(el.strokeWidth) || 2.2;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = el.strokeStyle !== "solid" ? sw + 0.5 : sw;
  applyDashStyle(ctx, el.strokeStyle, sw);
  if (progress < 1) applyDrawOn(ctx, geom.totalLen * 1.15 + 1, progress);

  const roughness = Number(el.roughness ?? 0.85);
  const isCartoon = roughness > 1.2;
  const straight = el.curveType === "straight" || Math.abs(Number(el.curveOffset) || 0) < 0.5;

  const strokeShaftPass = (offsetX: number, offsetY: number, cpBowOffset: number) => {
    ctx.beginPath();
    const dx = geom.p1.x - geom.p0.x;
    const dy = geom.p1.y - geom.p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    if (straight) {
      if (Math.abs(cpBowOffset) < 0.05) {
        ctx.moveTo(geom.p0.x, geom.p0.y);
        ctx.lineTo(geom.p1.x, geom.p1.y);
      } else {
        ctx.moveTo(geom.p0.x + offsetX * 0.3, geom.p0.y + offsetY * 0.3);
        ctx.quadraticCurveTo((geom.p0.x + geom.p1.x) / 2 + nx * cpBowOffset, (geom.p0.y + geom.p1.y) / 2 + ny * cpBowOffset, geom.p1.x, geom.p1.y);
      }
    } else {
      ctx.moveTo(geom.p0.x + offsetX * 0.3, geom.p0.y + offsetY * 0.3);
      ctx.quadraticCurveTo(geom.cp.x + nx * cpBowOffset + offsetX, geom.cp.y + ny * cpBowOffset + offsetY, geom.p1.x, geom.p1.y);
    }
    ctx.stroke();
  };

  strokeShaftPass(0, 0, 0);

  if (roughness > 0.01 && el.strokeStyle === "solid") {
    const rng = mulberry32((Number(el.seed) || 1) + 77);
    const extraPasses = isCartoon ? 2 : 1;
    ctx.save();
    ctx.lineWidth = Math.max(1.2, sw * (isCartoon ? 0.9 : 0.8));
    ctx.globalAlpha *= isCartoon ? 0.88 : 0.72;
    for (let p = 0; p < extraPasses; p++) {
      const sign = p === 0 ? 1 : -1;
      const off = (isCartoon ? 3.2 : 1.4) * sign;
      const bow = (isCartoon ? 6.5 : 2.6) * sign * (0.7 + rng() * 0.5);
      strokeShaftPass(off * (rng() - 0.2), -off * (rng() - 0.2), bow);
    }
    ctx.restore();
  }

  // Excalidraw solid arrowhead cap (~25 degree spread)
  ctx.setLineDash([]);
  const shaftAlpha = ctx.globalAlpha;
  ctx.globalAlpha = shaftAlpha * (progress < 1 ? Math.max(0, (progress - 0.85) / 0.15) : 1);
  const tip = geom.tipAngle;
  const headLen = Math.max(11, sw * 4.6);
  const spread = 0.44;
  ctx.beginPath();
  ctx.moveTo(geom.p1.x - headLen * Math.cos(tip - spread), geom.p1.y - headLen * Math.sin(tip - spread));
  ctx.lineTo(geom.p1.x, geom.p1.y);
  ctx.lineTo(geom.p1.x - headLen * Math.cos(tip + spread), geom.p1.y - headLen * Math.sin(tip + spread));
  ctx.stroke();

  if (isCartoon) {
    ctx.save();
    ctx.lineWidth = Math.max(1.2, sw * 0.85);
    ctx.globalAlpha *= 0.82;
    ctx.beginPath();
    ctx.moveTo(geom.p1.x - (headLen + 2.5) * Math.cos(tip - spread - 0.08), geom.p1.y - (headLen + 2.5) * Math.sin(tip - spread - 0.08));
    ctx.lineTo(geom.p1.x + 1.5, geom.p1.y - 1.5);
    ctx.lineTo(geom.p1.x - (headLen + 2.5) * Math.cos(tip + spread + 0.08), geom.p1.y - (headLen + 2.5) * Math.sin(tip + spread + 0.08));
    ctx.stroke();
    ctx.restore();
  }

  ctx.globalAlpha = shaftAlpha;
  if (flowing && progress >= 1 && geom.totalLen > 24) {
    const packetCount = Math.max(1, Math.min(4, Math.round(geom.totalLen / 150)));
    const hopOffset = -depth * 0.38;
    const speed = Math.min(MAX_FLOW_SPEED, Math.max(MIN_FLOW_SPEED, Number(el.flowSpeed) || 1)) * FLOW_SPEED;
    const mode = el.flowMode ?? "comets";
    for (let k = 0; k < packetCount; k++) {
      let phase = ((timeMs / 1000) * speed + hopOffset + k / packetCount) % 1;
      if (phase < 0) phase += 1;
      if (mode === "comets") drawFlowParticleAt(ctx, geom, phase * geom.totalLen, strokeColor, sw);
      else drawModeParticle(ctx, geom, phase * geom.totalLen, phase, strokeColor, sw, mode, look.dark);
    }
  }
  ctx.restore();
}
