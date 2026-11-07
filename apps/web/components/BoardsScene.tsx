"use client";

import { useEffect, useRef } from "react";

// Hand-drawn mini Boards floating in depth behind the hero and the /waitlist countdown (three.js).
// three loads after the page is idle; the loop pauses while the tab is hidden or the scene is scrolled away;
// reduced motion draws one still frame. Without WebGL only the CSS gradient shows.

const INK = "#0e1b2b";
const ACCENTS = ["#1aa7b8", "#1f8a3b", "#f2a541", "#6d5bd0"];
const COUNT = 16;

/** A small hand-drawn diagram on a white card, drawn on a 2D canvas for a texture. */
function drawBoard(seed: number): HTMLCanvasElement {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.roundRect(0, 0, 512, 320, 28);
  g.fill();
  const wobble = (x: number, y: number) => [x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3] as const;
  const line = (pts: [number, number][], color: string, w = 4) => {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(...wobble(x, y)) : g.moveTo(...wobble(x, y))));
      g.stroke();
    }
  };
  const box = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color + "22";
    g.fillRect(x, y, w, h);
    line([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], color);
  };
  const n = 2 + Math.floor(rnd() * 2);
  const w = 120;
  const h = 70;
  const gap = (512 - 60 - n * w) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = 30 + i * (w + gap);
    const y = 60 + rnd() * 140;
    const color = i === 0 ? INK : ACCENTS[Math.floor(rnd() * ACCENTS.length)];
    box(x, y, w, h, color);
    line([[x + 18, y + 28], [x + w - 30, y + 28]], color, 3);
    line([[x + 18, y + 46], [x + w - 50, y + 46]], color, 3);
    if (i < n - 1) {
      const ax = x + w + 8;
      const bx = x + w + gap - 8;
      const ay = y + h / 2;
      line([[ax, ay], [(ax + bx) / 2, ay - 18], [bx, ay]], "#1aa7b8");
      line([[bx - 14, ay - 10], [bx, ay], [bx - 14, ay + 8]], "#1aa7b8");
    }
  }
  return c;
}

export function BoardsScene() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cleanup = () => {};
    let cancelled = false;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));

    idle(async () => {
      const THREE = await import("three");
      if (cancelled) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      } catch {
        return; // no WebGL: the CSS gradient stays
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      el.append(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xf3f9fe, 8, 26);
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.z = 8;

      const geometry = new THREE.PlaneGeometry(3.2, 2);
      /** Half the visible height at depth z (camera at z=8, 50° field of view). */
      const halfH = (z: number) => Math.tan(THREE.MathUtils.degToRad(25)) * (camera.position.z - z);
      const boards = Array.from({ length: COUNT }, (_, i) => {
        const texture = new THREE.CanvasTexture(drawBoard(i + 1));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(geometry, material);
        // Placed by screen position (ndcX), so the middle stays clear for the headline, form and video at any width.
        const side = i % 2 ? 1 : -1;
        const z = -2 - Math.random() * 14;
        mesh.position.set(0, (Math.random() - 0.5) * 2 * halfH(z), z);
        mesh.rotation.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4);
        mesh.userData = { ndcX: side * (0.66 + Math.random() * 0.34), speed: 0.12 + Math.random() * 0.2, spin: (Math.random() - 0.5) * 0.12, phase: Math.random() * Math.PI * 2 };
        scene.add(mesh);
        return { mesh, texture, material };
      });

      const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        for (const { mesh } of boards) mesh.position.x = (mesh.userData as { ndcX: number }).ndcX * halfH(mesh.position.z) * camera.aspect;
        renderer.render(scene, camera); // setSize clears the canvas, and the loop may be paused
      };
      resize();

      const pointer = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        pointer.x = e.clientX / window.innerWidth - 0.5;
        pointer.y = e.clientY / window.innerHeight - 0.5;
      };

      const clock = new THREE.Clock();
      const frame = () => {
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        for (const { mesh } of boards) {
          const d = mesh.userData as { speed: number; spin: number; phase: number };
          mesh.position.y += d.speed * dt;
          const top = halfH(mesh.position.z) + 1.2;
          if (mesh.position.y > top) mesh.position.y = -top;
          mesh.rotation.y += d.spin * dt;
          mesh.rotation.x = Math.sin(t * 0.3 + d.phase) * 0.15;
        }
        camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.04;
        camera.position.y += (-pointer.y * 0.8 - window.scrollY * 0.002 - camera.position.y) * 0.04;
        camera.lookAt(0, -window.scrollY * 0.002, -6);
        renderer.render(scene, camera);
      };

      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let raf = 0;
      const loop = () => {
        frame();
        raf = requestAnimationFrame(loop);
      };
      // Runs only while visible: not when the tab is hidden or the page is scrolled well past the first screen.
      const shouldRun = () => !still && !document.hidden && window.scrollY < window.innerHeight * 1.5;
      const sync = () => {
        // The layer is fixed, so scrolled past the first screens it fades out rather than sitting frozen.
        el.dataset.away = String(window.scrollY >= window.innerHeight * 1.5);
        if (shouldRun() && !raf) {
          clock.getDelta();
          loop();
        } else if (!shouldRun() && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      };
      frame();
      sync();
      window.addEventListener("resize", resize);
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("scroll", sync, { passive: true });
      document.addEventListener("visibilitychange", sync);
      el.dataset.ready = "true";

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("scroll", sync);
        document.removeEventListener("visibilitychange", sync);
        for (const b of boards) {
          b.texture.dispose();
          b.material.dispose();
        }
        geometry.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return <div ref={host} className="bg-live bg-scene" aria-hidden="true" data-testid="boards-scene" />;
}
