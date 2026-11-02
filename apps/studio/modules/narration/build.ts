import { AudioBufferSource, getFirstEncodableAudioCodec, Mp4OutputFormat, Output, QUALITY_HIGH, StreamTarget } from "mediabunny";
import type { Presentation } from "@flowcam/domain";
import { readAsset } from "../presentation/assets";
import { openClipMedia, writeClipLog, writeRecording } from "../recording/storage";
import { defaultEdits } from "../editing/edits";
import { writeEdits } from "../editing/store";
import { narratedClipLog, timeline } from "./timing";

/** One rate for the whole track: voice assets are resampled to it by the browser's decoder. */
const SAMPLE_RATE = 48_000;
const AUDIO_CODECS = ["aac", "opus"] as const;

/** Decodes a stored voice asset to mono samples at SAMPLE_RATE. */
export async function decodeVoice(assetId: string): Promise<Float32Array> {
  const bytes = await (await readAsset(assetId)).arrayBuffer();
  const buf = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(bytes);
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
  }
  return mono;
}

/**
 * Builds a Recording in OPFS from the Narrations: one Clip whose media.mp4 is the Narrations in order (silence as
 * zeros) and whose log shows each Step while its Narration plays. Returns the Recording id.
 */
export async function buildNarratedRecording(p: Presentation): Promise<string> {
  const { steps, startsMs, totalMs } = timeline(p); // throws if a Step has no Narration
  const total = Math.round((totalMs * SAMPLE_RATE) / 1000);
  const samples = new Float32Array(total);
  for (let j = 0; j < steps.length; j++) {
    const n = steps[j].narration!;
    if (n.kind !== "voice") continue;
    const voice = await decodeVoice(n.assetId);
    const at = Math.round((startsMs[j] * SAMPLE_RATE) / 1000);
    const room = Math.round((n.durationMs * SAMPLE_RATE) / 1000); // Never spill into the next Narration.
    samples.set(voice.subarray(0, Math.min(voice.length, room, total - at)), at);
  }

  const recordingId = crypto.randomUUID();
  const clipId = crypto.randomUUID();
  const format = new Mp4OutputFormat({ fastStart: "fragmented" });
  const codec = await getFirstEncodableAudioCodec(AUDIO_CODECS.filter((c) => format.getSupportedAudioCodecs().includes(c)), { quality: QUALITY_HIGH });
  if (!codec) throw new Error("This browser cannot encode audio.");

  // The manifest comes first so a crash leaves a Recording folder, not a Clip folder without one.
  await writeRecording({ version: 1, id: recordingId, presentationId: p.id, createdAt: new Date().toISOString(), clips: [clipId] });
  const output = new Output({ format, target: new StreamTarget(await openClipMedia(recordingId, clipId)) });
  const source = new AudioBufferSource({ codec, bitrate: QUALITY_HIGH });
  output.addAudioTrack(source);
  await output.start();
  const buffer = new AudioBuffer({ length: total, sampleRate: SAMPLE_RATE, numberOfChannels: 1 });
  buffer.copyToChannel(samples, 0);
  await source.add(buffer);
  source.close();
  await output.finalize();

  const log = narratedClipLog(p, clipId);
  await writeClipLog(recordingId, log);
  // No camera: Board only, and no dead-air trimming or captions, so the edited length is the Narration total.
  const edits = defaultEdits([{ clipId, durationMs: log.durationMs }]);
  await writeEdits(recordingId, {
    ...edits,
    layouts: [{ clipId, t: 0, layout: "board-only" }],
    trimDeadAir: false,
    captions: { ...edits.captions, enabled: false },
  });
  return recordingId;
}
