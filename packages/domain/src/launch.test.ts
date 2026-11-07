import { describe, expect, it } from "vitest";
import { originFromEnv, parseLaunchAt, proOpen } from "./launch";

describe("parseLaunchAt", () => {
  it("reads a UTC date or a zoned date-time", () => {
    expect(parseLaunchAt("2026-12-07")?.toISOString()).toBe("2026-12-07T00:00:00.000Z");
    expect(parseLaunchAt(" 2026-12-07T09:30:00Z ")?.toISOString()).toBe("2026-12-07T09:30:00.000Z");
    expect(parseLaunchAt("2026-12-07T09:30:00+06:00")?.toISOString()).toBe("2026-12-07T03:30:00.000Z");
  });
  it("rejects unset, zone-less and invalid values", () => {
    for (const v of [undefined, null, "", "soon", "2026-12-07T09:30", "2026-13-40", "2026-02-30T00:00:00Z"]) expect(parseLaunchAt(v)).toBeNull();
  });
});

describe("proOpen", () => {
  const at = "2026-12-07T00:00:00Z";
  it("opens at the launch moment", () => {
    expect(proOpen(at, new Date("2026-12-06T23:59:59Z"), true)).toBe(false);
    expect(proOpen(at, new Date("2026-12-07T00:00:00Z"), true)).toBe(true);
  });
  it("without a valid date: open in development, closed in production", () => {
    expect(proOpen(undefined, new Date(), false)).toBe(true);
    expect(proOpen("garbage", new Date(), true)).toBe(false);
  });
});

describe("originFromEnv", () => {
  it("uses the value without a trailing slash, or the fallback in development; production needs it", () => {
    expect(originFromEnv("X", "https://app.example.com/", "http://localhost:3000", true)).toBe("https://app.example.com");
    expect(originFromEnv("X", undefined, "http://localhost:3000", false)).toBe("http://localhost:3000");
    expect(() => originFromEnv("X", "", "http://localhost:3000", true)).toThrow(/X is not set/);
  });
});
