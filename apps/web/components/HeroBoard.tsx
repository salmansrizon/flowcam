"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import s from "./HeroBoard.module.css";

const STEPS = [
  { name: "Browser box", script: "Start with the browser. It wants example.com." },
  { name: "Arrow", script: "Your browser asks: where is example.com?" },
  { name: "DNS box", script: "…and the request reaches the DNS resolver." },
  { name: "Flow on", script: "The answer travels back, then on to the server." },
  { name: "Server box", script: "That is the whole path. Request in, page out." },
];
const N = STEPS.length;
const ink = "#0e1b2b";
const rm = "(prefers-reduced-motion: reduce)";

const subReduced = (cb: () => void) => {
  const m = window.matchMedia(rm);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const boxPath = (x: number) =>
  `M${x + 2} 62 Q${x + 50} 56 ${x + 138} 60 Q${x + 143} 100 ${x + 139} 140 Q${x + 70} 144 ${x + 1} 138 Q${x - 3} 100 ${x + 2} 62Z`;

export function HeroBoard() {
  const reduced = useSyncExternalStore(subReduced, () => window.matchMedia(rm).matches, () => false);
  const [step, setStep] = useState(1);
  const [touched, setTouched] = useState(false);
  const [held, setHeld] = useState(false);
  const [inView, setInView] = useState(true);
  const [hidden, setHidden] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Reduced motion: show the finished diagram until the user steps manually.
  const shown = reduced && !touched ? N : step;
  const on = (n: number) => shown >= n;
  const go = useCallback((n: number) => { setTouched(true); setStep(n); }, []);
  const next = () => go(shown >= N ? 1 : shown + 1);

  // Auto-play: one step every ~2.2s, longer pause on the last, then loop.
  useEffect(() => {
    if (reduced || held || !inView || hidden) return;
    const t = setTimeout(() => setStep((v) => (v >= N ? 1 : v + 1)), step >= N ? 3600 : 2200);
    return () => clearTimeout(t);
  }, [step, reduced, held, inView, hidden]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    const vis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, []);

  // Mouse parallax, rAF-throttled, via CSS vars on the container.
  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", String(((e.clientX - r.left) / r.width - 0.5) * 2));
        el.style.setProperty("--my", String(((e.clientY - r.top) / r.height - 0.5) * 2));
      });
    };
    el.addEventListener("pointermove", move);
    return () => { el.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, [reduced]);

  const line = (n: number, extra?: CSSProperties): CSSProperties => ({
    strokeDasharray: 1,
    strokeDashoffset: on(n) ? 0 : 1,
    transition: "stroke-dashoffset .8s ease-out",
    ...extra,
  });
  const fade = (n: number): CSSProperties => ({ opacity: on(n) ? 1 : 0, transition: "opacity .5s ease-out .4s" });
  const stroke = { fill: "none", stroke: ink, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const moved = shown >= 4;

  return (
    <div
      ref={root}
      className={`${s.root} ${s.parallax} mt-6 grid w-full gap-4 sm:grid-cols-2 lg:relative lg:block lg:px-0 lg:py-10`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className={`tile order-first p-3 sm:col-span-2 sm:p-5 lg:mx-auto lg:max-w-3xl`}>
        <div aria-hidden className="hand mb-3 flex items-center gap-3 rounded-xl bg-ink px-4 py-2 text-left text-sm text-white sm:text-base">
          <span key={shown} className={`${s.fade} min-w-0 flex-1 truncate`}>{STEPS[shown - 1].script}</span>
          <span className={`${s.rec} shrink-0 text-xs font-bold tracking-wider text-red-400`}>REC ●</span>
        </div>
        <p className="sr-only" aria-live="polite">Step {shown} of {N}: {STEPS[shown - 1].script}</p>

        <div className="relative cursor-pointer" onClick={next}>
          <svg viewBox="0 0 640 300" role="img" aria-label="A diagram where a browser sends a request to DNS, which points to a server" className="hand block aspect-[640/300] w-full">
            {[{ x: 40, l: "Browser", n: 1 }, { x: 250, l: "DNS", n: 3 }, { x: 460, l: "Server", n: 5 }].map((b) => (
              <g key={b.l}>
                <path pathLength={1} style={line(b.n)} {...stroke} d={boxPath(b.x)} />
                <text x={b.x + 70} y={110} textAnchor="middle" fontSize="26" fill={ink} style={fade(b.n)}>{b.l}</text>
              </g>
            ))}
            <path pathLength={1} style={line(2)} {...stroke} d="M184 100 Q205 94 240 101 M228 90 L242 101 L227 112" />
            <path pathLength={1} style={line(4)} fill="none" stroke="#1aa7b8" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" d="M394 100 Q420 94 450 101 M438 90 L452 101 L437 112" />
            {on(4) && !reduced && [0, 0.5, 1].map((o) => (
              <circle key={o} r="4.5" fill="#1aa7b8">
                <animateMotion dur="1.5s" begin={`${o * 0.5}s`} repeatCount="indefinite" path="M394 100 Q420 94 450 101" />
              </circle>
            ))}
            {on(4) && reduced && <circle cx="422" cy="97" r="4.5" fill="#1aa7b8" />}
            <path pathLength={1} style={line(3)} fill="none" stroke="#f2a541" strokeWidth={4} strokeLinecap="round" d="M250 156 Q320 170 388 154" />
            <text x="320" y="196" textAnchor="middle" fontSize="20" fill="#3d4f63" style={fade(3)}>lookup</text>
            <path pathLength={1} style={line(5, { transitionDuration: "1.2s" })} fill="none" stroke="#f2a541" strokeWidth={4} strokeLinecap="round" d="M30 44 Q300 18 612 40 Q640 100 606 160 Q320 182 24 158 Q4 100 30 44Z" />
          </svg>
          <span className="absolute left-1 top-1 rounded-full bg-green-soft px-3 py-1 text-xs font-bold text-green">Step {shown} of {N}</span>

          <div
            className={`${s.glide} absolute bottom-0 size-20 sm:size-24`}
            style={{ left: moved ? 0 : "calc(100% - var(--bs, 5rem))", ["--bs" as string]: "5rem" }}
          >
            <svg viewBox="0 0 80 80" aria-hidden className={`${s.bob} size-full rounded-full border-4 border-white bg-sky-200 shadow-lg`}>
              <circle cx="40" cy="32" r="14" fill={ink} opacity=".75" />
              <path d="M12 80 Q14 52 40 52 Q66 52 68 80Z" fill={ink} opacity=".75" />
            </svg>
            {shown === 4 && (
              <span className={`${s.pop} hand absolute bottom-full left-full -mb-1 whitespace-nowrap text-xs text-ink-soft sm:text-sm`}>moves out of the way ↗</span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={`h-2 rounded-full transition-all ${i + 1 === shown ? "w-6 bg-green" : i + 1 < shown ? "w-2 bg-green/50" : "w-2 bg-line"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => go(1)} aria-label="Replay" className="btn-ghost !px-4 !py-1.5 text-sm">↺ <span className="sr-only sm:not-sr-only">Replay</span></button>
            <button type="button" onClick={next} aria-label="Next step" className="btn-green !px-4 !py-1.5 text-sm">Next step →</button>
          </div>
        </div>
      </div>

      <Float cls="lg:left-0 lg:top-4 lg:w-52" k={10} dur="6.5s">
        <p className="font-bold text-ink">Steps</p>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          {STEPS.map((t, i) => (
            <li key={t.name} className={i + 1 === shown ? "font-bold text-ink" : ""}>
              <span aria-hidden className={`mr-2 ${on(i + 1) ? "text-green" : "text-line"}`}>{on(i + 1) ? "✓" : "○"}</span>{t.name}
            </li>
          ))}
        </ul>
      </Float>
      <Float cls="lg:right-0 lg:top-2 lg:w-56" k={7} dur="5.4s">
        <p className="font-bold text-ink">Teleprompter</p>
        <p className="mt-1 text-sm text-ink-soft">Under your webcam. Only you see it.</p>
      </Float>
      <Float cls="lg:bottom-6 lg:left-4 lg:w-52" k={-9} dur="7.2s">
        <p className="text-2xl font-extrabold text-ink">$17<span className="text-sm font-semibold text-muted">/mo</span></p>
        <p className="text-sm text-ink-soft">Founding price, locked for life</p>
      </Float>
      <Float cls="lg:bottom-4 lg:right-4 lg:w-52" k={-6} dur="6s">
        <p className="font-bold text-ink">Share link</p>
        <p className="mt-1 text-sm text-ink-soft">Anyone can watch, or remix the board.</p>
      </Float>
    </div>
  );
}

function Float({ cls, k, dur, children }: { cls: string; k: number; dur: string; children: React.ReactNode }) {
  return (
    <div className={`tile ${s.tile} ${s.float} p-4 lg:absolute ${cls}`} style={{ ["--k" as string]: k, animationDuration: dur }}>
      {children}
    </div>
  );
}
