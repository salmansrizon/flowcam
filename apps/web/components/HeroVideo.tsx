"use client";

import { useEffect, useRef } from "react";
import { WindowBar } from "./ProductShot";

/** The real Studio presenting the sample Presentation (captured by `npm run capture:landing`). Still under reduced motion. */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => (mq.matches ? v.pause() : void v.play().catch(() => {}));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return (
    <figure className="rise tile mt-4 w-full max-w-5xl overflow-hidden p-0 shadow-[0_30px_60px_-20px_rgb(14_27_43/0.35)]" style={{ "--delay": "0.3s" } as React.CSSProperties}>
      <WindowBar />
      <video
        ref={ref}
        className="block aspect-video w-full bg-white"
        src="/product/hero.mp4"
        poster="/product/hero-poster.jpg"
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="The Flowcam Studio presenting a diagram step by step, with the Teleprompter beside it"
      />
    </figure>
  );
}
