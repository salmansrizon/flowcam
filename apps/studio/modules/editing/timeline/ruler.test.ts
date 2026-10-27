import { expect, it } from "vitest";
import { tickLabel, tickStep } from "./ruler";

it("ticks get finer as the scale grows", () => {
  expect(tickStep(0.1)).toBeGreaterThan(tickStep(1));
  expect(tickStep(0.2)).toBe(500);
});

it("labels read as m:ss with fractions for fine ticks", () => {
  expect(tickLabel(65_000, 1000)).toBe("1:05");
  expect(tickLabel(1500, 500)).toBe("0:01.5");
  expect(tickLabel(1250, 50)).toBe("0:01.25");
});
