"use client";

import { useEffect, useState } from "react";
import type { AiJobIO, AiJobKind, AiQuality } from "./types";
import { supabaseBrowser } from "../../lib/supabase/client";

// Browser side of AI Jobs (ADR 0007): start a Job, poll it, remember it across a reload, read prices.

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

/** An API error with its HTTP status (401 signed out, 402 out of Credits, 429 rate limit, 400 bad input). */
export class AiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<AiError> {
  let msg = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch {
    /* keep the generic message */
  }
  return new AiError(res.status, msg);
}

export async function startJob<K extends AiJobKind>(kind: K, quality: AiQuality, input: AiJobIO[K]["input"]): Promise<string> {
  const res = await fetch("/api/ai/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, quality, input }),
  });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { id: string }).id;
}

export const POLL_MS = 1000;
export const TIMEOUT_MS = 3 * 60 * 1000;

/** Polls the Job every second until it succeeds (returns the result), fails (throws) or 3 minutes pass (throws). */
export async function waitForJob<K extends AiJobKind>(
  id: string,
  onStatus: (s: JobStatus) => void = () => {},
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<AiJobIO[K]["result"]> {
  const { intervalMs = POLL_MS, timeoutMs = TIMEOUT_MS } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`/api/ai/jobs/${encodeURIComponent(id)}`);
    if (!res.ok) throw await readError(res);
    const job = (await res.json()) as { status: JobStatus; result?: AiJobIO[K]["result"]; error?: string };
    onStatus(job.status);
    if (job.status === "succeeded") {
      if (!job.result) throw new AiError(500, "The Job finished without a result.");
      return job.result;
    }
    if (job.status === "failed") throw new AiError(500, `failed: ${job.error ?? "the Job failed"}`);
    if (Date.now() + intervalMs > deadline) throw new AiError(504, "This is taking too long. Try again in a moment.");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// A pending Job id is kept per feature so a reload resumes polling. Read defensively: storage can be blocked or hold junk.
const pendingKey = (feature: string) => `flowcam.ai.pending.${feature}`;
export type Pending = { id: string; ctx?: string };

export function savePending(feature: string, p: Pending) {
  try {
    localStorage.setItem(pendingKey(feature), JSON.stringify(p));
  } catch {
    /* private mode: no resume */
  }
}
export function loadPending(feature: string): Pending | null {
  try {
    const v = JSON.parse(localStorage.getItem(pendingKey(feature)) ?? "null");
    return v && typeof v.id === "string" && (v.ctx === undefined || typeof v.ctx === "string") ? { id: v.id, ctx: v.ctx } : null;
  } catch {
    return null;
  }
}
export function clearPending(feature: string) {
  try {
    localStorage.removeItem(pendingKey(feature));
  } catch {
    /* ignore */
  }
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export type Price = { credits: number; unit: "job" | "minute" };
export type Prices = Partial<Record<`${AiJobKind}:${AiQuality}`, Price>>;

/** "5 Credits", "1 Credit", "1 Credit per minute". */
export function formatPrice(p: Price | undefined): string {
  if (!p) return "";
  return `${p.credits} ${p.credits === 1 ? "Credit" : "Credits"}${p.unit === "minute" ? " per minute" : ""}`;
}

/** Prices from `ai_job_config` (anyone can read it); null while loading or when unavailable. */
export function useAiPrices(enabled = true): Prices | null {
  const [prices, setPrices] = useState<Prices | null>(null);
  useEffect(() => {
    if (!enabled) return; // closed dialogs make no requests (signed-out visitors make no Supabase requests at all)
    let live = true;
    (async () => {
      try {
        const { data } = await supabaseBrowser().from("ai_job_config").select("kind,quality,credits,unit");
        if (!live || !data) return;
        setPrices(Object.fromEntries(data.map((r) => [`${r.kind}:${r.quality}`, { credits: r.credits, unit: r.unit }])));
      } catch {
        /* prices are just not shown */
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled]);
  return prices;
}
