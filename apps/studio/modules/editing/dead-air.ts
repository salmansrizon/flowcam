/** Silence longer than this is dead air. */
export const DEAD_AIR_MIN_MS = 1500;
/** Silence kept on each side of a cut, so speech is not clipped. */
export const DEAD_AIR_PAD_MS = 300;
/** A 20 ms window quieter than this (RMS, about -42 dBFS) counts as silent. */
// ponytail: fixed threshold; adapt it to the measured noise floor if noisy rooms leave dead air in.
export const SILENCE_RMS = 0.008;
const WINDOW_MS = 20;

/** Ranges of `samples` (ms) to cut: each silence of DEAD_AIR_MIN_MS or more, shrunk by DEAD_AIR_PAD_MS each side. */
export function detectDeadAir(samples: Float32Array, sampleRate: number): { start: number; end: number }[] {
  const win = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000));
  const out: { start: number; end: number }[] = [];
  let silentFrom: number | null = null;
  const close = (endMs: number) => {
    if (silentFrom !== null && endMs - silentFrom >= DEAD_AIR_MIN_MS) {
      out.push({ start: silentFrom + DEAD_AIR_PAD_MS, end: endMs - DEAD_AIR_PAD_MS });
    }
    silentFrom = null;
  };
  for (let i = 0; i < samples.length; i += win) {
    const end = Math.min(samples.length, i + win);
    let sum = 0;
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    const silent = Math.sqrt(sum / (end - i)) < SILENCE_RMS;
    const ms = (i / sampleRate) * 1000;
    if (silent && silentFrom === null) silentFrom = ms;
    else if (!silent) close(ms);
  }
  close((samples.length / sampleRate) * 1000);
  return out;
}
