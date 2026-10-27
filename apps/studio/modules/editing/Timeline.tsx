"use client";

import { Diamond, Flag, Gauge } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { markAt, pieces, type Edits } from "./edits";
import type { EditableRecording } from "./store";

/** Clips in order as rounded blocks, each Step pinned where it was advanced, with a draggable playhead. */
export function Timeline(props: {
  data: EditableRecording;
  edits: Edits;
  total: number;
  playhead: number;
  selected: number;
  onSeek: (t: number) => void;
  onSelect: (segment: number) => void;
}) {
  const { data, edits, total, playhead, selected } = props;
  const ps = pieces(edits);
  const dragging = useRef(false);
  const pct = (t: number) => `${(t / Math.max(total, 1)) * 100}%`;
  const steps = data.clips.flatMap((c) =>
    c.log.events.flatMap((ev) => {
      if (ev.type !== "step") return [];
      const at = markAt(ps, c.log.clipId, ev.t);
      return at === null ? [] : [{ at, index: ev.index }];
    }),
  );
  const layouts = edits.layouts.flatMap((l) => {
    const at = markAt(ps, l.clipId, l.t);
    return at === null ? [] : [{ at, layout: l.layout }];
  });
  const seekTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    props.onSeek(((e.clientX - r.left) / r.width) * total);
  };
  return (
    <div
      aria-label="Timeline"
      role="group"
      className="relative h-28 cursor-pointer touch-none rounded-lg bg-muted/60 select-none"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        const part = (e.target as HTMLElement).closest<HTMLElement>("[data-segment]");
        if (part) props.onSelect(Number(part.dataset.segment));
        seekTo(e);
      }}
      onPointerMove={(e) => dragging.current && seekTo(e)}
      onPointerUp={() => void (dragging.current = false)}
      onPointerCancel={() => void (dragging.current = false)}
    >
      {ps.map((p, i) => (
        <button
          key={i}
          type="button"
          data-testid="timeline-part"
          data-segment={p.segment}
          aria-pressed={p.segment === selected}
          title={`Clip ${data.recording.clips.indexOf(p.clipId) + 1}, ${p.speed}x`}
          // Pointer clicks are handled by the track (it must own the drag); this is for Enter and Space.
          onClick={(e) => e.detail === 0 && props.onSelect(p.segment)}
          style={{ left: pct(p.at), width: pct(p.length) }}
          className={cn(
            "absolute top-2 flex h-12 items-center gap-1 overflow-hidden rounded-lg border px-2 text-left text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            data.recording.clips.indexOf(p.clipId) % 2 ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground",
            p.segment === selected ? "border-2 border-primary" : "border-border",
            p.transition === "fade" && "border-l-8 border-l-foreground",
          )}
        >
          Clip {data.recording.clips.indexOf(p.clipId) + 1}
          {p.speed !== 1 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1.5 py-0.5">
              <Gauge className="size-3" aria-hidden />
              {p.speed}x
            </span>
          )}
        </button>
      ))}
      {steps.map((s, i) => (
        <span
          key={i}
          data-testid="timeline-step"
          title={`Step ${s.index}`}
          style={{ left: pct(s.at) }}
          className="pointer-events-none absolute top-16 inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground"
        >
          <Flag className="size-3" aria-hidden />
          Step {s.index}
        </span>
      ))}
      {layouts.map((l, i) => (
        <span key={i} title={`Layout: ${l.layout}`} style={{ left: pct(l.at) }} className="pointer-events-none absolute top-[88px] inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground">
          <Diamond className="size-3" aria-hidden /> {l.layout}
        </span>
      ))}
      <div style={{ left: pct(Math.min(playhead, total)) }} className="pointer-events-none absolute inset-y-0 w-0.5 bg-destructive">
        <span className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full bg-destructive" />
      </div>
    </div>
  );
}
