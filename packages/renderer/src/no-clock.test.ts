import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

// ADR 0002: a render is a pure function of (board, view, timeMs).
test("renderer sources use no clock, frame loop or unseeded randomness", () => {
  const dir = new URL(".", import.meta.url);
  const banned = /Date\.now|performance\.now|requestAnimationFrame|Math\.random/;
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) => banned.test(readFileSync(new URL(f, dir), "utf8")));
  expect(offenders).toEqual([]);
});
