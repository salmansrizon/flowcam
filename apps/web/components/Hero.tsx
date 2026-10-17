import { WaitlistForm } from "./WaitlistForm";
import { ModeTabs } from "./ModeTabs";
import { HeroBoard } from "./HeroBoard";

export function Hero() {
  return (
    <section id="top" className="sky-wash page-gutter pt-12 pb-16 sm:pt-20">
      <div className="container-page flex flex-col items-center text-center gap-6">
        <p className="pill rise">
          <span aria-hidden className="size-2 rounded-full bg-green" />
          Launching soon · Founding price $17/mo, locked for life
        </p>
        <h1 className="rise max-w-3xl text-5xl font-extrabold leading-[1.05] text-ink sm:text-7xl" style={{ "--delay": "0.1s" } as React.CSSProperties}>
          Draw it. Present it. Share it.
        </h1>
        <p className="rise max-w-xl text-lg text-ink-soft" style={{ "--delay": "0.2s" } as React.CSSProperties}>
          Build a hand-drawn diagram, reveal it step by step on camera, and share a polished video.
        </p>
        <ModeTabs />
        <div id="waitlist" className="flex w-full scroll-mt-24 flex-col items-center gap-2">
          <WaitlistForm source="home" />
          <p className="text-sm text-muted">Web first · Mac &amp; Windows apps to follow</p>
        </div>
        <HeroBoard />
      </div>
    </section>
  );
}
