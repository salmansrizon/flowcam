import { parsePresentation } from "@flowcam/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiJobKind, AiProvider, ProviderRequest } from "./types";

vi.mock("server-only", () => ({}));

// A tiny in-memory stand-in for the two tables the worker touches.
type Row = Record<string, unknown>;
const tables: { ai_jobs: Row[]; ai_job_config: Row[] } = { ai_jobs: [], ai_job_config: [] };
function query(name: keyof typeof tables) {
  let rows = tables[name];
  let patch: Row | null = null;
  const q = {
    select: () => q,
    update: (p: Row) => ((patch = p), q),
    eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q),
    lt: (k: string, v: string) => ((rows = rows.filter((r) => (r[k] as string) < v)), q),
    order: () => q,
    limit: () => q,
    single: async () => (rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "none" } }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => {
      if (patch) rows.forEach((r) => Object.assign(r, patch));
      return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(ok);
    },
  };
  return q;
}
vi.mock("../../lib/supabase/admin", () => ({ supabaseAdmin: () => ({ from: (n: keyof typeof tables) => query(n) }) }));
const holds = { charged: [] as number[], released: [] as number[] };
vi.mock("../credits/server", () => ({
  chargeHold: async (id: number) => void holds.charged.push(id),
  releaseHold: async (id: number) => void holds.released.push(id),
}));

import { demoProvider, speechMs } from "./demo";
import { openrouterProvider } from "./openrouter";
import { parseInput, voiceoverMinutes } from "./jobs";
import { runJob, validateResult } from "./worker";

const config = [
  { kind: "script", quality: "standard", models: ["cheap", "mid"] },
  { kind: "script", quality: "best", models: ["strong", "stronger"] },
  { kind: "image", quality: "standard", models: ["img"] },
];
const job = (over: Row = {}) => ({ id: "j1", kind: "script", quality: "standard", input: { stepLabels: ["a", "b"] }, status: "queued", attempts: 0, credits: 1, hold_id: 7, ...over });
const provider = (fn: (req: ProviderRequest) => unknown): AiProvider & { calls: ProviderRequest[] } => {
  const calls: ProviderRequest[] = [];
  return { name: "demo", calls, run: (async (req: ProviderRequest) => (calls.push(req), fn(req))) as AiProvider["run"] };
};

beforeEach(() => {
  tables.ai_jobs = [job()];
  tables.ai_job_config = structuredClone(config);
  holds.charged = [];
  holds.released = [];
});

describe("worker", () => {
  it("runs a Job with its route's models, stores result and model, and charges the Hold once", async () => {
    const p = provider(() => ({ result: { scripts: ["x", "y"] }, model: "cheap" }));
    await runJob("j1", p);
    await runJob("j1", p); // second call: already settled, nothing happens
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0].models).toEqual(["cheap", "mid"]);
    expect(tables.ai_jobs[0]).toMatchObject({ status: "succeeded", model: "cheap", result: { scripts: ["x", "y"] } });
    expect(holds).toEqual({ charged: [7], released: [] });
  });

  it("escalates a Standard text Job that fails validation to Best's first model, at Standard's price", async () => {
    const p = provider((r) => ({ result: { scripts: r.quality === "best" ? ["x", "y"] : ["only one"] }, model: r.models[0] }));
    await runJob("j1", p);
    expect(p.calls.map((c) => [c.quality, c.models])).toEqual([["standard", ["cheap", "mid"]], ["best", ["strong"]]]);
    expect(tables.ai_jobs[0]).toMatchObject({ status: "succeeded", model: "strong", credits: 1 });
    expect(holds.charged).toEqual([7]);
  });

  it("does not escalate a Best Job or an image Job", async () => {
    tables.ai_jobs = [job({ id: "b", quality: "best" }), job({ id: "i", kind: "image", input: { prompt: "p", width: 64, height: 64 } })];
    const p = provider(() => ({ result: { scripts: [], imageBase64: "" }, model: "m" }));
    await runJob("b", p);
    await runJob("i", p);
    expect(p.calls.every((c) => c.quality === "best" || c.kind === "image")).toBe(true);
    expect(p.calls.filter((c) => c.kind === "script")).toHaveLength(3); // 3 attempts, no escalation extra
  });

  it("retries up to 3 attempts in total, then fails and releases the Hold once", async () => {
    const p = provider(() => {
      throw new Error("boom");
    });
    await runJob("j1", p);
    expect(p.calls).toHaveLength(3);
    expect(tables.ai_jobs[0]).toMatchObject({ status: "failed", error: "boom", attempts: 3 });
    expect(holds).toEqual({ charged: [], released: [7] });
  });

  it("succeeds on a retry", async () => {
    let n = 0;
    const p = provider(() => {
      if (++n < 2) throw new Error("flaky");
      return { result: { scripts: ["x", "y"] }, model: "cheap" };
    });
    await runJob("j1", p);
    expect(tables.ai_jobs[0]).toMatchObject({ status: "succeeded", attempts: 2 });
  });

  it("ignores a Job that is not queued", async () => {
    tables.ai_jobs = [job({ status: "running" })];
    const p = provider(() => ({ result: {}, model: "m" }));
    await runJob("j1", p);
    expect(p.calls).toHaveLength(0);
  });
});

