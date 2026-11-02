import type { AiJobIO, AiJobKind, AiProvider, ProviderRequest } from "./types";
import { presentationFromOutline, type Outline } from "./build";
import { speechMs } from "./demo";

// OpenRouter's HTTP API with fetch (https://openrouter.ai/docs/api-reference). The key is never logged.
const BASE = "https://openrouter.ai/api/v1";

// Fixed instructions go first in every prompt so provider-side prompt caching applies (ADR 0007).
const SYSTEM = {
  presentation:
    'You write outlines for explainer Presentations. Reply with JSON only: {"title": string, "boards": [{"nodes": [{"text": string (max 6 words, the label drawn in a box), "script": string (one or two spoken sentences)}]}]}. 3 to 6 nodes per board, in the order they are explained.',
  script: 'You write narration for a screen-recorded explainer. Reply with JSON only: {"scripts": string[]} with one or two spoken sentences per step label given, in the same order.',
};

async function call(key: string, path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function chatJson(key: string, model: string, system: string, user: string): Promise<unknown> {
  const res = await call(key, "/chat/completions", {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
  });
  const content = (await res.json()).choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter returned no message content");
  return JSON.parse(content);
}

async function once(key: string, model: string, req: ProviderRequest): Promise<AiJobIO[AiJobKind]["result"]> {
  switch (req.kind) {
    case "presentation": {
      const { topic, boards } = req.input as AiJobIO["presentation"]["input"];
      const outline = (await chatJson(key, model, SYSTEM.presentation, `Topic: ${topic}\nBoards: ${boards ?? 1}`)) as Outline;
      return { presentation: presentationFromOutline(outline) };
    }
    case "script": {
      const { stepLabels, context } = req.input as AiJobIO["script"]["input"];
      const out = (await chatJson(key, model, SYSTEM.script, `${context ? `Context: ${context}\n` : ""}Step labels:\n${stepLabels.map((l, i) => `${i + 1}. ${l}`).join("\n")}`)) as { scripts: string[] };
      return { scripts: out.scripts };
    }
    case "image": {
      const { prompt, width, height } = req.input as AiJobIO["image"]["input"];
      const res = await call(key, "/chat/completions", {
        model,
        modalities: ["image", "text"],
        messages: [{ role: "user", content: `${prompt}\nAspect ratio ${width}:${height}.` }],
      });
      const url: unknown = (await res.json()).choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const m = typeof url === "string" ? /^data:([^;]+);base64,(.+)$/.exec(url) : null;
      if (!m) throw new Error("OpenRouter returned no image");
      return { imageBase64: m[2], contentType: m[1] };
    }
    case "voiceover": {
      const { text } = req.input as AiJobIO["voiceover"]["input"];
      const res = await call(key, "/audio/speech", { model, input: text, response_format: "mp3" });
      // ponytail: the endpoint returns raw audio with no duration; estimated from the word count. Parse the MP3 if exactness matters.
      return { audioBase64: Buffer.from(await res.arrayBuffer()).toString("base64"), contentType: "audio/mpeg", durationMs: speechMs(text) };
    }
  }
}

export function openrouterProvider(key: string): AiProvider {
  return {
    name: "openrouter",
    async run<K extends AiJobKind>(req: ProviderRequest<K>) {
      let last: unknown;
      for (const model of req.models) {
        try {
          return { result: (await once(key, model, req)) as AiJobIO[K]["result"], model };
        } catch (e) {
          last = e; // Try the next model in the route.
        }
      }
      throw last instanceof Error ? last : new Error("No models configured");
    },
  };
}
