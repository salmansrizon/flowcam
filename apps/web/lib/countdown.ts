export type TimeLeft = { days: number; hours: number; minutes: number; seconds: number };

/** Whole days, hours, minutes and seconds from `now` until `at`; null once `at` has passed. */
export function timeLeft(at: Date, now: Date): TimeLeft | null {
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return null;
  const s = Math.ceil(ms / 1000); // 0.4 s left still shows 00:01, never a premature 00:00
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}
