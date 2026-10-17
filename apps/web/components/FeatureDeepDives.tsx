import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { features } from "@/lib/features";
import { LiveBox } from "./LiveBox";
import m from "./DeepDives.module.css";

const hand = "hand text-ink-soft";
const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;
const Chip = ({ children, cls = "" }: { children: ReactNode; cls?: string }) => (
  <span className={`absolute rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-md ${cls}`}>{children}</span>
);

function StepsMock() {
  const rows = ["Title appears", "Client box draws on", "Arrow flows to server", "Focus on database"];
  return (
    <LiveBox className={`relative ${m.box}`}>
      <div className="tile tile-hover grid grid-cols-[1fr_9rem] gap-3 p-4">
        <div className="rounded-2xl bg-sky-50 p-3" aria-hidden>
          <svg viewBox="0 0 200 110" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" className="w-full">
            <rect x="8" y="36" width="56" height="34" rx="8" />
            <rect x="136" y="36" width="56" height="34" rx="8" className={m.revealBox} />
            <path d="M64 53h66" stroke="var(--flow)" className="flowing" />
          </svg>
        </div>
        <ol className="space-y-1.5 text-xs">
          {rows.map((r, i) => (
            <li key={r} style={delay(i * 2)} className={`rounded-lg bg-sky-50 px-2 py-1.5 font-semibold text-ink-soft ${m.stepRow}`}>{i + 1}. {r}</li>
          ))}
        </ol>
      </div>
      <Chip cls="-bottom-3 left-4">Click: next Step</Chip>
    </LiveBox>
  );
}

function PrompterMock() {
  return (
    <LiveBox className={`relative ${m.box}`}>
      <div className="tile tile-hover p-4">
        <div className="relative rounded-2xl bg-sky-50 p-3" aria-hidden>
          <svg viewBox="0 0 220 100" fill="none" stroke="var(--ink)" strokeWidth="2.5" className="w-full">
            <rect x="10" y="20" width="60" height="32" rx="8" />
            <path d="M70 36h50" stroke="var(--flow)" className="flowing" />
          </svg>
          <span className={`absolute right-4 top-4 grid size-14 place-items-center rounded-full border-4 border-white bg-sky-300 shadow-md ${m.pulse}`}>
            <svg viewBox="0 0 24 24" className="size-7 text-ink" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="9" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>
          </span>
        </div>
        {/* Script repeated twice so the upward scroll loops seamlessly */}
        <div className="mt-3 h-[4.75rem] overflow-hidden rounded-xl bg-ink px-4 text-sm text-white/90" aria-hidden>
          <div className={m.scroll}>
            {[0, 1].map((k) => (
              <div key={k} className="space-y-1 py-1.5">
                <p className="opacity-50">Requests land on the load balancer,</p>
                <p className="font-bold text-white">which picks a healthy server and</p>
                <p className="opacity-50">forwards the request.</p>
                <p className="opacity-50">The server reads from the cache first.</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Chip cls="-top-3 right-4">Not in the video</Chip>
    </LiveBox>
  );
}

function FixMock() {
  return (
    <LiveBox className={`relative ${m.box}`}>
      <div className="tile tile-hover grid gap-3 p-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-sky-50 p-3 text-center">
          <p className="eyebrow !text-muted">Before</p>
          <div className="mx-auto mt-2 rounded-xl border-2 border-ink bg-white px-3 py-4">
            <span className={`${hand} text-lg text-muted line-through decoration-2 ${m.strike}`}>Recieve</span>
          </div>
        </div>
        <div className="rounded-2xl bg-sky-50 p-3 text-center">
          <p className="eyebrow !text-muted">After</p>
          <div className="mx-auto mt-2 rounded-xl border-2 border-ink bg-white px-3 py-4">
            <span className={`${hand} inline-block overflow-hidden whitespace-nowrap align-bottom text-lg text-ink ${m.typed}`} style={{ width: "7ch" }}>Receive</span>
          </div>
        </div>
      </div>
      <Chip cls={`-bottom-3 right-4 !bg-green !text-white !border-green ${m.pop}`}>Re-export ✓</Chip>
    </LiveBox>
  );
}

function ShareMock() {
  return (
    <LiveBox className={`relative ${m.box}`}>
      <div className="tile tile-hover p-4">
        <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-sky-100" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-10 text-ink" fill="currentColor"><path d="m9 6 10 6-10 6z" /></svg>
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-sky-200">
            <span className={`block h-full origin-left bg-green ${m.progress}`} />
          </span>
        </div>
        <ul className="mt-3 space-y-1 text-xs font-semibold text-ink-soft">
          {["0:00 The problem", "0:42 The Board", "1:30 Walkthrough"].map((c, i) => (
            <li key={c} style={delay(i * 3)} className={`rounded-lg bg-sky-50 px-2 py-1 ${m.chapter}`}>{c}</li>
          ))}
        </ul>
      </div>
      <Chip cls={`-top-3 right-4 !bg-green !text-white !border-green ${m.nudge}`}>Remix</Chip>
    </LiveBox>
  );
}

const rows: { slug: string; mock: ReactNode; cta?: boolean }[] = [
  { slug: "step-by-step-presentations", mock: <StepsMock />, cta: true },
  { slug: "teleprompter", mock: <PrompterMock /> },
  { slug: "fix-after-recording", mock: <FixMock /> },
  { slug: "share-and-remix", mock: <ShareMock />, cta: true },
];

export function FeatureDeepDives() {
  return (
    <section id="features" className="page-gutter py-16 sm:py-24">
      <div className="container-page space-y-20 sm:space-y-28">
        {rows.map(({ slug, mock, cta }, i) => {
          const f = features.find((x) => x.slug === slug);
          if (!f) return null;
          return (
            <div key={slug} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
              <div className={i % 2 ? "md:order-2" : ""}>
                <p className="eyebrow">{f.title}</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{f.headline}</h2>
                <p className="mt-4 text-ink-soft">{f.summary}</p>
                <ul className="mt-5 space-y-2 text-ink-soft">
                  {f.points.slice(0, 3).map((p) => (
                    <li key={p.title} className="flex gap-2"><span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-green" /><span><b className="text-ink">{p.title}.</b> {p.body}</span></li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  {cta && <a href="#waitlist" className="btn-green">Join the waitlist</a>}
                  <Link href={`/features/${slug}`} className="font-bold text-green underline-offset-4 hover:underline">More about {f.title} →</Link>
                </div>
              </div>
              <div className="px-2 pb-4">{mock}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
