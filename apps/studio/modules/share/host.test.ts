import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
const { chooseHost } = await import("./host");

describe("chooseHost", () => {
  it("uses demo for MUX_TOKEN_ID=demo or unset outside production", () => {
    expect(chooseHost({ MUX_TOKEN_ID: "demo" })).toBe("demo");
    expect(chooseHost({})).toBe("demo");
  });
  it("uses mux when a real token id is set", () => {
    expect(chooseHost({ MUX_TOKEN_ID: "abc", NODE_ENV: "production" })).toBe("mux");
  });
  it("refuses demo in production unless FLOWCAM_ALLOW_DEMO_SHARE=1", () => {
    expect(() => chooseHost({ MUX_TOKEN_ID: "demo", NODE_ENV: "production" })).toThrow(/FLOWCAM_ALLOW_DEMO_SHARE/);
    expect(() => chooseHost({ NODE_ENV: "production" })).toThrow();
    expect(chooseHost({ MUX_TOKEN_ID: "demo", NODE_ENV: "production", FLOWCAM_ALLOW_DEMO_SHARE: "1" })).toBe("demo");
  });
});
