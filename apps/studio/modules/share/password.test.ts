import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("share passwords", () => {
  it("verifies the right password and rejects others", () => {
    const h = hashPassword("hunter2");
    expect(h).not.toContain("hunter2");
    expect(verifyPassword("hunter2", h)).toBe(true);
    expect(verifyPassword("hunter3", h)).toBe(false);
    expect(verifyPassword("", h)).toBe(false);
  });
  it("salts: the same password hashes differently", () => {
    expect(hashPassword("a")).not.toBe(hashPassword("a"));
  });
  it("rejects malformed stored values", () => {
    expect(verifyPassword("a", "")).toBe(false);
    expect(verifyPassword("a", "nocolon")).toBe(false);
  });
});
