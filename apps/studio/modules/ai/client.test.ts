import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, formatPrice, loadPending, startJob, waitForJob } from "./client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

describe("startJob", () => {
  it("returns the Job id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ id: "j1" })));
    expect(await startJob("script", "standard", { stepLabels: ["a"] })).toBe("j1");
  });
  it("throws an AiError carrying the status and message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Not enough Credits" }, 402)));
    await expect(startJob("script", "best", { stepLabels: [] })).rejects.toMatchObject({ status: 402, message: "Not enough Credits" });
  });
});

describe("waitForJob", () => {
  it("polls until succeeded, reporting each status", async () => {
    const seq = ["queued", "running", "succeeded"];
    const f = vi.fn(async () => {
      const status = seq.shift();
      return json({ id: "j", kind: "script", status, result: status === "succeeded" ? { scripts: ["x"] } : undefined });
    });
    vi.stubGlobal("fetch", f);
    const seen: string[] = [];
    const r = await waitForJob("j", (s) => seen.push(s), { intervalMs: 1 });
    expect(r).toEqual({ scripts: ["x"] });
    expect(seen).toEqual(["queued", "running", "succeeded"]);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("throws the Job's error when it fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ status: "failed", error: "model down" })));
    await expect(waitForJob("j", undefined, { intervalMs: 1 })).rejects.toThrow("model down");
  });
  it("times out when the Job never finishes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ status: "running" })));
    const e = await waitForJob("j", undefined, { intervalMs: 5, timeoutMs: 30 }).catch((x) => x);
    expect(e).toBeInstanceOf(AiError);
    expect(e.message).toMatch(/too long/);
  });
  it("polls every second and gives up after 3 minutes by default", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => json({ status: "running" }));
    vi.stubGlobal("fetch", f);
    const p = waitForJob("j").catch((x) => x);
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 1000);
    expect((await p).message).toMatch(/too long/);
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(170);
    expect(f.mock.calls.length).toBeLessThanOrEqual(181);
    vi.useRealTimers();
  });
});

describe("formatPrice", () => {
  it("formats per job and per minute, singular and plural", () => {
    expect(formatPrice({ credits: 5, unit: "job" })).toBe("5 Credits");
    expect(formatPrice({ credits: 1, unit: "job" })).toBe("1 Credit");
    expect(formatPrice({ credits: 6, unit: "minute" })).toBe("6 Credits per minute");
    expect(formatPrice(undefined)).toBe("");
  });
});

describe("loadPending", () => {
  it("is null when storage is unavailable or holds junk", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{not json" });
    expect(loadPending("x")).toBeNull();
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(loadPending("x")).toBeNull();
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ id: "a", ctx: "b" }) });
    expect(loadPending("x")).toEqual({ id: "a", ctx: "b" });
  });
});
