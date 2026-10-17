import Link from "next/link";
import { PricingToggle } from "./PricingToggle";

const free = [
  "Works on your device, no account needed to record",
  "Full editor, Steps, Teleprompter, camera layouts, retakes",
  "Export MP4 up to 1080p with a small \"Made with Flowcam\" watermark",
  "Captions generated on your device",
  "50 AI Credits once when you sign up",
];
const pro = [
  "Share links with Remix, chapters, password and view notifications",
  "Sync across devices and resume editing on the web",
  "4K export without watermark",
  "Screen polish in the desktop apps (auto-zoom, cursor smoothing, keystroke overlay)",
  "1,000 AI Credits every month for Presentations, scripts, images, AI voice and video",
  "100 GB cloud storage",
];

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 grid gap-3">
      {items.map((i) => (
        <li key={i} className="flex gap-3 text-ink-soft">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-green" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
          {i}
        </li>
      ))}
    </ul>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="page-gutter py-16 sm:py-24">
      <div className="container-page">
        <p className="eyebrow">Pricing</p>
        <h2 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">Start free. Upgrade when you share.</h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="tile flex flex-col p-6 sm:p-8">
            <h3 className="text-2xl font-bold text-ink">Free</h3>
            <p className="mt-4 text-5xl font-extrabold text-ink">$0</p>
            <List items={free} />
            <Link href="#waitlist" className="btn-ghost mt-8 justify-center">Join the waitlist</Link>
          </div>
          <div className="tile relative flex flex-col border-2 !border-green p-6 sm:p-8">
            <span className="absolute -top-3 right-6 rounded-full bg-green px-3 py-1 text-xs font-bold text-white">Founding price</span>
            <h3 className="text-2xl font-bold text-ink">Pro</h3>
            <div className="mt-4"><PricingToggle /></div>
            <List items={pro} />
            <Link href="#waitlist" className="btn-green mt-8">Join the waitlist</Link>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Prices exclude tax. Extra Credits: 1,000 for $10, never expire. 7-day Pro trial at launch.
        </p>
      </div>
    </section>
  );
}
