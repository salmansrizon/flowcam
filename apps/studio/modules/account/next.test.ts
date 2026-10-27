import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

describe("safeNext", () => {
  it("keeps same-origin paths, with query and hash", () => {
    expect(safeNext("/record")).toBe("/record");
    expect(safeNext("/review/abc?x=1#y")).toBe("/review/abc?x=1#y");
  });
  it("falls back to / for anything else", () => {
    for (const bad of [null, undefined, "", "record", "https://evil.example", "http://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/a\nb", "\\\\evil.example"]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
