"use client";

import type { Piece } from "../edits";

/** The whole timeline as a thin strip with the visible window on it; drag to scroll. */
export function Minimap(props: { pieces: readonly Piece[]; total: number; playhead: number; view: { start: number; end: number }; onScrollTo: (startFrac: number) => void }) {
  const { total, view } = props;
  const pct = (t: number) => `${(t / Math.max(total, 1)) * 100}%`;
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const w = view.end - view.start;
    props.onScrollTo(Math.max(0, Math.min(1 - w, (e.clientX - r.left) / r.width - w / 2)));
  };
  return (
    <div
      aria-label="Minimap"
      data-testid="timeline-minimap"
      className="relative h-6 cursor-pointer touch-none overflow-hidden rounded-md bg-muted"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && move(e)}
    >
      {props.pieces.map((p, i) => (
        <span key={i} style={{ left: pct(p.at), width: pct(p.length) }} className="absolute inset-y-1.5 rounded-sm bg-foreground/25" />
      ))}
      <span style={{ left: pct(props.playhead) }} className="absolute inset-y-0 w-px bg-destructive" />
      <span
        data-testid="minimap-window"
        style={{ left: `${view.start * 100}%`, width: `${(view.end - view.start) * 100}%` }}
        className="absolute inset-y-0 rounded-md border-2 border-primary bg-primary/15"
      />
    </div>
  );
}
