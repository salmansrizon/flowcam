import { deflateSync } from "node:zlib";
import type { Presentation } from "@flowcam/domain";
import { TEMPLATES, templateBoard } from "../authoring/templates";
import type { AiJobIO, AiJobKind, AiProvider, ProviderRequest } from "./types";

/** Deterministic local results with no network (OPENROUTER_API_KEY=demo). */

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** ~150 words a minute (PRODUCT.md §5); used for voiceover pricing and demo audio length. */
export const WORDS_PER_MINUTE = 150;
export const speechMs = (text: string) => Math.round((wordCount(text) / WORDS_PER_MINUTE) * 60_000);

function presentation({ topic, boards = 1 }: AiJobIO["presentation"]["input"]): Presentation {
  const start = hash(topic);
  return {
    version: 1,
    id: crypto.randomUUID(),
    title: topic,
    themeId: "paper",
    boards: Array.from({ length: Math.min(Math.max(boards, 1), 8) }, (_, i) => {
      const board = templateBoard(TEMPLATES[(start + i) % TEMPLATES.length]);
      board.steps = board.steps.map((s, j) => ({ ...s, script: s.script ?? `Step ${j + 1} of ${topic}.` }));
      return board;
    }),
  };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A small gradient PNG, coloured from the prompt. ponytail: the prompt text is not drawn (no canvas on the server); add a canvas lib if needed. */
function image({ prompt, width, height }: AiJobIO["image"]["input"]) {
  const scale = Math.min(1, 256 / Math.max(width, height));
  const [w, h] = [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
  const hue = hash(prompt);
  const [r, g, b] = [hue & 255, (hue >> 8) & 255, (hue >> 16) & 255];
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      const t = x / w, u = y / h;
      raw[row + 1 + x * 3] = Math.round(r * (1 - t) + 255 * t);
      raw[row + 2 + x * 3] = Math.round(g * (1 - u) + 255 * u);
      raw[row + 3 + x * 3] = Math.round(b * t * u + 40);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return { imageBase64: png.toString("base64"), contentType: "image/png" };
}

/** A silent 8 kHz 16-bit mono WAV as long as the text takes to say. */
function voiceover({ text }: AiJobIO["voiceover"]["input"]) {
  const durationMs = Math.max(speechMs(text), 100);
  const samples = Math.round((durationMs * 8000) / 1000);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  return { audioBase64: wav.toString("base64"), contentType: "audio/wav", durationMs };
}

export const demoProvider: AiProvider = {
  name: "demo",
  async run<K extends AiJobKind>(req: ProviderRequest<K>) {
    const input = req.input as never;
    const results = {
      presentation: () => ({ presentation: presentation(input) }),
      script: () => ({ scripts: (req.input as AiJobIO["script"]["input"]).stepLabels.map((l) => `Here we cover ${l}.`) }),
      image: () => image(input),
      voiceover: () => voiceover(input),
    } satisfies Record<AiJobKind, () => unknown>;
    return { result: results[req.kind]() as AiJobIO[K]["result"], model: "demo" };
  },
};
