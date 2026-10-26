"use client";

import { LAYOUTS, type Layout } from "@flowcam/domain";
import { boardRenderer } from "@flowcam/renderer";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAPTION_LOOKS, cueAt, cuesFor, toSrt, toVtt } from "../captions/captions";
import { transcribe } from "../captions/transcribe";
import { composeFrame, decodeMicrophone } from "../export/compose";
import Exporter from "../export/Exporter";
import { detectDeadAir } from "./dead-air";
import {
  BACKGROUNDS,
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  CLIP_TRANSITIONS,
  deleteRange,
  fadeAt,
  layoutAt,
  MAX_PADDING,
  MAX_SHADOW,
  outputDuration,
  pieces,
  setLayout,
  setSpeed,
  setTransition,
  split,
  markAt,
  toSource,
  trim,
  type ClipTransition,
  type DeadAir,
  type Edits,
} from "./edits";
import { loadEditable, writeEdits, writeTranscript, type EditableRecording } from "./store";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PREVIEW_W = 1280;
const PREVIEW_H = 720;
const secs = (ms: number) => (ms / 1000).toFixed(2);

export default function Review({ recordingId, edit }: { recordingId: string; edit: boolean }) {
  const [data, setData] = useState<EditableRecording | null>(null);
  const [edits, setEdits] = useState<Edits | null>(null);
  const [history, setHistory] = useState<Edits[]>([]);
  const [status, setStatus] = useState("Loading the Recording…");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState(0);
  const [selected, setSelected] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 1000]);
  const [layoutChoice, setLayoutChoice] = useState<Layout | "auto">("auto");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const [captionStatus, setCaptionStatus] = useState("");
  const saveChain = useRef(Promise.resolve());

  const save = useCallback(
    (next: Edits) => {
      setSaving((n) => n + 1);
      saveChain.current = saveChain.current
        .then(() => writeEdits(recordingId, next))
        .catch((e) => setError(`Could not save edits: ${e}`))
        .finally(() => setSaving((n) => n - 1));
    },
    [recordingId],
  );

  /** Applies an edit, saving it and keeping the previous state for Undo. */
  const apply = useCallback(
    (next: Edits) => {
      if (!edits || next === edits) return;
      setHistory((h) => [...h.slice(-49), edits]);
      setEdits(next);
      save(next);
    },
    [edits, save],
  );

  const undo = useCallback(() => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setEdits(prev);
    save(prev);
  }, [history, save]);

  // Load, then find dead air the first time this Recording is reviewed.
  useEffect(() => {
    let live = true;
    (async () => {
      const d = await loadEditable(recordingId);
      if (!live) return;
      setData(d);
      let e = d.edits;
      if (e.deadAir === null) {
        setStatus("Finding dead air…");
        const deadAir: DeadAir[] = [];
        for (const c of d.clips) {
          const audio = await decodeMicrophone(c.media);
          if (audio) for (const r of detectDeadAir(audio.samples, audio.sampleRate)) deadAir.push({ clipId: c.log.clipId, ...r });
        }
        e = { ...e, deadAir };
      }
      if (!live) return;
      setEdits(e);
      if (!d.saved || d.edits !== e) save(e);
      setStatus("");
    })().catch((e) => live && setError(`Could not open the Recording: ${e instanceof Error ? e.message : e}`));
    return () => {
      live = false;
    };
  }, [recordingId, save]);

  // Captions are on by default: make the Transcript once, on the device.
  const wantsTranscript = !!data && !!edits?.captions.enabled && !data.transcript;
  useEffect(() => {
    if (!wantsTranscript || !data) return;
    let live = true;
    transcribe(
      data.clips.map((c) => ({ clipId: c.log.clipId, durationMs: c.log.durationMs, media: c.media })),
      (m) => live && setCaptionStatus(m),
    )
      .then(async (t) => {
        await writeTranscript(recordingId, t);
        if (live) setData({ ...data, transcript: t });
      })
      .catch((e) => live && setError(`Captions failed: ${e instanceof Error ? e.message : e}`));
    return () => {
      live = false;
    };
  }, [wantsTranscript, data, recordingId]);

  // Media for the preview.
  const urls = useMemo(() => new Map(data?.clips.map((c) => [c.log.clipId, URL.createObjectURL(c.media)]) ?? []), [data?.clips]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const ps = useMemo(() => (edits ? pieces(edits) : []), [edits]);
  const total = outputDuration(ps);
  const cues = useMemo(() => (edits?.captions.enabled && data?.transcript ? cuesFor(ps, data.transcript) : []), [ps, edits, data]);
  // Caption files for the edited timeline, whether or not captions are burnt into the picture.
  const captionFiles = useMemo(() => {
    if (!data?.transcript) return null;
    const all = cuesFor(ps, data.transcript);
    return {
      srt: URL.createObjectURL(new Blob([toSrt(all)], { type: "application/x-subrip" })),
      vtt: URL.createObjectURL(new Blob([toVtt(all)], { type: "text/vtt" })),
    };
  }, [ps, data]);
  useEffect(() => () => void (captionFiles && (URL.revokeObjectURL(captionFiles.srt), URL.revokeObjectURL(captionFiles.vtt))), [captionFiles]);

  // Playback: the active piece's Clip video drives the clock; every frame is drawn with composeFrame, as at export.
  useEffect(() => {
    if (!data || !edits) return;
    const videos = videosRef.current;
    const play = { piece: -1, outT: 0 };
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const order = data.recording.clips;
    const logs = new Map(data.clips.map((c) => [c.log.clipId, c.log]));
    let frame = 0;
    const startPiece = (i: number) => {
      const p = ps[i];
      play.piece = i;
      for (const [id, v] of videos) if (id !== p.clipId) v.pause();
      const v = videos.get(p.clipId)!;
      v.currentTime = p.start / 1000;
      v.playbackRate = p.speed;
      void v.play().catch(() => {});
    };
    if (playing) {
      const src = toSource(ps, playhead >= total ? 0 : playhead);
      if (!src) return;
      startPiece(src.piece);
      videos.get(src.clipId)!.currentTime = src.t / 1000;
    } else {
      for (const v of videos.values()) v.pause();
      const src = toSource(ps, playhead);
      if (src) videos.get(src.clipId)!.currentTime = src.t / 1000;
      play.piece = -1;
    }
    const draw = () => {
      let outT = playhead;
      if (playing && play.piece >= 0) {
        let p = ps[play.piece];
        const v = videos.get(p.clipId)!;
        if (v.currentTime * 1000 >= p.end || v.ended) {
          if (play.piece + 1 >= ps.length) {
            play.outT = total;
            setPlaying(false);
            setPlayhead(total);
            return;
          }
          startPiece(play.piece + 1);
          p = ps[play.piece];
        }
        const t = Math.max(p.start, Math.min(videos.get(p.clipId)!.currentTime * 1000, p.end));
        outT = p.at + (t - p.start) / p.speed;
        play.outT = outT;
        setClock(outT);
      }
      const src = toSource(ps, outT);
      if (src) {
        const v = videos.get(src.clipId);
        const cue = cueAt(cues, outT);
        composeFrame(ctx, PREVIEW_W, PREVIEW_H, {
          renderer: boardRenderer,
          presentation: data.presentation,
          log: logs.get(src.clipId)!,
          tMs: src.t,
          camera: v && v.videoWidth ? { image: v, width: v.videoWidth, height: v.videoHeight } : null,
          layout: layoutAt(edits, order, src.clipId, src.t),
          frame: edits.frame,
          caption: cue && { text: cue.text, style: edits.captions.style, position: edits.captions.position },
          fade: fadeAt(ps, outT),
          watermark: true,
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      if (playing) setPlayhead(play.outT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playhead seeds playback; re-running on every tick would restart it.
  }, [data, edits, ps, cues, playing, playing ? null : playhead, total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  if (error && !data) return <main style={page} role="alert">{error}</main>;
  if (!data || !edits) return <main style={page}>{status}</main>;

  const seg = edits.segments[Math.min(selected, edits.segments.length - 1)];
  const clipNo = (clipId: string) => data.recording.clips.indexOf(clipId) + 1;
  const durationOf = (clipId: string) => data.clips.find((c) => c.log.clipId === clipId)!.log.durationMs;
  const set = (patch: Partial<Edits>) => apply({ ...edits, ...patch });
  const shownTime = Math.min(playing ? clock : playhead, total);
  const deadAirMs = (edits.deadAir ?? []).reduce((n, d) => n + d.end - d.start, 0);
  const seek = (t: number) => {
    setPlaying(false);
    setPlayhead(Math.max(0, Math.min(t, total)));
  };

  return (
    <main style={page} data-mode={edit ? "timeline" : "review"}>
      <header style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{edit ? "Timeline" : "Review"}</h1>
        <span>
          Edited length <strong data-testid="edited-duration">{secs(total)}</strong> s
        </span>
        <span data-testid="save-state">{saving ? "Saving…" : "All changes saved"}</span>
        {(status || wantsTranscript) && <span role="status">{status || captionStatus || "Generating captions…"}</span>}
        {error && <span role="alert">{error}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <button type="button" onClick={undo} disabled={!history.length}>
            Undo
          </button>
          {edit ? (
            <Link href={`/review?recording=${recordingId}`}>Back to Review</Link>
          ) : (
            <Link href={`/review?recording=${recordingId}&edit=1`}>Edit on Timeline</Link>
          )}
        </span>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 24, marginTop: 16 }}>
        <section>
          <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} aria-label="Preview" style={{ width: "100%", borderRadius: 8, background: "#000", display: "block" }} />
          {data.clips.map((c) => (
            <video
              key={c.log.clipId}
              ref={(v) => void (v ? videosRef.current.set(c.log.clipId, v) : videosRef.current.delete(c.log.clipId))}
              src={urls.get(c.log.clipId)}
              preload="auto"
              playsInline
              hidden
            />
          ))}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
            <button type="button" onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              aria-label="Playhead"
              min={0}
              max={Math.max(1, Math.round(total))}
              step={10}
              value={Math.round(shownTime)}
              onChange={(e) => seek(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span data-testid="preview-time">
              {secs(shownTime)} / {secs(total)} s
            </span>
          </div>
          {edit && (
            <Timeline
              data={data}
              edits={edits}
              total={total}
              playhead={shownTime}
              selected={selected}
              onSeek={seek}
              onSelect={setSelected}
            />
          )}
          {edit && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, alignItems: "end" }}>
              <button type="button" onClick={() => apply(split(edits, playhead))}>
                Split at playhead
              </button>
              <fieldset style={fieldset}>
                <legend>Delete a range (s)</legend>
                <input type="number" aria-label="Range start" step={0.1} min={0} value={secs(range[0])} onChange={(e) => setRange([Number(e.target.value) * 1000, range[1]])} style={{ width: 70 }} />
                {" to "}
                <input type="number" aria-label="Range end" step={0.1} min={0} value={secs(range[1])} onChange={(e) => setRange([range[0], Number(e.target.value) * 1000])} style={{ width: 70 }} />{" "}
                <button type="button" onClick={() => apply(deleteRange(edits, range[0], range[1]))}>
                  Delete range
                </button>
              </fieldset>
              <fieldset style={fieldset}>
                <legend>Layout from the playhead on</legend>
                <select aria-label="Layout" value={layoutChoice} onChange={(e) => setLayoutChoice(e.target.value as Layout | "auto")}>
                  <option value="auto">Follow the Steps</option>
                  {LAYOUTS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>{" "}
                <button type="button" onClick={() => apply(setLayout(edits, playhead, layoutChoice))}>
                  Set Layout
                </button>
              </fieldset>
            </div>
          )}
          {edit && seg && (
            <fieldset style={{ ...fieldset, marginTop: 12 }} aria-label="Selected part">
              <legend>
                Part {selected + 1}: Clip {clipNo(seg.clipId)}, {secs(seg.start)}–{secs(seg.end)} s
              </legend>
              <label>
                Trim start{" "}
                <input type="number" aria-label="Trim start" step={0.1} value={secs(seg.start)} onChange={(e) => apply(trim(edits, selected, Number(e.target.value) * 1000, seg.end, durationOf(seg.clipId)))} style={{ width: 70 }} />
              </label>{" "}
              <label>
                Trim end{" "}
                <input type="number" aria-label="Trim end" step={0.1} value={secs(seg.end)} onChange={(e) => apply(trim(edits, selected, seg.start, Number(e.target.value) * 1000, durationOf(seg.clipId)))} style={{ width: 70 }} />
              </label>{" "}
              <label>
                Speed{" "}
                <select aria-label="Speed" value={seg.speed} onChange={(e) => apply(setSpeed(edits, selected, Number(e.target.value)))}>
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}x
                    </option>
                  ))}
                </select>
              </label>{" "}
              {selected > 0 && (
                <label>
                  Transition in{" "}
                  <select aria-label="Transition" value={seg.transition} onChange={(e) => apply(setTransition(edits, selected, e.target.value as ClipTransition))}>
                    {CLIP_TRANSITIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>
          )}
        </section>

        <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <fieldset style={fieldset}>
            <legend>Clean up</legend>
            <label>
              <input type="checkbox" checked={edits.trimDeadAir} onChange={(e) => set({ trimDeadAir: e.target.checked })} /> Trim dead air
            </label>
            <div style={hint}>{edits.deadAir === null ? "Finding dead air…" : `${secs(deadAirMs)} s of silence found`}</div>
            <label>
              <input type="checkbox" checked={edits.enhanceAudio} onChange={(e) => set({ enhanceAudio: e.target.checked })} /> Noise reduction and levelling
            </label>
          </fieldset>
          <fieldset style={fieldset}>
            <legend>Captions</legend>
            <label>
              <input type="checkbox" checked={edits.captions.enabled} onChange={(e) => set({ captions: { ...edits.captions, enabled: e.target.checked } })} /> Show captions
            </label>
            <label>
              Style{" "}
              <select aria-label="Caption style" value={edits.captions.style} onChange={(e) => set({ captions: { ...edits.captions, style: e.target.value as Edits["captions"]["style"] } })}>
                {CAPTION_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {CAPTION_LOOKS[s].name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Position{" "}
              <select aria-label="Caption position" value={edits.captions.position} onChange={(e) => set({ captions: { ...edits.captions, position: e.target.value as Edits["captions"]["position"] } })}>
                {CAPTION_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            {captionFiles ? (
              <div style={{ display: "flex", gap: 12 }} data-testid="caption-cues" data-count={cues.length}>
                <a href={captionFiles.srt} download="flowcam.srt">
                  Download SRT
                </a>
                <a href={captionFiles.vtt} download="flowcam.vtt">
                  Download VTT
                </a>
              </div>
            ) : (
              <div style={hint}>No Transcript yet.</div>
            )}
          </fieldset>
          <fieldset style={fieldset}>
            <legend>Frame</legend>
            <label>
              Background{" "}
              <select aria-label="Background" value={edits.frame.background} onChange={(e) => set({ frame: { ...edits.frame, background: e.target.value as Edits["frame"]["background"] } })}>
                {BACKGROUNDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Padding{" "}
              <input type="range" aria-label="Padding" min={0} max={MAX_PADDING} value={edits.frame.padding} onChange={(e) => set({ frame: { ...edits.frame, padding: Number(e.target.value) } })} />
            </label>
            <label>
              Shadow{" "}
              <input type="range" aria-label="Shadow" min={0} max={MAX_SHADOW} value={edits.frame.shadow} onChange={(e) => set({ frame: { ...edits.frame, shadow: Number(e.target.value) } })} />
            </label>
          </fieldset>
          <fieldset style={fieldset}>
            <legend>Export</legend>
            <Exporter recordingId={recordingId} heading={false} />
          </fieldset>
        </aside>
      </div>
    </main>
  );
}

/** Clips in order as blocks, each Step pinned where it was advanced. */
function Timeline(props: {
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
  return (
    <div
      aria-label="Timeline"
      style={{ position: "relative", height: 96, marginTop: 12, background: "#f1f3f5", borderRadius: 8, cursor: "pointer", userSelect: "none" }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        props.onSeek(((e.clientX - r.left) / r.width) * total);
      }}
    >
      {ps.map((p, i) => (
        <button
          key={i}
          type="button"
          data-testid="timeline-part"
          aria-pressed={p.segment === selected}
          title={`Clip ${data.recording.clips.indexOf(p.clipId) + 1}, ${p.speed}x`}
          onClick={(e) => {
            e.stopPropagation();
            props.onSelect(p.segment);
            const r = e.currentTarget.parentElement!.getBoundingClientRect();
            props.onSeek(((e.clientX - r.left) / r.width) * total);
          }}
          style={{
            position: "absolute",
            left: pct(p.at),
            width: pct(p.length),
            top: 8,
            height: 44,
            border: p.segment === selected ? "2px solid #1c7ed6" : "1px solid #adb5bd",
            boxShadow: p.transition === "fade" ? "inset 6px 0 0 #000" : undefined,
            background: data.recording.clips.indexOf(p.clipId) % 2 ? "#d0ebff" : "#e5dbff",
            borderRadius: 6,
            overflow: "hidden",
            fontSize: 12,
            padding: "0 4px",
            textAlign: "left",
            whiteSpace: "nowrap",
          }}
        >
          Clip {data.recording.clips.indexOf(p.clipId) + 1}
          {p.speed !== 1 && ` · ${p.speed}x`}
        </button>
      ))}
      {steps.map((s, i) => (
        <span key={i} data-testid="timeline-step" title={`Step ${s.index}`} style={{ position: "absolute", left: pct(s.at), top: 56, fontSize: 11, padding: "2px 4px", background: "#fff3bf", border: "1px solid #fab005", borderRadius: 4 }}>
          Step {s.index}
        </span>
      ))}
      {layouts.map((l, i) => (
        <span key={i} title={`Layout: ${l.layout}`} style={{ position: "absolute", left: pct(l.at), top: 78, fontSize: 10, color: "#5f3dc4" }}>
          ◆ {l.layout}
        </span>
      ))}
      <div style={{ position: "absolute", left: pct(Math.min(playhead, total)), top: 0, bottom: 0, width: 2, background: "#e03131", pointerEvents: "none" }} />
    </div>
  );
}

const page = { padding: 24, fontFamily: "system-ui", maxWidth: 1400, margin: "0 auto" } as const;
const fieldset = { border: "1px solid #dee2e6", borderRadius: 8, display: "grid", gap: 6 } as const;
const hint = { fontSize: 12, color: "#868e96" } as const;
