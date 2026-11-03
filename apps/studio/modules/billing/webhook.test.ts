import { afterEach, describe, expect, it, vi } from "vitest";
import { sign } from "./signature";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => { throw new Error("no database in this test"); } }));

const body = JSON.stringify({ meta: { event_name: "order_created", custom_data: { user_id: "u" } }, data: { id: "1", attributes: {} } });

describe("webhook refuses the public demo secret where it could forge payments", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("in production without real billing keys", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "demo");
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "demo");
    const { handleWebhook } = await import("./webhook");
    expect((await handleWebhook(body, sign(body, "demo"))).status).toBe(500);
  });

  it("with a real API key but the secret still demo", async () => {
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "real-key");
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "demo");
    const { handleWebhook } = await import("./webhook");
    expect((await handleWebhook(body, sign(body, "demo"))).status).toBe(500);
  });
});
