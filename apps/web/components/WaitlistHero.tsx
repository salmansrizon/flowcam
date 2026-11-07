"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { timeLeft } from "@/lib/countdown";
import { PRO_LAUNCH_AT, STUDIO_URL } from "@/lib/site";

const tick = (cb: () => void) => {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
};
/** The current second; null while hydrating, so the server's HTML never disagrees with the client's clock. */
const useNowSecond = () => useSyncExternalStore(tick, () => Math.floor(Date.now() / 1000), () => null);

const pad = (n: number) => String(n).padStart(2, "0");
const UNITS = ["days", "hours", "minutes", "seconds"] as const;

/** The /waitlist hero: a countdown to the Pro launch, "Coming soon" without a date, and "Pro is here" once it passes. */
export function WaitlistHero({ form }: { form: ReactNode }) {
  const sec = useNowSecond();
  const at = PRO_LAUNCH_AT;
  const left = at && sec !== null ? timeLeft(at, new Date(sec * 1000)) : null;
  const live = at !== null && sec !== null && left === null;

  if (live) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="pill">Flowcam Pro</p>
        <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] text-ink sm:text-7xl">Pro is here</h1>
        <p className="max-w-xl text-lg text-ink-soft">Share links, Sync, 4K export and AI. Try every Pro feature free for 7 days.</p>
        <a href={STUDIO_URL} className="btn-green">Start your 7-day Trial</a>
        <div className="mt-6 flex w-full flex-col items-center gap-2">
          <p className="text-sm text-muted">Not ready yet? Get a reminder email.</p>
          {form}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <p className="pill"><span aria-hidden className="size-2 rounded-full bg-green" /> Flowcam Pro</p>
      <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] text-ink sm:text-7xl">{at ? "Pro launches in" : "Pro is coming soon"}</h1>
      {at && (
        <div role="timer" aria-label="Time until Pro launches" className="grid grid-cols-4 gap-2 sm:gap-4">
          {UNITS.map((u) => (
            <div key={u} className="tile min-w-[4.5rem] px-3 py-4 sm:min-w-28 sm:px-5 sm:py-6">
              <span data-unit={u} className="block text-4xl font-extrabold tabular-nums text-ink sm:text-6xl">{left ? pad(left[u]) : "––"}</span>
              <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-muted">{u}</span>
            </div>
          ))}
          <p className="sr-only">Pro launches on {at.toUTCString()}.</p>
        </div>
      )}
      <p className="max-w-xl text-lg text-ink-soft">
        Share links with Remix, Sync across devices, 4K export and 1,000 AI Credits a month. Get one email the day it opens, with the Founding Price.
      </p>
      <div className="flex w-full flex-col items-center gap-2">{form}</div>
      <p className="text-sm text-muted">
        Flowcam itself is free today. <a href={STUDIO_URL} className="font-bold text-green underline-offset-4 hover:underline">Try it in your browser →</a>
      </p>
    </div>
  );
}
