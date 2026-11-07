import Link from "next/link";
import type { ReactNode } from "react";
import { features } from "@/lib/features";
import { STUDIO_URL } from "@/lib/site";
import { ProductShot } from "./ProductShot";

const rows: { slug: string; mock: ReactNode; cta?: boolean }[] = [
  { slug: "step-by-step-presentations", mock: <ProductShot src="/product/editor.jpg" alt="The Flowcam editor: a hand-drawn diagram with its Steps listed beside it" />, cta: true },
  { slug: "teleprompter", mock: <ProductShot src="/product/presenter.jpg" alt="The Presenter View while recording: the Board, the timer, the Teleprompter and a preview of the next Step" /> },
  { slug: "fix-after-recording", mock: <ProductShot src="/product/timeline.jpg" alt="The Timeline after recording: clips, Steps, captions and layout rows under the preview" /> },
  { slug: "share-and-remix", mock: <ProductShot src="/product/export.jpg" width={1152} height={440} alt="The Export dialog: export an MP4, or make a share link with an optional password (Pro)" />, cta: true },
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
                  {cta && <a href={STUDIO_URL} className="btn-green">Try Flowcam free</a>}
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
