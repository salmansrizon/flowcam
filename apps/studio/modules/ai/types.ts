import type { Presentation } from "@flowcam/domain";

// AI Jobs (ADR 0007, 0010): shapes shared by the UI, the server routes and the provider adapters.

export const AI_JOB_KINDS = ["presentation", "script", "image", "voiceover"] as const;
export type AiJobKind = (typeof AI_JOB_KINDS)[number];
export const AI_QUALITIES = ["standard", "best"] as const;
export type AiQuality = (typeof AI_QUALITIES)[number];

/** What each kind of Job takes and returns. */
export interface AiJobIO {
  presentation: { input: { topic: string; boards?: number }; result: { presentation: Presentation } };
  script: { input: { stepLabels: string[]; context?: string }; result: { scripts: string[] } };
  image: { input: { prompt: string; width: number; height: number }; result: { imageBase64: string; contentType: string } };
  voiceover: { input: { text: string }; result: { audioBase64: string; contentType: string; durationMs: number } };
}

/** One request to a provider: the Job, and the model routes from `ai_job_config` to try in order. */
export interface ProviderRequest<K extends AiJobKind = AiJobKind> {
  kind: K;
  quality: AiQuality;
  input: AiJobIO[K]["input"];
  models: string[];
}

/** The port every AI provider implements: the OpenRouter adapter, or the demo adapter (OPENROUTER_API_KEY=demo). */
export interface AiProvider {
  readonly name: "openrouter" | "demo";
  run<K extends AiJobKind>(req: ProviderRequest<K>): Promise<{ result: AiJobIO[K]["result"]; model: string }>;
}
