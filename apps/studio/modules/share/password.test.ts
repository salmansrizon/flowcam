import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("share passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("hunter2");
    expect(h).not.toContain("hunter2");
    expect(await verifyPassword("hunter2", h)).toBe(true);
    expect(await verifyPassword("hunter3", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });
  it("salts: the same password hashes differently", async () => {
    expect(await hashPassword("a")).not.toBe(await hashPassword("a"));
  });
  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("a", "")).toBe(false);
    expect(await verifyPassword("a", "nocolon")).toBe(false);
  });
});
