const STEPS_MS = [50, 100, 200, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000, 120_000, 300_000];

/** The tick spacing (ms) that keeps labels at least `minPx` apart at `pxPerMs`. */
export function tickStep(pxPerMs: number, minPx = 70): number {
  return STEPS_MS.find((s) => s * pxPerMs >= minPx) ?? STEPS_MS.at(-1)!;
}

/** m:ss, with tenths (or hundredths) when ticks are finer than a second. */
export function tickLabel(ms: number, step: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const digits = step >= 1000 ? 0 : step >= 100 ? 1 : 2;
  return `${m}:${rest < 10 ? "0" : ""}${rest.toFixed(digits)}`;
}
