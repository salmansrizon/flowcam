import type { ReactNode } from "react";
import m from "./DeepDives.module.css";

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "size-5" } as const;

const icons = {
  board: <svg {...svg}><rect x="4" y="5" width="7" height="5" rx="1.5" /><rect x="13" y="14" width="7" height="5" rx="1.5" /><path d="M11 7.5h3a2 2 0 0 1 2 2V14" /></svg>,
  camera: <svg {...svg}><rect x="3" y="7" width="13" height="10" rx="2.5" /><path d="m16 11 5-3v8l-5-3" /></svg>,
  steps: <svg {...svg}><path d="M4 7h4M4 12h8M4 17h12" /><circle cx="18" cy="7" r="1.5" /></svg>,
  script: <svg {...svg}><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>,
  shapes: <svg {...svg}><circle cx="8" cy="8" r="4" /><rect x="11" y="11" width="9" height="9" rx="2" /></svg>,
  export: <svg {...svg}><path d="M12 15V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>,
};

const cols: { a: ReactNode; b: ReactNode; label: string; text: string }[] = [
  { a: icons.board, b: icons.camera, label: "Board and camera", text: "Draw your idea and present it on camera in one place." },
  { a: icons.steps, b: icons.script, label: "Steps and Teleprompter", text: "Click through Steps while your script scrolls under the lens." },
  { a: icons.shapes, b: icons.export, label: "Shapes and re-export", text: "Fix a label after recording and export again." },
];

const Badge = ({ children }: { children: ReactNode }) => (
  <span className="grid size-11 place-items-center rounded-full border border-line bg-white text-ink shadow-sm">{children}</span>
);

export function BigWord() {
  return (
    <section className="page-gutter py-16 sm:py-24">
      <div className="container-page">
        <h2 className="flex items-center justify-center gap-4 text-center">
          <span className="relative text-6xl font-extrabold tracking-tight text-ink sm:text-8xl lg:text-9xl">
            Clearer
            <svg viewBox="0 0 300 20" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full sm:h-4" aria-hidden>
              <path d="M4 13 C 70 4, 150 18, 296 7" pathLength={1} fill="none" stroke="var(--marker)" strokeWidth="6" strokeLinecap="round" className={m.underline} />
            </svg>
          </span>
          <span className="flex flex-col text-left text-lg font-bold leading-tight text-ink-soft sm:text-2xl">
            <span>explanations,</span>
            <span>fewer takes.</span>
          </span>
        </h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
          {cols.map((c) => (
            <div key={c.label} className="flex flex-col items-center gap-4 px-6 text-center">
              <div className="flex items-center gap-2" role="img" aria-label={c.label}>
                <Badge>{c.a}</Badge>
                <span aria-hidden className="font-bold text-muted">+</span>
                <Badge>{c.b}</Badge>
              </div>
              <p className="max-w-xs text-base text-ink-soft">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
