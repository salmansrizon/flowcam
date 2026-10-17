"use client";

import { useEffect, useState } from "react";
import { useLive } from "./LiveBox";
import css from "./FlowDiagram.module.css";

const nodes = [
  { id: "topic", x: 90, y: 10, t: "Your topic", d: "Type a topic you want to explain." },
  { id: "board", x: 90, y: 80, t: "AI drafts the Board", d: "Flowcam drafts a hand-drawn Board for you." },
  { id: "steps", x: 90, y: 150, t: "Steps + script", d: "The Board is split into Steps, each with a script." },
  { id: "present", x: 0, y: 225, t: "Present on camera", d: "Click through the Steps on camera with the Teleprompter." },
  { id: "narrate", x: 180, y: 225, t: "Narrate", d: "Narrate the Steps instead of presenting on camera." },
  { id: "share", x: 90, y: 300, t: "Share link", d: "Send a share link that viewers can open and Remix." },
];
// [path, index of the node it leads into]
const paths: [string, number][] = [
  ["M160 48V80", 1], ["M160 118V150", 2], ["M160 188V206Q160 214 140 214H90Q70 214 70 225", 3],
  ["M160 206Q160 214 180 214H230Q250 214 250 225", 4], ["M70 263Q70 290 110 290H120Q160 290 160 300", 5],
  ["M250 263Q250 290 210 290H200Q160 290 160 300", 5],
];

export function FlowDiagramArt() {
  const { ref, live, reduced } = useLive<HTMLDivElement>();
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!live || reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), 1200);
    return () => clearInterval(id);
  }, [live, reduced]);

  const active = reduced ? -1 : tick % nodes.length;
  const shown = hover ?? (active >= 0 ? active : null);

  return (
    <div ref={ref}>
      <div className="relative mx-auto w-full max-w-sm">
        <svg viewBox="0 0 320 350" className="w-full" aria-hidden>
          {paths.map(([d, to]) => (
            <g key={d}>
              <path d={d} fill="none" stroke="var(--flow)" strokeWidth="2.5" strokeLinecap="round" className="flowing" />
              {live && !reduced && active === to && (
                <circle r="5" fill="var(--marker)" stroke="#fff" strokeWidth="1.5" className={css.comet}>
                  <animateMotion key={tick} dur="0.9s" path={d} fill="freeze" />
                </circle>
              )}
            </g>
          ))}
          {nodes.map((n, i) => (
            <g key={n.id} className={`${css.node} ${shown === i ? css.on : ""}`}>
              <rect x={n.x} y={n.y} width={140} height={38} rx={12} fill={shown === i ? "var(--green-soft)" : "var(--sky-50)"} stroke={shown === i ? "var(--green)" : "var(--line)"} strokeWidth="1.5" />
              <circle cx={n.x + 16} cy={n.y + 19} r={5} fill={shown === i ? "var(--green)" : "var(--flow)"} />
              <text x={n.x + 28} y={n.y + 23} fontSize="10.5" fontWeight="700" fill="var(--ink)">{n.t}</text>
            </g>
          ))}
        </svg>
        {nodes.map((n, i) => (
          <button
            key={n.id}
            type="button"
            aria-label={`${n.t}: ${n.d}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="absolute rounded-xl"
            style={{ left: `${(n.x / 320) * 100}%`, top: `${(n.y / 350) * 100}%`, width: `${(140 / 320) * 100}%`, height: `${(38 / 350) * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-3 min-h-10 text-center text-sm font-semibold text-ink-soft" aria-hidden>
        {shown !== null ? nodes[shown].d : "Hover a step to see what it does."}
      </p>
    </div>
  );
}
