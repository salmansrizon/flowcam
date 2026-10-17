"use client";

import { useEffect, useRef } from "react";

type Dot = { x: number; y: number; vx: number; vy: number; w: number };
type Comet = { a: number; b: number; t: number } | null;

export function AnimatedBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Reduced motion: static gradient only (blobs hidden via CSS), no loop.
    if (mq.matches) return;

    let w = 0, h = 0, raf = 0, dots: Dot[] = [], comet: Comet = null, nextComet = 0;
    const mouse = { x: -9999, y: -9999 };
    const LINK = 150, PULL = 180;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = w < 640 ? 22 : 40;
      dots = Array.from({ length: n }, (_, i) => dots[i] ?? {
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        w: Math.random() * 6.28,
      });
    };

    const onMove = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        const dx = mouse.x - d.x, dy = mouse.y - d.y, dist = Math.hypot(dx, dy);
        if (dist < PULL && dist > 1) {
          d.vx += (dx / dist) * 0.012;
          d.vy += (dy / dist) * 0.012;
        }
        d.vx *= 0.99; d.vy *= 0.99;
        const sp = Math.hypot(d.vx, d.vy);
        if (sp < 0.08) { d.vx += (Math.random() - 0.5) * 0.02; d.vy += (Math.random() - 0.5) * 0.02; }
        if (sp > 0.8) { d.vx *= 0.8 / sp; d.vy *= 0.8 / sp; }
        d.x += d.vx; d.y += d.vy;
        if (d.x < -20) d.x = w + 20; else if (d.x > w + 20) d.x = -20;
        if (d.y < -20) d.y = h + 20; else if (d.y > h + 20) d.y = -20;
      }

      ctx.lineWidth = 1;
      const links: [number, number][] = [];
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j], dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > LINK) continue;
          links.push([i, j]);
          ctx.strokeStyle = `rgba(26,167,184,${0.16 * (1 - dist / LINK)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          const off = Math.sin(now / 2500 + a.w + b.w) * 6; // wobbly hand-drawn bend
          ctx.quadraticCurveTo((a.x + b.x) / 2 + off, (a.y + b.y) / 2 - off, b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(26,167,184,0.35)";
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 2, 0, 6.28);
        ctx.fill();
      }

      // occasional comet along one connection
      if (!comet && now > nextComet && links.length) {
        const [a, b] = links[Math.floor(Math.random() * links.length)];
        comet = { a, b, t: 0 };
      }
      if (comet) {
        const a = dots[comet.a], b = dots[comet.b];
        comet.t += 0.018;
        if (comet.t >= 1) { comet = null; nextComet = now + 1500 + Math.random() * 3000; }
        else {
          const x = a.x + (b.x - a.x) * comet.t, y = a.y + (b.y - a.y) * comet.t;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
          g.addColorStop(0, "rgba(26,167,184,0.9)");
          g.addColorStop(1, "rgba(26,167,184,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, 6.28);
          ctx.fill();
        }
      }
    };

    const start = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());

    resize();
    start();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="bg-live" aria-hidden="true">
      <span className="bg-blob bg-blob-1" />
      <span className="bg-blob bg-blob-2" />
      <span className="bg-blob bg-blob-3" />
      <span className="bg-blob bg-blob-4" />
      <canvas ref={ref} />
    </div>
  );
}
