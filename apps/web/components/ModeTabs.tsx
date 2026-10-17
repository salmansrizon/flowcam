"use client";

import { useId, useRef, useState } from "react";

const MODES = [
  { name: "Present", note: "", text: "Go live on camera. Each click draws the next part of your board." },
  { name: "Narrate", note: "soon after launch", text: "Step through the board with your voice or an AI voice. No camera needed." },
  { name: "Screen", note: "polish in desktop apps", text: "Record your screen now. Polish it later in the Mac and Windows apps." },
];

export function ModeTabs() {
  const [i, setI] = useState(0);
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: React.KeyboardEvent) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const next = e.key === "Home" ? 0 : e.key === "End" ? MODES.length - 1 : (i + d + MODES.length) % MODES.length;
    if (!d && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    setI(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div role="tablist" aria-label="Ways to make a video" onKeyDown={onKey} className="inline-flex max-w-full flex-wrap justify-center gap-1 rounded-full border border-line bg-tile p-1">
        {MODES.map((m, n) => (
          <button
            key={m.name}
            ref={(el) => { refs.current[n] = el; }}
            role="tab"
            id={`${id}-t${n}`}
            aria-selected={i === n}
            aria-controls={`${id}-p`}
            tabIndex={i === n ? 0 : -1}
            onClick={() => setI(n)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${i === n ? "bg-ink text-white" : "text-ink-soft hover:bg-sky-100"}`}
          >
            {m.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t${i}`} className="min-h-14 max-w-md text-center text-ink-soft">
        <p>{MODES[i].text}</p>
        {MODES[i].note && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{MODES[i].note}</p>}
      </div>
    </div>
  );
}
