import { describe, expect, it } from "vitest";
import type { Presentation } from "@flowcam/domain";
import { cloudOnly, copyTitle } from "./list";

const c = (id: string, updatedAt: string) => ({ id, version: 1, updatedAt, data: {} as Presentation });

describe("library helpers", () => {
  it("names copies", () => expect(copyTitle("Deck")).toBe("Deck (copy)"));
  it("lists only cloud Presentations missing locally, newest first", () => {
    const out = cloudOnly([c("a", "2026-01-01T00:00:00Z"), c("b", "2026-03-01T00:00:00Z"), c("c", "2026-02-01T00:00:00Z")], ["a"]);
    expect(out.map((x) => x.id)).toEqual(["b", "c"]);
  });
});
