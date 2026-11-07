import { describe, expect, it } from "vitest";
import { timeLeft } from "./countdown";

const at = new Date("2030-01-01T00:00:00Z");

describe("timeLeft", () => {
  it("splits the time left into days, hours, minutes and seconds", () => {
    expect(timeLeft(at, new Date("2029-12-30T21:58:57Z"))).toEqual({ days: 1, hours: 2, minutes: 1, seconds: 3 });
  });
  it("rounds part-seconds up, and is null at and after the moment", () => {
    expect(timeLeft(at, new Date("2029-12-31T23:59:59.600Z"))).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
    expect(timeLeft(at, at)).toBeNull();
    expect(timeLeft(at, new Date("2031-01-01T00:00:00Z"))).toBeNull();
  });
});
