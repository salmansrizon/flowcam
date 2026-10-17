"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ElementType, type ReactNode } from "react";

const mq = "(prefers-reduced-motion: reduce)";
const subReduced = (cb: () => void) => {
  const m = window.matchMedia(mq);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** Tracks whether an element is on screen and the tab is visible; also reports reduced-motion. */
export function useLive<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [seen, setSeen] = useState(false);
  const [visible, setVisible] = useState(true);
  const reduced = useSyncExternalStore(subReduced, () => window.matchMedia(mq).matches, () => false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      setInView(e.isIntersecting);
      if (e.isIntersecting) setSeen(true);
    }, { threshold: 0.2 });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return { ref, live: inView && visible, seen, reduced };
}

/** Wrapper that exposes data-live / data-seen so CSS-module animations can pause off-screen. */
export function LiveBox({ as, className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  const { ref, live, seen } = useLive<HTMLElement>();
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag ref={ref} className={className} data-live={live} data-seen={seen}>
      {children}
    </Tag>
  );
}
