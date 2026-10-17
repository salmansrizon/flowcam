import {
  ALL_FORMATS,
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
} from "mediabunny";
import { BOARD_HEIGHT, BOARD_WIDTH, viewAt, type Board, type BoardRenderer, type Canvas2D, type ClipLog } from "@flowcam/domain";

export const FPS = 30;

/** Camera Bubble, bottom right, in Board units. */
const BUBBLE = { x: 1540, y: 700, size: 340 };

export interface ExportClip {
  log: ClipLog;
  /** The Clip's Camera and Microphone, as recorded. */
  media: Blob;
}

/** Draws one output frame: the Board replayed from the log, the Camera Bubble and the Free watermark. */
export function composeFrame(
  ctx: Canvas2D,
  renderer: BoardRenderer,
  board: Board,
  log: ClipLog,
  tMs: number,
  camera: CanvasImageSource | null,
  watermark: boolean,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  renderer.render(ctx, board, viewAt(board, log, tMs), tMs);
  if (camera) {
    const r = BUBBLE.size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(BUBBLE.x + r, BUBBLE.y + r, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(camera, BUBBLE.x, BUBBLE.y, BUBBLE.size, BUBBLE.size);
    ctx.restore();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(BUBBLE.x + r, BUBBLE.y + r, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (watermark) {
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillStyle = "rgba(23, 23, 23, 0.55)";
    ctx.fillText("Made with Flowcam", 40, BOARD_HEIGHT - 40);
  }
}

export interface ExportOptions {
  watermark: boolean;
  onProgress?: (done: number, total: number) => void;
  /** Called with the canvas after each frame is composed (used by tests to compare frames). */
  onFrame?: (canvas: OffscreenCanvas, index: number) => void | Promise<void>;
}

/** Replays each Clip through the renderer, composites the Camera, mixes the Microphone and encodes one MP4. */
export async function exportRecording(
  renderer: BoardRenderer,
  board: Board,
  clips: ExportClip[],
  opts: ExportOptions,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(BOARD_WIDTH, BOARD_HEIGHT);
  const ctx = canvas.getContext("2d")!;
  const inputs = clips.map((c) => new Input({ source: new BlobSource(c.media), formats: ALL_FORMATS }));

  try {
    const firstAudio = await inputs[0]?.getPrimaryAudioTrack();
    const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: BOARD_WIDTH, height: BOARD_HEIGHT });
    const audioCodec =
      firstAudio &&
      (await getFirstEncodableAudioCodec(["aac", "opus"], {
        numberOfChannels: firstAudio.numberOfChannels,
        sampleRate: firstAudio.sampleRate,
      }));
    if (!videoCodec) throw new Error("This browser cannot encode video.");

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY_HIGH });
    output.addVideoTrack(video, { frameRate: FPS });
    const audio = audioCodec ? new AudioSampleSource({ codec: audioCodec, bitrate: QUALITY_HIGH }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    const total = clips.reduce((n, c) => n + Math.ceil((c.log.durationMs / 1000) * FPS), 0);
    let frame = 0;
    let offset = 0; // Seconds of output before this Clip.

    for (const [i, clip] of clips.entries()) {
      const input = inputs[i];
      const seconds = clip.log.durationMs / 1000;
      const frames = Math.ceil(seconds * FPS);
      // Log time 0 is media time 0: the recorder's first media sample (see modules/recording/clip.ts).
      const mediaStart = 0;
      const cameraTrack = await input.getPrimaryVideoTrack();
      const camera = cameraTrack
        ? new CanvasSink(cameraTrack, { width: BUBBLE.size, height: BUBBLE.size, fit: "cover" }).canvasesAtTimestamps(
            Array.from({ length: frames }, (_, k) => mediaStart + k / FPS),
          )
        : null;

      for (let k = 0; k < frames; k++) {
        const cam = camera ? (await camera.next()).value : null;
        composeFrame(ctx, renderer, board, clip.log, (k / FPS) * 1000, cam ? cam.canvas : null, opts.watermark);
        await opts.onFrame?.(canvas, frame);
        await video.add(offset + k / FPS, 1 / FPS);
        opts.onProgress?.(++frame, total);
      }

      const micTrack = await input.getPrimaryAudioTrack();
      if (audio && micTrack) {
        for await (const sample of new AudioSampleSink(micTrack).samples(mediaStart, mediaStart + seconds)) {
          sample.setTimestamp(offset + sample.timestamp - mediaStart);
          await audio.add(sample);
          sample.close();
        }
      }
      offset += frames / FPS;
    }

    await output.finalize();
    return new Blob([target.buffer!], { type: "video/mp4" });
  } finally {
    for (const input of inputs) input.dispose();
  }
}
