import Link from "next/link";
import { STUDIO_URL } from "@/lib/site";
import { ModeTabs } from "./ModeTabs";
import { HeroVideo } from "./HeroVideo";

export function Hero() {
  return (
    <section id="top" className="page-gutter pt-12 pb-16 sm:pt-20">
      <div className="container-page flex flex-col items-center text-center gap-6">
        <p className="pill rise">
          <span aria-hidden className="size-2 rounded-full bg-green" />
          Free in your browser · Pro launching soon
        </p>
        <h1 className="rise max-w-3xl text-5xl font-extrabold leading-[1.05] text-ink sm:text-7xl" style={{ "--delay": "0.1s" } as React.CSSProperties}>
          Draw it. Present it. Share it.
        </h1>
        <p className="rise max-w-xl text-lg text-ink-soft" style={{ "--delay": "0.2s" } as React.CSSProperties}>
          Build a hand-drawn diagram, reveal it step by step on camera, and share a polished video.
        </p>
        <div className="rise flex flex-wrap items-center justify-center gap-3" style={{ "--delay": "0.25s" } as React.CSSProperties}>
          <a href={STUDIO_URL} className="btn-green">Try Flowcam free</a>
          <Link href="/waitlist" className="btn-ghost">Get notified for Pro</Link>
        </div>
        <p className="text-sm text-muted">No account needed · Works in Chrome, Edge and Firefox · Mac &amp; Windows apps to follow</p>
        <HeroVideo />
        <ModeTabs />
      </div>
    </section>
  );
}
