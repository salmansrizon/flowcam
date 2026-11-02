import { expect, test } from "vitest";
import type { Presentation } from "@flowcam/domain";
import { digest } from "./sync";

// The cloud's jsonb does not keep key order; the same content must still count as unchanged.
test("digest ignores key order", async () => {
  const a = { version: 1, id: "p", title: "T", themeId: "paper", boards: [{ id: "b", elements: [], steps: [] }] } as Presentation;
  const b = JSON.parse('{"boards":[{"steps":[],"elements":[],"id":"b"}],"themeId":"paper","title":"T","id":"p","version":1}') as Presentation;
  expect(await digest(a)).toBe(await digest(b));
  expect(await digest(a)).not.toBe(await digest({ ...a, title: "U" }));
});
