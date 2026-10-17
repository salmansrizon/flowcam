import type { ReactNode } from "react";

const s = { viewBox: "0 0 120 70", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "h-16 w-full text-ink" } as const;

const steps: { title: string; body: string; art: ReactNode }[] = [
  {
    title: "Build your Board",
    body: "Draw a hand-drawn diagram, or type a topic and let AI generate a Presentation with a Board, Steps and a script.",
    art: <svg {...s}><rect x="12" y="14" width="34" height="20" rx="6" /><rect x="74" y="38" width="34" height="20" rx="6" /><path d="M46 24h14a8 8 0 0 1 8 8v6" className="text-flow" stroke="var(--flow)" /></svg>,
  },
  {
    title: "Present step by step",
    body: "Click to reveal each Step on camera while the Teleprompter scrolls under the lens. Pause to start a new clip and retake only that one.",
    art: <svg {...s}><rect x="10" y="10" width="70" height="50" rx="8" /><circle cx="96" cy="24" r="12" /><path d="M20 28h30M20 40h20" /></svg>,
  },
  {
    title: "Share or export",
    body: "Send a share link that viewers can open and Remix, or export an MP4 up to 4K.",
    art: <svg {...s}><rect x="14" y="12" width="52" height="38" rx="6" /><path d="m36 24 12 7-12 7z" /><path d="M84 40h24m0 0-8-8m8 8-8 8" stroke="var(--flow)" /></svg>,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="page-gutter py-16 sm:py-24">
      <div className="container-page">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">Draw it, present it, share it</h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((st, i) => (
            <li key={st.title} className="tile tile-hover p-6">
              <span className="grid size-9 place-items-center rounded-full bg-green text-sm font-bold text-white">{i + 1}</span>
              <div className="mt-5 rounded-2xl bg-sky-50 p-3">{st.art}</div>
              <h3 className="mt-5 text-xl font-bold text-ink">{st.title}</h3>
              <p className="mt-2 text-ink-soft">{st.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
