// The Pro launch moment (NEXT_PUBLIC_PRO_LAUNCH_AT), shared by the marketing site's countdown and the Studio's Pro gate.

/** An ISO date (`2026-12-07`, read as UTC) or date-time with a zone (`…Z` or `…+06:00`); null otherwise. */
export function parseLaunchAt(raw: string | null | undefined): Date | null {
  const s = raw?.trim();
  if (!s || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+([zZ]|[+-]\d{2}:\d{2}))?$/.test(s)) return null;
  const [y, m, day] = s.slice(0, 10).split("-").map(Number);
  if (new Date(Date.UTC(y, m - 1, day)).getUTCDate() !== day) return null; // Date rolls Feb 30 over to March
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whether Pro (accounts, Trial, billing, Share, AI) is open. Unset or invalid: open in development, closed in production. */
export function proOpen(raw: string | null | undefined, now: Date, production: boolean): boolean {
  const at = parseLaunchAt(raw);
  return at ? now.getTime() >= at.getTime() : !production;
}

/** A site origin from the environment: `fallback` in development; a production build without it fails rather than linking to localhost. */
export function originFromEnv(name: string, value: string | undefined, fallback: string, production: boolean): string {
  if (value) return value.replace(/\/$/, "");
  if (production) throw new Error(`${name} is not set. Set it to the site's origin (e.g. https://app.getflowcam.com).`);
  return fallback;
}
