"use client";

import { useActionState, useId } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions";

const initial: WaitlistState = { status: "idle", message: "" };

// The one sign-up form used everywhere. `source` records which page someone joined from.
export function WaitlistForm({ source = "home", compact = false }: { source?: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(joinWaitlist, initial);
  const id = useId();
  const done = state.status === "ok" || state.status === "already";

  if (done) {
    return (
      <p role="status" className="tile px-5 py-4 text-ink font-semibold flex items-center gap-3">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-green-soft text-green">✓</span>
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className={`w-full ${compact ? "max-w-md" : "max-w-lg"}`} noValidate>
      <input type="hidden" name="source" value={source} />
      {/* Honeypot: hidden from people, filled by bots */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor={`${id}-company`}>Company</label>
        <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="tile flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:rounded-full">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-full bg-transparent px-4 py-3 text-base text-ink placeholder:text-muted outline-none"
        />
        <button type="submit" disabled={pending} className="btn-green disabled:opacity-60">
          {pending ? "Joining…" : "Notify me at launch"}
        </button>
      </div>

      <label htmlFor={`${id}-consent`} className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
        <input id={`${id}-consent`} name="consent" type="checkbox" required className="mt-1 size-4 accent-[var(--green)]" />
        <span>Email me when Flowcam launches. One launch email, no spam; unsubscribe anytime.</span>
      </label>

      {state.status === "error" && (
        <p role="alert" className="mt-2 text-sm font-medium text-[#b42318]">
          {state.message}
        </p>
      )}
    </form>
  );
}
