import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { planLabel } from "@/modules/account/plan";
import { placeHold, releaseHold } from "@/modules/credits/server";
import { WORDS_PER_MINUTE, wordCount } from "./demo";
import { AI_JOB_KINDS, AI_QUALITIES, type AiJobIO, type AiJobKind, type AiQuality } from "./types";

/** An error the route turns into an HTTP status. */
export class JobError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Abuse limits for Free accounts (PRODUCT.md §6: 1 Job at once, 10 per day). ponytail: move these to config (a table like ai_job_config) so Trial/Pro limits and tuning need no deploy. */
export const FREE_LIMITS = { atOnce: 1, perDay: 10 };

const bad = (m: string) => new JobError(400, m);
const str = (v: unknown, name: string, max: number) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw bad(`${name} must be a non-empty string of at most ${max} characters.`);
  return v;
};
const int = (v: unknown, name: string, min: number, max: number) => {
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) throw bad(`${name} must be a whole number from ${min} to ${max}.`);
  return v as number;
};

/** Validates and normalises the input for a kind. */
export function parseInput<K extends AiJobKind>(kind: K, input: unknown): AiJobIO[K]["input"] {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  switch (kind) {
    case "presentation":
      return { topic: str(o.topic, "topic", 500), ...(o.boards === undefined ? {} : { boards: int(o.boards, "boards", 1, 8) }) } as AiJobIO[K]["input"];
    case "script": {
      const l = o.stepLabels;
      if (!Array.isArray(l) || l.length < 1 || l.length > 100) throw bad("stepLabels must be a list of 1 to 100 labels.");
      return { stepLabels: l.map((x, i) => str(x, `stepLabels[${i}]`, 500)), ...(o.context === undefined ? {} : { context: str(o.context, "context", 4000) }) } as AiJobIO[K]["input"];
    }
    case "image":
      return { prompt: str(o.prompt, "prompt", 2000), width: int(o.width, "width", 64, 4096), height: int(o.height, "height", 64, 4096) } as AiJobIO[K]["input"];
    default:
      return { text: str(o.text, "text", 50_000) } as AiJobIO[K]["input"];
  }
}

/** Voiceover is priced per started minute at about 150 words a minute (at least one). */
export const voiceoverMinutes = (text: string) => Math.max(1, Math.ceil(wordCount(text) / WORDS_PER_MINUTE));

async function checkFreeLimits(uid: string) {
  const db = supabaseAdmin();
  const { data: sub } = await db.from("subscriptions").select("plan, status, current_period_end").eq("user_id", uid).maybeSingle();
  if (planLabel(sub) !== "Free") return; // Trial and Pro limits are not enforced yet (see FREE_LIMITS).
  const open = await db.from("ai_jobs").select("id", { count: "exact", head: true }).eq("user_id", uid).in("status", ["queued", "running"]);
  if ((open.count ?? 0) >= FREE_LIMITS.atOnce) throw new JobError(429, "You already have an AI Job running. Wait for it to finish, or upgrade to Pro for more at once.");
  const day = await db.from("ai_jobs").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", new Date(Date.now() - 864e5).toISOString());
  if ((day.count ?? 0) >= FREE_LIMITS.perDay) throw new JobError(429, `Free accounts can run ${FREE_LIMITS.perDay} AI Jobs a day. Try again tomorrow, or upgrade to Pro.`);
}

/** Validates, checks limits, places the Hold and queues the Job. Returns its id; the caller starts the worker. */
export async function enqueueJob(uid: string, body: { kind?: unknown; quality?: unknown; input?: unknown }): Promise<string> {
  const kind = body.kind as AiJobKind;
  const quality = body.quality as AiQuality;
  if (!AI_JOB_KINDS.includes(kind)) throw bad(`kind must be one of ${AI_JOB_KINDS.join(", ")}.`);
  if (!AI_QUALITIES.includes(quality)) throw bad(`quality must be one of ${AI_QUALITIES.join(", ")}.`);
  const input = parseInput(kind, body.input);

  const db = supabaseAdmin();
  const { data: cfg } = await db.from("ai_job_config").select("credits, unit").eq("kind", kind).eq("quality", quality).maybeSingle();
  if (!cfg) throw new JobError(500, "AI prices are not configured.");
  const credits = cfg.credits * (cfg.unit === "minute" ? voiceoverMinutes((input as AiJobIO["voiceover"]["input"]).text) : 1);

  await checkFreeLimits(uid);
  let holdId: number;
  try {
    holdId = await placeHold(uid, credits, `AI ${kind} (${quality})`);
  } catch (e) {
    if (/insufficient_credits/.test((e as Error).message)) throw new JobError(402, `Not enough Credits: this ${kind} costs ${credits}.`);
    throw e;
  }
  const { data, error } = await db.from("ai_jobs").insert({ user_id: uid, kind, quality, input, credits, hold_id: holdId }).select("id").single();
  if (error || !data) {
    await releaseHold(holdId);
    throw new JobError(500, "Could not queue the AI Job.");
  }
  return data.id;
}
