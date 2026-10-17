import Link from "next/link";
import { MobileMenu } from "./MobileMenu";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-xl font-extrabold tracking-tight text-ink">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 4c6.7-.3 12 4.8 11.8 11.7C27.6 22.6 22.7 28 16 27.8 9.2 27.6 4.2 22.5 4.3 15.8 4.4 9.3 9.5 4.2 16 4z" />
        <circle cx="14" cy="16" r="3.2" className="text-green" />
        <path d="M19 21c3 .5 5-1.2 6-3.5m0 0l-3.2.2m3.2-.2l-.8 3" className="text-flow" />
      </svg>
      Flowcam
    </span>
  );
}

export function Nav() {
  return (
    <header className="sticky z-50 border-b border-line bg-white/80 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <nav aria-label="Main" className="page-gutter relative">
        <div className="container-page flex items-center justify-between gap-3 py-3">
          <Link href="/" aria-label="Flowcam home"><Logo /></Link>
          <ul className="hidden items-center gap-6 md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="font-semibold text-ink-soft hover:text-ink">{l.label}</Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Link href="/#waitlist" className="btn-green !px-4 !py-2 text-sm sm:text-base">Join the waitlist</Link>
            <MobileMenu links={links} />
          </div>
        </div>
      </nav>
    </header>
  );
}
