import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type WrappedCanvas,
} from "mediabunny";
import {
  autoPlaceBubble,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  presentationViewAt,
  themeById,
  type BoardRenderer,
  type Canvas2D,
  type ClipLog,
  type Layout,
  type Presentation,
} from "@flowcam/domain";
import { cueAt, cuesFor, drawCaption, type Transcript } from "../captions/captions";
import { fadeAt, layoutAt, outputDuration, pieces, toSource, type Background, type Edits } from "../editing/edits";
import { buildProgram, enhance, type ClipAudio } from "./audio";
import { boardArea } from "./geometry";

export const FPS = 30;

/** Output sizes. 4K is Pro only (CONTEXT.md: Plan), so every local export is 1080p. */
export const RESOLUTIONS = { "1080p": [1920, 1080], "4k": [3840, 2160] } as const;
export type Resolution = keyof typeof RESOLUTIONS;

/** Camera Bubble diameter in Board units. */
const BUBBLE_SIZE = 340;

export interface ExportClip {
  log: ClipLog;
  /** The Clip's Camera and Microphone, as recorded. */
  media: Blob;
}

export interface Camera {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/** Background swatches and gradients, drawn behind the frame when it has padding. */
export const BACKGROUND_FILLS: Record<Background, string | [string, string]> = {
  white: "#f8f9fa",
  slate: "#2b3036",
  black: "#000000",
  blue: "#1c7ed6",
  sunset: ["#ff8a65", "#a259ff"],
  ocean: ["#0b3d91", "#22b8cf"],
  mint: ["#d3f9d8", "#63e6be"],
};

/** Draws `cam` to fill the box, cropping the overflow from the centre. */
function drawCover(ctx: Canvas2D, cam: Camera, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / cam.width, h / cam.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(cam.image, (cam.width - sw) / 2, (cam.height - sh) / 2, sw, sh, x, y, w, h);
}

export interface FrameInput {
  renderer: BoardRenderer;
  presentation: Presentation;
  log: ClipLog;
  /** Clip time. */
  tMs: number;
  camera: Camera | null;
  /** The Timeline's Layout; "auto" follows the Steps. */
  layout: Layout | "auto";
  frame: Edits["frame"];
  caption: { text: string; style: Edits["captions"]["style"]; position: Edits["captions"]["position"] } | null;
  /** 0 = normal, 1 = black (a fade Transition). */
  fade: number;
  watermark: boolean;
}

/**
 * Draws one output frame of `width` x `height`: background, the framed picture in its Layout, captions and the
 * Free watermark. The Review preview and the export both call this, so the preview shows what will be exported.
 */
export function composeFrame(ctx: Canvas2D, width: number, height: number, f: FrameInput): void {
  const k = width / BOARD_WIDTH;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const pv = presentationViewAt(f.presentation, f.log, f.tMs);
  const board = f.presentation.boards[pv.boardIndex];
  const layout = f.layout === "auto" ? pv.view.layout : f.layout;
  const env = { theme: themeById(f.presentation.themeId), images: new Map() };

  // Background and the framed picture's place in it, keeping 16:9.
  const fill = BACKGROUND_FILLS[f.frame.background];
  if (typeof fill === "string") ctx.fillStyle = fill;
  else {
    const g = ctx.createLinearGradient(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    g.addColorStop(0, fill[0]);
    g.addColorStop(1, fill[1]);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  const pad = (f.frame.padding / 100) * BOARD_WIDTH;
  const fw = BOARD_WIDTH - 2 * pad;
  const fh = (fw * BOARD_HEIGHT) / BOARD_WIDTH;
  const fx = pad;
  const fy = (BOARD_HEIGHT - fh) / 2;
  const radius = pad > 0 ? 20 : 0;
  if (pad > 0 && f.frame.shadow > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${(f.frame.shadow / 100) * 0.7})`;
    ctx.shadowBlur = f.frame.shadow * 0.8 * k;
    ctx.shadowOffsetY = f.frame.shadow * 0.25 * k;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, radius);
    ctx.fill();
    ctx.restore();
  }

  // The picture, drawn in Board units inside the frame.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(fx, fy, fw, fh, radius);
  ctx.clip();
  ctx.translate(fx, fy);
  ctx.scale(fw / BOARD_WIDTH, fh / BOARD_HEIGHT);
  const cam = f.camera;
  if (layout === "camera-only") {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    if (cam) drawCover(ctx, cam, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  } else if (layout === "side-by-side") {
    ctx.fillStyle = "#16181b";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    const { x: bx, y: by, width: bw, height: bh } = boardArea("side-by-side");
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(bw / BOARD_WIDTH, bh / BOARD_HEIGHT);
    f.renderer.render(ctx, board, pv.view, f.tMs, env);
    ctx.restore();
    if (cam) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(1300, by, 580, bh, 16);
      ctx.clip();
      drawCover(ctx, cam, 1300, by, 580, bh);
      ctx.restore();
    }
  } else {
    f.renderer.render(ctx, board, pv.view, f.tMs, env);
    if (layout === "bubble" && cam) {
      const { x, y } = autoPlaceBubble(board, pv.view, BUBBLE_SIZE);
      const r = BUBBLE_SIZE / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, cam, x, y, BUBBLE_SIZE, BUBBLE_SIZE);
      ctx.restore();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (f.fade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${f.fade})`;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  }
  ctx.restore();

  if (f.caption) drawCaption(ctx, f.caption.text, f.caption.style, f.caption.position, width, height);
  if (f.watermark) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    // Dark outline, light fill: readable over a white Board, the camera or a dark Layout.
    const [wx, wy] = [fx + 40 * (fw / BOARD_WIDTH), fy + fh - 40 * (fh / BOARD_HEIGHT)];
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(23, 23, 23, 0.55)";
    ctx.strokeText("Made with Flowcam", wx, wy);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText("Made with Flowcam", wx, wy);
  }
}

/** A Clip's Microphone mixed down to one channel, placed by timestamp (media t=0 is sample 0). */
export async function decodeMicrophone(media: Blob): Promise<ClipAudio | null> {
  const input = new Input({ source: new BlobSource(media), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const sampleRate = track.sampleRate;
    const samples = new Float32Array(Math.ceil((await track.computeDuration()) * sampleRate) + 1);
    let plane = new Float32Array(0);
    for await (const s of new AudioSampleSink(track).samples()) {
      const offset = Math.round(s.timestamp * sampleRate);
      if (plane.length < s.numberOfFrames) plane = new Float32Array(s.numberOfFrames);
      for (let c = 0; c < s.numberOfChannels; c++) {
        s.copyTo(plane, { planeIndex: c, format: "f32-planar" });
        for (let i = 0; i < s.numberOfFrames; i++) {
          const j = offset + i;
          if (j >= 0 && j < samples.length) samples[j] += plane[i] / s.numberOfChannels;
        }
      }
      s.close();
    }
    return { samples, sampleRate };
  } finally {
    input.dispose();
  }
}

export interface ExportOptions {
  watermark: boolean;
  resolution?: Resolution;
  onProgress?: (done: number, total: number) => void;
  /** Called with the canvas after each frame is composed (used by tests to compare frames). */
  onFrame?: (canvas: OffscreenCanvas, index: number) => void | Promise<void>;
}

/**
 * Renders the edited Recording to one MP4: every output frame is looked up on the edited timeline, the Board is
 * replayed from that Clip's log and framed with the Camera, captions and background; the Microphone is cut the same
 * way, cleaned and levelled.
 */
export async function exportRecording(
  renderer: BoardRenderer,
  presentation: Presentation,
  clips: ExportClip[],
  edits: Edits,
  transcript: Transcript | null,
  opts: ExportOptions,
): Promise<Blob> {
  const [width, height] = RESOLUTIONS[opts.resolution ?? "1080p"];
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const byId = new Map(clips.map((c) => [c.log.clipId, c]));
  const order = clips.map((c) => c.log.clipId);
  const inputs = new Map(clips.map((c) => [c.log.clipId, new Input({ source: new BlobSource(c.media), formats: ALL_FORMATS })]));
  const ps = pieces(edits).filter((p) => byId.has(p.clipId));
  const cues = transcript && edits.captions.enabled ? cuesFor(ps, transcript) : [];

  try {
    const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width, height });
    if (!videoCodec) throw new Error("This browser cannot encode video.");
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY_HIGH });
    output.addVideoTrack(video, { frameRate: FPS });

    const total = Math.ceil((outputDuration(ps) / 1000) * FPS);
    const at = Array.from({ length: total }, (_, k) => toSource(ps, (k / FPS) * 1000)!);

    // The soundtrack is cut from each Clip's Microphone like the picture.
    const audioIn = new Map<string, ClipAudio>();
    for (const [id, c] of byId) {
      const a = await decodeMicrophone(c.media);
      if (a) audioIn.set(id, a);
    }
    const sampleRate = audioIn.values().next().value?.sampleRate;
    const audioCodec = sampleRate && (await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 1, sampleRate }));
    const audio = audioCodec ? new AudioSampleSource({ codec: audioCodec, bitrate: QUALITY_HIGH }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    // One camera decoder per Clip, fed that Clip's frame times in output order.
    const cameras = new Map<string, AsyncGenerator<WrappedCanvas | null>>();
    for (const [id, input] of inputs) {
      const track = await input.getPrimaryVideoTrack();
      if (track) cameras.set(id, new CanvasSink(track).canvasesAtTimestamps(at.filter((s) => s.clipId === id).map((s) => s.t / 1000)));
    }

    for (let k = 0; k < total; k++) {
      const src = at[k];
      const outT = (k / FPS) * 1000;
      const wrapped = (await cameras.get(src.clipId)?.next())?.value ?? null;
      const cue = cueAt(cues, outT);
      composeFrame(ctx, width, height, {
        renderer,
        presentation,
        log: byId.get(src.clipId)!.log,
        tMs: src.t,
        camera: wrapped ? { image: wrapped.canvas, width: wrapped.canvas.width, height: wrapped.canvas.height } : null,
        layout: layoutAt(edits, order, src.clipId, src.t),
        frame: edits.frame,
        caption: cue && { text: cue.text, style: edits.captions.style, position: edits.captions.position },
        fade: fadeAt(ps, outT),
        watermark: opts.watermark,
      });
      await opts.onFrame?.(canvas, k);
      await video.add(k / FPS, 1 / FPS);
      opts.onProgress?.(k + 1, total);
    }

    if (audio && sampleRate) {
      const program = buildProgram(ps, audioIn, sampleRate, Math.round((total / FPS) * sampleRate));
      if (edits.enhanceAudio) enhance(program, sampleRate);
      for (let i = 0; i < program.length; i += sampleRate) {
        const data = program.slice(i, i + sampleRate);
        const sample = new AudioSample({ data, format: "f32-planar", numberOfChannels: 1, sampleRate, timestamp: i / sampleRate });
        await audio.add(sample);
        sample.close();
      }
    }

    await output.finalize();
    return new Blob([target.buffer!], { type: "video/mp4" });
  } finally {
    for (const input of inputs.values()) input.dispose();
  }
}
