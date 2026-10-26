import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { decodeMicrophone } from "../export/compose";
import { fromWhisper, type Transcript, type WhisperOutput } from "./captions";

// On-device captions: Whisper runs here, off the main thread. The model downloads from huggingface.co on first use
// and the browser's Cache Storage keeps it for later runs.

export const WHISPER_MODEL = "onnx-community/whisper-base";
const WHISPER_RATE = 16000;

export type TranscribeRequest = { clips: { clipId: string; durationMs: number; media: Blob }[] };
export type TranscribeReply =
  | { type: "progress"; message: string }
  | { type: "done"; transcript: Transcript }
  | { type: "error"; message: string };

env.allowLocalModels = false;
const reply = (msg: TranscribeReply) => self.postMessage(msg);
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/** Linear resampling to Whisper's 16 kHz. */
// ponytail: no anti-alias filter before downsampling; speech recognition copes, add one if accuracy suffers.
function to16k(x: Float32Array, rate: number) {
  const out = new Float32Array(Math.floor((x.length * WHISPER_RATE) / rate));
  const step = rate / WHISPER_RATE;
  for (let i = 0; i < out.length; i++) {
    const p = i * step;
    const j = Math.floor(p);
    out[i] = x[j] + ((x[j + 1] ?? x[j]) - x[j]) * (p - j);
  }
  return out;
}

self.onmessage = async ({ data: req }: MessageEvent<TranscribeRequest>) => {
  try {
    asr ??= pipeline("automatic-speech-recognition", WHISPER_MODEL, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p: { status: string; file?: string; progress?: number }) => {
        if (p.status === "progress" && p.file) reply({ type: "progress", message: `Downloading captions model: ${p.file} ${Math.round(p.progress ?? 0)}%` });
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
    const transcribe = await asr;
    const transcript: Transcript = { version: 1, clips: {} };
    for (const [i, clip] of req.clips.entries()) {
      reply({ type: "progress", message: `Transcribing Clip ${i + 1} of ${req.clips.length}…` });
      const audio = await decodeMicrophone(clip.media);
      if (!audio) continue;
      const out = (await transcribe(to16k(audio.samples, audio.sampleRate), {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        language: "english",
        task: "transcribe",
      })) as WhisperOutput;
      transcript.clips[clip.clipId] = fromWhisper(out, clip.durationMs);
    }
    reply({ type: "done", transcript });
  } catch (e) {
    reply({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
