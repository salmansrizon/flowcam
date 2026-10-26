import { FADE_MS, fadeAt, type Piece } from "../editing/edits";

// On-device audio for export, as plain sample maths so it runs in the export worker (which has no
// OfflineAudioContext) and gives the same result every time. Mono: the Microphone is one voice.

/** Loudness the export levels speech to. */
export const TARGET_LUFS = -16;
/** Peak ceiling after levelling, -1 dBFS. */
const CEILING = 10 ** (-1 / 20);

const db = (x: number) => 10 ** (x / 20);

/** A second-order filter (RBJ cookbook), run in place. */
function biquad(x: Float32Array, b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

function highPass(x: Float32Array, sr: number, hz: number, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * hz) / sr;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return biquad(x, (1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}

function highShelf(x: Float32Array, sr: number, hz: number, gainDb: number) {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * hz) / sr;
  const alpha = Math.sin(w) / Math.SQRT2;
  const c = Math.cos(w);
  const s = 2 * Math.sqrt(A) * alpha;
  return biquad(
    x,
    A * (A + 1 + (A - 1) * c + s),
    -2 * A * (A - 1 + (A + 1) * c),
    A * (A + 1 + (A - 1) * c - s),
    A + 1 - (A - 1) * c + s,
    2 * (A - 1 - (A + 1) * c),
    A + 1 - (A - 1) * c - s,
  );
}

/** Follows the signal's level with separate attack and release times; calls `gain(level)` per sample. */
function dynamics(x: Float32Array, sr: number, attackMs: number, releaseMs: number, gain: (level: number) => number) {
  const att = Math.exp(-1 / ((sr * attackMs) / 1000));
  const rel = Math.exp(-1 / ((sr * releaseMs) / 1000));
  let env = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    env = v > env ? att * env + (1 - att) * v : rel * env + (1 - rel) * v;
    x[i] *= gain(env);
  }
  return x;
}

/** Noise gate: below -50 dBFS the signal drops 20 dB, so room hiss between words goes quiet. */
const gate = (x: Float32Array, sr: number) => {
  let g = 1;
  const smooth = Math.exp(-1 / ((sr * 20) / 1000));
  return dynamics(x, sr, 2, 80, (level) => (g = smooth * g + (1 - smooth) * (level < db(-50) ? 0.1 : 1)));
};

/** Compressor: 3:1 above -24 dBFS. */
const compress = (x: Float32Array, sr: number) =>
  dynamics(x, sr, 5, 150, (level) => (level > db(-24) ? (db(-24) / level) ** (1 - 1 / 3) : 1));

/** Peak limiter at CEILING: instant attack, so nothing passes above it. */
function limit(x: Float32Array, sr: number) {
  const rel = Math.exp(-1 / ((sr * 100) / 1000));
  let g = 1;
  for (let i = 0; i < x.length; i++) {
    const need = Math.abs(x[i]) * g > CEILING ? CEILING / Math.abs(x[i]) : 1;
    g = need < g ? need : rel * g + (1 - rel) * Math.min(1, need);
    x[i] = Math.max(-CEILING, Math.min(CEILING, x[i] * g));
  }
  return x;
}

/** Integrated loudness in LUFS (ITU-R BS.1770, one channel): K-weighted, 400 ms blocks, gated. -Infinity if silent. */
export function loudness(x: Float32Array, sr: number): number {
  const k = highPass(highShelf(Float32Array.from(x), sr, 1681, 4), sr, 38, 0.5);
  const block = Math.round(sr * 0.4);
  const hop = Math.round(sr * 0.1);
  const powers: number[] = [];
  for (let i = 0; i + block <= k.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + block; j++) sum += k[j] * k[j];
    powers.push(sum / block);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const mean = (ps: number[]) => ps.reduce((a, b) => a + b, 0) / ps.length;
  const loud = powers.filter((p) => lufs(p) > -70);
  if (!loud.length) return -Infinity;
  const relative = lufs(mean(loud)) - 10;
  const kept = loud.filter((p) => lufs(p) > relative);
  return lufs(mean(kept));
}

/** Noise reduction and loudness levelling: high-pass, gate, compressor, level to TARGET_LUFS, limiter. In place. */
export function enhance(x: Float32Array, sr: number): Float32Array {
  compress(gate(highPass(x, sr, 80), sr), sr);
  const l = loudness(x, sr);
  // ponytail: never boosts more than 24 dB, so a near-silent take is not turned into loud hiss.
  if (Number.isFinite(l)) {
    const g = db(Math.min(24, TARGET_LUFS - l));
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  return limit(x, sr);
}

/** Reads `x` at fractional position `pos` (linear interpolation). */
const at = (x: Float32Array, pos: number) => {
  const i = Math.floor(pos);
  if (i < 0 || i >= x.length) return 0;
  const f = pos - i;
  return x[i] * (1 - f) + (i + 1 < x.length ? x[i + 1] : 0) * f;
};

export interface ClipAudio {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * The edited soundtrack at `sr`: each piece's range of its Clip's Microphone, sped up or slowed down, faded through
 * silence at fade Transitions like the picture, `totalSamples` long.
 */
// ponytail: speed changes resample, so pitch moves with speed; add a time-stretch (WSOLA) if voices sound off.
export function buildProgram(ps: readonly Piece[], audio: ReadonlyMap<string, ClipAudio>, sr: number, totalSamples: number): Float32Array {
  const out = new Float32Array(totalSamples);
  for (const p of ps) {
    const clip = audio.get(p.clipId);
    if (!clip) continue;
    const from = Math.round((p.at / 1000) * sr);
    const to = Math.min(totalSamples, Math.round(((p.at + p.length) / 1000) * sr));
    const step = (p.speed * clip.sampleRate) / sr;
    const start = (p.start / 1000) * clip.sampleRate;
    for (let i = from; i < to; i++) out[i] = at(clip.samples, start + (i - from) * step);
  }
  // Fades never overlap (fadeAt keeps each within half its neighbours), so each is applied once around its cut.
  ps.forEach((p, i) => {
    if (i === 0 || p.transition !== "fade") return;
    const from = Math.max(0, Math.floor(((p.at - FADE_MS / 2) / 1000) * sr));
    const to = Math.min(totalSamples, Math.ceil(((p.at + FADE_MS / 2) / 1000) * sr));
    for (let k = from; k < to; k++) out[k] *= 1 - fadeAt(ps, (k / sr) * 1000);
  });
  return out;
}