describe("validation", () => {
  it("accepts demo results for every kind", async () => {
    const res = (kind: AiJobKind, input: unknown) => demoProvider.run({ kind, quality: "standard", input: input as never, models: ["demo"] });
    const pres = await res("presentation", { topic: "Photosynthesis" } as never);
    expect(() => validateResult("presentation", {}, pres.result)).not.toThrow();
    expect(parsePresentation((pres.result as { presentation: unknown }).presentation).title).toBe("Photosynthesis");
    const scripts = await res("script", { stepLabels: ["a", "b"] } as never);
    expect(() => validateResult("script", { stepLabels: ["a", "b"] }, scripts.result)).not.toThrow();
    const img = await res("image", { prompt: "cat", width: 1920, height: 1080 } as never);
    expect(Buffer.from((img.result as { imageBase64: string }).imageBase64, "base64").subarray(1, 4).toString()).toBe("PNG");
    const vo = await res("voiceover", { text: "hello there" } as never);
    expect(() => validateResult("voiceover", {}, vo.result)).not.toThrow();
    expect(vo.model).toBe("demo");
  });

  it("rejects bad results", () => {
    expect(() => validateResult("presentation", {}, { presentation: { version: 1 } })).toThrow();
    expect(() => validateResult("script", { stepLabels: ["a", "b"] }, { scripts: ["a"] })).toThrow();
    expect(() => validateResult("script", { stepLabels: ["a"] }, { scripts: [1] })).toThrow();
    expect(() => validateResult("image", {}, { imageBase64: "" })).toThrow();
    expect(() => validateResult("voiceover", {}, {})).toThrow();
  });

  it("validates input per kind", () => {
    expect(() => parseInput("presentation", { topic: "" })).toThrow();
    expect(() => parseInput("script", { stepLabels: [] })).toThrow();
    expect(() => parseInput("image", { prompt: "x", width: 10, height: 100 })).toThrow();
    expect(parseInput("voiceover", { text: "hi" })).toEqual({ text: "hi" });
  });
});

describe("voiceover", () => {
  it("prices per started minute at 150 words a minute", () => {
    const words = (n: number) => Array(n).fill("w").join(" ");
    expect(voiceoverMinutes(words(1))).toBe(1);
    expect(voiceoverMinutes(words(150))).toBe(1);
    expect(voiceoverMinutes(words(151))).toBe(2);
    expect(voiceoverMinutes(words(450))).toBe(3);
    expect(speechMs(words(75))).toBe(30_000);
  });
});

describe("openrouter adapter", () => {
  it("tries models in order, falling back on errors, and sends fixed instructions first", async () => {
    const bodies: { model: string; messages: { role: string }[] }[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      if (body.model === "a") return new Response("down", { status: 503 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ scripts: ["x"] }) } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await openrouterProvider("k").run({ kind: "script", quality: "standard", input: { stepLabels: ["l"] }, models: ["a", "b", "c"] });
    expect(out).toEqual({ result: { scripts: ["x"] }, model: "b" });
    expect(bodies.map((b) => b.model)).toEqual(["a", "b"]);
    expect(bodies[1].messages[0].role).toBe("system");
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("throws the last error when every model fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(openrouterProvider("k").run({ kind: "script", quality: "standard", input: { stepLabels: ["l"] }, models: ["a"] })).rejects.toThrow(/500/);
  });

  it("reads images and audio from their endpoints", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.endsWith("/audio/speech")
        ? new Response(new Uint8Array([1, 2, 3]))
        : Response.json({ choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,QUJD" } }] } }] })));
    const img = await openrouterProvider("k").run({ kind: "image", quality: "best", input: { prompt: "p", width: 64, height: 64 }, models: ["m"] });
    expect(img.result).toEqual({ imageBase64: "QUJD", contentType: "image/png" });
    const vo = await openrouterProvider("k").run({ kind: "voiceover", quality: "best", input: { text: "hello" }, models: ["m"] });
    expect(vo.result).toMatchObject({ audioBase64: "AQID", contentType: "audio/mpeg" });
  });
});
