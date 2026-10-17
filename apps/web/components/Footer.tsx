import Link from "next/link";
import { features } from "@/lib/features";
import { Logo } from "./Nav";

const col = "grid content-start gap-2";
const a = "text-ink-soft hover:text-ink";

export function Footer() {
  return (
    <footer className="page-gutter border-t border-line bg-white/60 py-12">
      <div className="container-page grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" aria-label="Flowcam home"><Logo /></Link>
          <p className="mt-3 max-w-xs text-ink-soft">Draw it, present it, share it as a video.</p>
        </div>
        <nav aria-label="Features" className={col}>
          <h2 className="font-bold text-ink">Features</h2>
          {features.slice(0, 5).map((f) => (
            <Link key={f.slug} href={`/features/${f.slug}`} className={a}>{f.title}</Link>
          ))}
          <Link href="/#all-features" className={a}>All features</Link>
        </nav>
        <nav aria-label="Product" className={col}>
          <h2 className="font-bold text-ink">Product</h2>
          <Link href="/#pricing" className={a}>Pricing</Link>
          <Link href="/#faq" className={a}>FAQ</Link>
          <Link href="/#waitlist" className={a}>Join the waitlist</Link>
        </nav>
        <nav aria-label="Project" className={col}>
          <h2 className="font-bold text-ink">Project</h2>
          <a href="https://github.com/salmansrizon/flowcam" className={a}>GitHub</a>
        </nav>
      </div>
      <p className="container-page mt-10 text-sm text-muted">© 2026 Flowcam. Launching soon.</p>
    </footer>
  );
}
