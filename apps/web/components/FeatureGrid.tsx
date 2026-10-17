import Link from "next/link";
import { features, type Release } from "@/lib/features";

const badge: Record<Release, string> = {
  "At launch": "bg-green-soft text-green",
  "Soon after launch": "bg-sky-100 text-flow",
  "Desktop apps": "bg-tile text-muted border border-line",
};

export function FeatureGrid() {
  return (
    <section id="all-features" className="page-gutter py-16 sm:py-24 scroll-mt-20">
      <div className="container-page">
        <p className="eyebrow">Features</p>
        <h2 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">Everything in Flowcam</h2>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <li key={f.slug}>
              <Link href={`/features/${f.slug}`} className="tile tile-hover flex h-full flex-col gap-3 p-6">
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${badge[f.release]}`}>{f.release}</span>
                <h3 className="text-xl font-bold text-ink">{f.title}</h3>
                <p className="text-ink-soft">{f.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
