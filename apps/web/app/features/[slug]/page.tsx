import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WaitlistForm } from "@/components/WaitlistForm";
import { features, featureBySlug } from "@/lib/features";

export const dynamicParams = false;

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: PageProps<"/features/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const f = featureBySlug(slug);
  if (!f) return {};
  return {
    title: f.title,
    description: f.summary,
    alternates: { canonical: `/features/${f.slug}` },
    openGraph: { title: f.title, description: f.summary, url: `/features/${f.slug}` },
  };
}

function Illustration() {
  return (
    <svg viewBox="0 0 320 120" className="w-full max-w-sm text-ink" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect className="draw" pathLength={1} x="8" y="30" width="80" height="60" rx="10" />
      <rect className="draw" pathLength={1} style={{ "--delay": "0.4s" } as React.CSSProperties} x="232" y="30" width="80" height="60" rx="10" />
      <path className="flowing text-green" d="M92 60 C130 20, 190 100, 228 60" />
      <path d="M218 52 L229 60 L217 68" />
    </svg>
  );
}

export default async function FeaturePage({ params }: PageProps<"/features/[slug]">) {
  const { slug } = await params;
  const f = featureBySlug(slug);
  if (!f) notFound();
  const i = features.indexOf(f);
  const more = [1, 2, 3].map((n) => features[(i + n) % features.length]);

  return (
    <div className="sky-wash min-h-screen">
      <Nav />
      <main className="page-gutter">
        <div className="container-page py-10">
          <Link href="/#all-features" className="text-sm text-ink-soft underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
            ← All features
          </Link>
          <section className="mt-6 grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <span className="pill">{f.release}</span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink md:text-5xl">{f.headline}</h1>
              <p className="mt-4 text-lg text-ink-soft">{f.summary}</p>
              <p className="mt-3 text-sm text-muted">Best for: {f.bestFor}</p>
              <div className="mt-6">
                <WaitlistForm source={f.slug} />
                <p className="mt-3 text-sm text-muted">Launching soon. Founding price $17/mo, locked for life.</p>
              </div>
            </div>
            <div className="tile flex items-center justify-center p-6">
              <Illustration />
            </div>
          </section>

          <section className="mt-16">
            <h2 className="text-2xl font-bold text-ink">What you can do</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {f.points.map((p) => (
                <li key={p.title} className="tile p-6">
                  <h3 className="font-semibold text-ink">{p.title}</h3>
                  <p className="mt-2 text-ink-soft">{p.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-16 pb-12">
            <h2 className="text-2xl font-bold text-ink">More features</h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {more.map((m) => (
                <li key={m.slug}>
                  <Link href={`/features/${m.slug}`} className="tile block h-full p-6 hover:border-green focus-visible:outline-2 focus-visible:outline-offset-2">
                    <span className="font-semibold text-ink">{m.title}</span>
                    <span className="mt-2 block text-ink-soft">{m.headline}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
