"use client";

import { Captions, Diamond, Film, Flag, Gauge, LayoutTemplate, Plus, Type, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cuesFor } from "../captions/captions";
import { markAt, pieces, type Edits } from "./edits";
import type { EditableRecording } from "./store";
import { Minimap } from "./timeline/Minimap";
import { tickLabel, tickStep } from "./timeline/ruler";
import { TextPanel } from "./timeline/TextPanel";
import { addText, deleteText, moveText, resizeText, textSpan, textsOf, updateText } from "./texts";

const MAX_ZOOM = 40;
const RULER = "h-6";
// Row heights are shared by the gutter and the lanes so labels line up with their rows.
const ROWS = [
  { key: "clips", label: "Clips", icon: Film, h: "h-14", empty: "" },
  { key: "steps", label: "Steps", icon: Flag, h: "h-8", empty: "No Steps" },
  { key: "captions", label: "Captions", icon: Captions, h: "h-8", empty: "No captions yet" },
  { key: "layout", label: "Layout", icon: LayoutTemplate, h: "h-8", empty: "No Layout changes" },
  { key: "text", label: "Text", icon: Type, h: "h-9", empty: "Add text to place it here" },
] as const;

type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; at: number; length: number };

/** Labelled rows (Clips, Steps, Captions, Layout, Text) on one time axis, with a ruler, zoom, minimap and a draggable playhead. */
export function Timeline(props: {
  data: EditableRecording;
  edits: Edits;
  total: number;
  playhead: number;
  selected: number;
  onSeek: (t: number) => void;
  onSelect: (segment: number) => void;
  apply: (next: Edits, mergeKey?: string) => void;
}) {
  const { data, edits, total, playhead, selected } = props;
  const ps = useMemo(() => pieces(edits), [edits]);
  const scroller = useRef<HTMLDivElement>(null);
  const seeking = useRef(false);
  const zoomRef = useRef(1);
  const anchor = useRef<{ frac: number; px: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewW, setViewW] = useState(800);
  const [view, setView] = useState({ start: 0, end: 1 });
  const [textId, setTextId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Edits | null>(null);
  const draftRef = useRef<Edits | null>(null);
  const drag = useRef<Drag | null>(null);

  const shown = draft ?? edits;
  const texts = textsOf(shown);
  const text = texts.find((t) => t.id === textId) ?? null;
  const clipLength = useCallback((id: string) => data.clips.find((c) => c.log.clipId === id)?.log.durationMs ?? 0, [data]);
  const cues = useMemo(() => (data.transcript ? cuesFor(ps, data.transcript) : []), [ps, data.transcript]);

  const pct = (t: number) => `${(t / Math.max(total, 1)) * 100}%`;
  const pxPerMs = (viewW * zoom) / Math.max(total, 1);

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

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setViewW(el.clientWidth);
    setView({ start: el.scrollLeft / el.scrollWidth, end: Math.min(1, (el.scrollLeft + el.clientWidth) / el.scrollWidth) });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Zoom keeping the moment under `px` (from the scroller's left edge) where it is.
  const zoomTo = useCallback((next: number, px?: number) => {
    const el = scroller.current;
    const z = Math.max(1, Math.min(MAX_ZOOM, next));
    if (!el || z === zoomRef.current) return;
    const at = px ?? el.clientWidth / 2;
    anchor.current = { frac: (el.scrollLeft + at) / el.scrollWidth, px: at };
    zoomRef.current = z;
    setZoom(z);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && anchor.current) {
      el.scrollLeft = anchor.current.frac * el.scrollWidth - anchor.current.px;
      anchor.current = null;
    }
    measure();
  }, [zoom, measure]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - el.getBoundingClientRect().left);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const seekTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    props.onSeek(((e.clientX - r.left) / r.width) * total);
  };

  const startDrag = (e: React.PointerEvent<HTMLElement>, id: string, mode: Drag["mode"]) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setTextId(id);
    const span = textSpan(edits, textsOf(edits).find((t) => t.id === id)!);
    if (span) drag.current = { id, mode, x0: e.clientX, ...span };
  };
  const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.x0) / pxPerMs;
    const next =
      d.mode === "move" ? moveText(edits, d.id, d.at + dt, clipLength) : resizeText(edits, d.id, d.mode, d.mode === "start" ? d.at + dt : d.at + d.length + dt, clipLength);
    draftRef.current = next;
    setDraft(next);
  };
  const endDrag = () => {
    drag.current = null;
    // One edit per drag, so one Undo undoes it.
    if (draftRef.current) props.apply(draftRef.current);
    draftRef.current = null;
    setDraft(null);
  };

  const add = () => {
    const id = crypto.randomUUID();
    const next = addText(edits, playhead, clipLength, id);
    if (next === edits) return;
    props.apply(next);
    setTextId(id);
  };

  const step = tickStep(pxPerMs);
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const empty = { clips: !ps.length, steps: !steps.length, captions: !cues.length, layout: !layouts.length, text: !texts.length };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!total}>
          <Plus /> Add text
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button type="button" variant="ghost" size="icon" aria-label="Zoom out" onClick={() => zoomTo(zoomRef.current / 1.5)} disabled={zoom <= 1}>
          <ZoomOut />
        </Button>
        <span className="w-10 text-center text-xs text-muted-foreground tabular-nums" data-testid="timeline-zoom">
          {Math.round(zoom * 100)}%
        </span>
        <Button type="button" variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoomTo(zoomRef.current * 1.5)} disabled={zoom >= MAX_ZOOM}>
          <ZoomIn />
        </Button>
        <span className="text-xs text-muted-foreground">Ctrl or Cmd + wheel zooms</span>
      </div>

      {text && (
        <TextPanel
          key={text.id}
          text={text}
          onChange={(patch) => props.apply(updateText(edits, text.id, patch), `text:${text.id}:${Object.keys(patch).join()}`)}
          onDelete={() => {
            props.apply(deleteText(edits, text.id));
            setTextId(null);
          }}
        />
      )}

      <div aria-label="Timeline" role="group" className="grid gap-1.5 select-none">
        <div className="flex rounded-lg bg-muted/60">
          <div className="w-24 shrink-0 border-r">
            <div className={RULER} />
            {ROWS.map((r) => (
              <div key={r.key} className={cn("flex items-center gap-1.5 border-t px-2 text-xs font-medium text-muted-foreground", r.h)}>
                <r.icon className="size-3.5 shrink-0" aria-hidden />
                {r.label}
              </div>
            ))}
          </div>
          <div ref={scroller} onScroll={measure} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div
              data-testid="timeline-track"
              style={{ width: `${zoom * 100}%` }}
              className="relative cursor-pointer touch-none"
              onPointerDown={(e) => {
                seeking.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                const part = (e.target as HTMLElement).closest<HTMLElement>("[data-segment]");
                if (part) props.onSelect(Number(part.dataset.segment));
                seekTo(e);
              }}
              onPointerMove={(e) => seeking.current && seekTo(e)}
              onPointerUp={() => void (seeking.current = false)}
              onPointerCancel={() => void (seeking.current = false)}
            >
              <div data-testid="ruler" className={cn("relative overflow-hidden", RULER)}>
                {ticks.map((t) => (
                  <span key={t} style={{ left: pct(t) }} className="absolute inset-y-0 border-l border-foreground/25 pl-1 text-[10px] leading-6 text-muted-foreground tabular-nums">
                    {tickLabel(t, step)}
                  </span>
                ))}
              </div>

              <div className={cn("relative border-t", ROWS[0].h)}>
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
                      "absolute top-1.5 flex h-11 items-center gap-1 overflow-hidden rounded-lg border px-2 text-left text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
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
              </div>

              <div className={cn("relative border-t", ROWS[1].h)}>
                {empty.steps && <Placeholder>{ROWS[1].empty}</Placeholder>}
                {steps.map((s, i) => (
                  <span
                    key={i}
                    data-testid="timeline-step"
                    title={`Step ${s.index}`}
                    style={{ left: pct(s.at) }}
                    className="pointer-events-none absolute top-1.5 inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground"
                  >
                    <Flag className="size-3" aria-hidden />
                    Step {s.index}
                  </span>
                ))}
              </div>

              <div className={cn("relative border-t", ROWS[2].h)}>
                {empty.captions && <Placeholder>{ROWS[2].empty}</Placeholder>}
                {cues.map((c, i) => (
                  <span
                    key={i}
                    data-testid="timeline-cue"
                    title={c.text}
                    style={{ left: pct(c.start), width: pct(c.end - c.start) }}
                    className="pointer-events-none absolute top-1.5 h-5 overflow-hidden rounded-md border bg-background/80 px-1.5 text-[11px] leading-5 whitespace-nowrap"
                  >
                    {c.text}
                  </span>
                ))}
              </div>

              <div className={cn("relative border-t", ROWS[3].h)}>
                {empty.layout && <Placeholder>{ROWS[3].empty}</Placeholder>}
                {layouts.map((l, i) => (
                  <span key={i} title={`Layout: ${l.layout}`} style={{ left: pct(l.at) }} className="pointer-events-none absolute top-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground">
                    <Diamond className="size-3" aria-hidden /> {l.layout}
                  </span>
                ))}
              </div>

              <div className={cn("relative border-t", ROWS[4].h)}>
                {empty.text && <Placeholder>{ROWS[4].empty}</Placeholder>}
                {texts.map((t) => {
                  const span = textSpan(shown, t);
                  if (!span) return null;
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={t.id === textId}
                      data-testid="timeline-text"
                      data-start={t.start}
                      data-end={t.end}
                      title={t.text}
                      style={{ left: pct(span.at), width: pct(span.length) }}
                      onPointerDown={(e) => startDrag(e, t.id, "move")}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setTextId(t.id);
                        }
                        if (e.key === "Delete" || e.key === "Backspace") {
                          e.preventDefault();
                          props.apply(deleteText(edits, t.id));
                          setTextId(null);
                        }
                      }}
                      className={cn(
                        "absolute top-1.5 flex h-6 cursor-grab items-center gap-1 overflow-hidden rounded-md border bg-primary/20 px-2.5 text-[11px] font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
                        t.id === textId ? "border-2 border-primary" : "border-primary/50",
                      )}
                    >
                      <span
                        data-testid="timeline-text-start"
                        aria-label="Resize start"
                        onPointerDown={(e) => startDrag(e, t.id, "start")}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-primary/40"
                      />
                      <span className="truncate">{t.text}</span>
                      <span
                        data-testid="timeline-text-end"
                        aria-label="Resize end"
                        onPointerDown={(e) => startDrag(e, t.id, "end")}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-primary/40"
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ left: pct(Math.min(playhead, total)) }} className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-destructive">
                <span className="absolute -top-0.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-destructive" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-0">
          <div className="w-24 shrink-0 pr-2 text-right text-[11px] leading-6 text-muted-foreground">Overview</div>
          <div className="min-w-0 flex-1">
            <Minimap
              pieces={ps}
              total={total}
              playhead={Math.min(playhead, total)}
              view={view}
              onScrollTo={(f) => {
                const el = scroller.current;
                if (el) el.scrollLeft = f * el.scrollWidth;
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[11px] text-muted-foreground/60 italic">{children}</span>;
}
