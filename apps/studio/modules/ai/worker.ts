import "server-only";
import { parsePresentation } from "@flowcam/domain";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chargeHold, releaseHold } from "@/modules/credits/server";
import { aiProvider } from "./provider";
import type { AiJobIO, AiJobKind, AiProvider, AiQuality } from "./types";

// The AI Job worker (ADR 0010): claims a Job, runs it with retries and escalation, settles its Hold, stores the result.

export const MAX_ATTEMPTS = 3;
/** A Job "running" longer than this is presumed dead (the server stopped mid-run) and is picked up again. */
export const STALE_MS = 5 * 60_000;

interface JobRow {
  id: string;
  kind: AiJobKind;
  quality: AiQuality;
  input: unknown;
  attempts: number;
  hold_id: number | null;
}

/** Throws unless the result is valid for the kind (ADR 0007: every Job has a validity check). */
export function validateResult(kind: AiJobKind, input: unknown, result: unknown): void {
  const r = result as Record<string, unknown> | null;
  const b64 = (v: unknown) => typeof v === "string" && v.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(v);
  if (kind === "presentation") parsePresentation(r?.presentation);
  else if (kind === "script") {
    const labels = (input as AiJobIO["script"]["input"]).stepLabels;
    const s = r?.scripts;
    if (!Array.isArray(s) || s.length !== labels.length || s.some((x) => typeof x !== "string")) throw new Error("scripts must be one string per Step");
  } else if (kind === "image") {
    if (!b64(r?.imageBase64)) throw new Error("image result is empty");
  } else if (!b64(r?.audioBase64)) throw new Error("audio result is empty");
}

const isText = (k: AiJobKind) => k === "presentation" || k === "script";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
/** charge_hold / release_hold throw "already settled" on a second call: that is the idempotent outcome we want. */
const settled = (e: unknown) => /already settled/.test(message(e));

async function models(job: JobRow, quality: AiQuality): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from("ai_job_config").select("models").eq("kind", job.kind).eq("quality", quality).single();
  if (error || !data) throw new Error(`No AI config for ${job.kind}/${quality}`);
  return data.models as string[];
}

/** One attempt: the Job's own route, then (Standard text Jobs that fail validation) Best's first model. Charged the same either way. */
async function attempt(job: JobRow, provider: AiProvider) {
  const run = (quality: AiQuality, list: string[]) => provider.run({ kind: job.kind, quality, input: job.input as never, models: list });
  const out = await run(job.quality, await models(job, job.quality));
  try {
    validateResult(job.kind, job.input, out.result);
    return out;
  } catch (e) {
    if (job.quality !== "standard" || !isText(job.kind)) throw e;
    const escalated = await run("best", (await models(job, "best")).slice(0, 1));
    validateResult(job.kind, job.input, escalated.result);
    return escalated;
  }
}

async function fail(job: JobRow, error: string) {
  if (job.hold_id !== null) {
    try {
      await releaseHold(job.hold_id);
    } catch (e) {
      if (!settled(e)) throw e;
    }
  }
  await supabaseAdmin().from("ai_jobs").update({ status: "failed", error, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "running");
}

/** Claims the Job if it is still queued (atomic: the update only matches a queued row). Returns it, or null if someone else has it. */
async function claim(id: string): Promise<JobRow | null> {
  const db = supabaseAdmin();
  const { data: cur } = await db.from("ai_jobs").select("attempts").eq("id", id).eq("status", "queued").maybeSingle();
  if (!cur) return null;
  const { data } = await db
    .from("ai_jobs")
    .update({ status: "running", attempts: cur.attempts + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued")
    .eq("attempts", cur.attempts)
    .select("id, kind, quality, input, attempts, hold_id");
  return (data?.[0] as JobRow | undefined) ?? null;
}

/** Runs one Job to a final state. Never throws. Safe to call twice: only one caller claims it, and Holds settle once. */
export async function runJob(id: string, provider?: AiProvider): Promise<void> {
  let job = await claim(id);
  if (!job) return;
  try {
    const p = provider ?? aiProvider();
    for (;;) {
      try {
        const { result, model } = await attempt(job, p);
        if (job.hold_id !== null) {
          try {
            await chargeHold(job.hold_id);
          } catch (e) {
            if (!settled(e)) throw e;
          }
        }
        await supabaseAdmin().from("ai_jobs").update({ status: "succeeded", result, model, error: null, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "running");
        return;
      } catch (e) {
        if (job.attempts >= MAX_ATTEMPTS) return await fail(job, message(e));
        const next: number = job.attempts + 1;
        const bumped = await supabaseAdmin().from("ai_jobs").update({ attempts: next, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "running").select("id");
        if (!bumped.data?.length) return;
        job = { ...job, attempts: next };
      }
    }
  } catch (e) {
    // Provider setup or settlement failed outright: leave the Job for the sweep (it will be retried or failed there).
    console.error("AI job", id, message(e));
  }
}

/** The sweep: re-queues Jobs stuck "running", fails ones out of attempts, and runs queued Jobs. Returns how many it ran. */
export async function sweep(limit = 10, provider?: AiProvider): Promise<number> {
  const db = supabaseAdmin();
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  const { data: stuck } = await db.from("ai_jobs").select("id, kind, quality, input, attempts, hold_id").eq("status", "running").lt("updated_at", stale);
  for (const j of (stuck ?? []) as JobRow[]) {
    if (j.attempts >= MAX_ATTEMPTS) {
      // Take the Job back (running -> running with a new stamp wins the race), then fail it.
      const { data } = await db.from("ai_jobs").update({ updated_at: new Date().toISOString() }).eq("id", j.id).eq("status", "running").lt("updated_at", stale).select("id");
      if (data?.length) await fail(j, "Timed out");
    } else await db.from("ai_jobs").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", j.id).eq("status", "running").lt("updated_at", stale);
  }
  const { data: queued } = await db.from("ai_jobs").select("id").eq("status", "queued").order("created_at").limit(limit);
  for (const j of queued ?? []) await runJob(j.id, provider);
  return queued?.length ?? 0;
}
