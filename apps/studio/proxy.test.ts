import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const call = (path: string) => proxy(new NextRequest(`http://studio.test${path}`));

describe("proxy before the Pro launch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("closes Pro APIs (404) and pages (redirect home); the Free Studio stays open", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_PRO_LAUNCH_AT", "2999-01-01");
    for (const p of ["/api/billing/checkout", "/api/ai/jobs", "/api/credits", "/api/share/abc/unlock"]) expect((await call(p)).status, p).toBe(404);
    for (const p of ["/sign-in", "/billing", "/credits", "/shares", "/s/abcdefghij"]) expect((await call(p)).headers.get("location"), p).toBe("http://studio.test/");
    for (const p of ["/", "/library", "/record", "/export", "/sign-inside", "/settings", "/api/billing/webhook", "/api/ai/worker"]) expect((await call(p)).headers.get("x-middleware-next"), p).toBe("1");
  });

  it("opens at the launch moment, and fails closed in production without a date", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_PRO_LAUNCH_AT", "2000-01-01");
    expect((await call("/api/ai/jobs")).headers.get("x-middleware-next")).toBe("1");
    vi.stubEnv("NEXT_PUBLIC_PRO_LAUNCH_AT", "");
    vi.stubEnv("NODE_ENV", "production");
    expect((await call("/api/ai/jobs")).status).toBe(404);
  });
});
