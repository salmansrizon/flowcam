import type { CSSProperties } from "react";

const d = (s: string) => ({ "--delay": s }) as CSSProperties;
const stroke = { fill: "none", stroke: "#0e1b2b", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const boxes = [
  { x: 40, label: "Browser", delay: "0.4s" },
  { x: 250, label: "DNS", delay: "1.4s" },
  { x: 460, label: "Server", delay: "2.4s" },
];

export function HeroBoard() {
  return (
    <div className="mt-6 grid w-full gap-4 sm:grid-cols-2 lg:block lg:relative lg:px-0 lg:py-10">
      <div className="tile order-first p-3 sm:col-span-2 sm:p-5 lg:mx-auto lg:max-w-3xl">
        <div className="hand mb-3 truncate rounded-xl bg-ink px-4 py-2 text-left text-sm text-white sm:text-base">
          …and the request reaches the DNS resolver
        </div>
        <div className="relative">
          <svg viewBox="0 0 640 300" role="img" aria-label="A diagram where a browser sends a request to DNS, which points to a server" className="hand w-full">
            {boxes.map((b) => (
              <g key={b.label}>
                <path className="draw" pathLength={1} style={d(b.delay)} {...stroke} d={`M${b.x + 2} 62 Q${b.x + 50} 56 ${b.x + 138} 60 Q${b.x + 143} 100 ${b.x + 139} 140 Q${b.x + 70} 144 ${b.x + 1} 138 Q${b.x - 3} 100 ${b.x + 2} 62Z`} />
                <text x={b.x + 70} y={110} textAnchor="middle" fontSize="26" fill="#0e1b2b" className="rise" style={d(`${parseFloat(b.delay) + 0.5}s`)}>{b.label}</text>
              </g>
            ))}
            <path className="draw" pathLength={1} style={d("1.0s")} {...stroke} d="M184 100 Q205 94 240 101 M228 90 L242 101 L227 112" />
            <g className="rise" style={d("2.0s")}>
              <path className="flowing" fill="none" stroke="#1aa7b8" strokeWidth={4} strokeLinecap="round" d="M394 100 Q420 94 450 101" />
              <path fill="none" stroke="#1aa7b8" strokeWidth={4} strokeLinecap="round" d="M438 90 L452 101 L437 112" />
            </g>
            <path className="draw" pathLength={1} style={d("3.2s")} fill="none" stroke="#f2a541" strokeWidth={4} strokeLinecap="round" d="M250 156 Q320 170 388 154" />
            <text x="320" y="196" textAnchor="middle" fontSize="20" fill="#3d4f63" className="rise" style={d("3.6s")}>lookup</text>
          </svg>
          <span className="absolute left-1 top-1 rounded-full bg-green-soft px-3 py-1 text-xs font-bold text-green">Step 3 of 5</span>
          <svg viewBox="0 0 80 80" aria-hidden className="absolute bottom-0 right-0 size-20 rounded-full border-4 border-white bg-sky-200 shadow-lg sm:size-24">
            <circle cx="40" cy="32" r="14" fill="#0e1b2b" opacity=".75" />
            <path d="M12 80 Q14 52 40 52 Q66 52 68 80Z" fill="#0e1b2b" opacity=".75" />
          </svg>
        </div>
      </div>

      <Float cls="lg:left-0 lg:top-4 lg:w-52">
        <p className="font-bold text-ink">Steps</p>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          {["Browser", "DNS", "Server"].map((s) => (
            <li key={s}><span aria-hidden className="mr-2 text-green">✓</span>{s}</li>
          ))}
        </ul>
      </Float>
      <Float cls="lg:right-0 lg:top-2 lg:w-56">
        <p className="font-bold text-ink">Teleprompter</p>
        <p className="mt-1 text-sm text-ink-soft">Under your webcam. Only you see it.</p>
      </Float>
      <Float cls="lg:bottom-6 lg:left-4 lg:w-52">
        <p className="text-2xl font-extrabold text-ink">$17<span className="text-sm font-semibold text-muted">/mo</span></p>
        <p className="text-sm text-ink-soft">Founding price, locked for life</p>
      </Float>
      <Float cls="lg:bottom-4 lg:right-4 lg:w-52">
        <p className="font-bold text-ink">Share link</p>
        <p className="mt-1 text-sm text-ink-soft">Anyone can watch, or remix the board.</p>
      </Float>
    </div>
  );
}

function Float({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <div className={`tile p-4 lg:absolute ${cls}`}>{children}</div>;
}
