import { describe, expect, it } from "vitest";
import { aspectSize, colorFilter, gradientEndpoints, temperatureTint, wrapText } from "./look";

describe("aspectSize", () => {
  it("keeps the long edge", () => {
    expect(aspectSize("16:9", 1920)).toEqual([1920, 1080]);
    expect(aspectSize("9:16", 1920)).toEqual([1080, 1920]);
    expect(aspectSize("1:1", 1920)).toEqual([1920, 1920]);
    expect(aspectSize("4:3", 1920)).toEqual([1920, 1440]);
    expect(aspectSize("9:16", 3840)).toEqual([2160, 3840]);
  });
});

describe("gradientEndpoints", () => {
  const nearAll = (got: ReturnType<typeof gradientEndpoints>, want: number[]) =>
    [got.x0, got.y0, got.x1, got.y1].forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
  it("runs bottom to top at 0 and left to right at 90", () => {
    nearAll(gradientEndpoints(0, 200, 100), [100, 100, 100, 0]);
    nearAll(gradientEndpoints(90, 200, 100), [0, 50, 200, 50]);
  });
  it("reaches the corners at 135 on a square", () => {
    nearAll(gradientEndpoints(135, 100, 100), [0, 0, 100, 100]);
  });
});

describe("wrapText", () => {
  const measure = (s: string) => s.length;
  it("wraps at the width and keeps newlines", () => {
    expect(wrapText("aaa bbb ccc", 7, measure)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("a\nb", 10, measure)).toEqual(["a", "b"]);
  });
  it("puts an over-long word on its own line", () => {
    expect(wrapText("a bbbbbbbbbb c", 5, measure)).toEqual(["a", "bbbbbbbbbb", "c"]);
  });
});

describe("colour correction", () => {
  it("is null when neutral", () => {
    expect(colorFilter({ brightness: 0, contrast: 0, saturation: 0, temperature: 50 })).toBeNull();
    expect(temperatureTint(0)).toBeNull();
  });
  it("maps -100..100 to a CSS filter and a tint", () => {
    expect(colorFilter({ brightness: 50, contrast: -100, saturation: 100, temperature: 0 })).toBe("brightness(1.5) contrast(0) saturate(2)");
    expect(temperatureTint(100)).toContain("255, 140, 0");
    expect(temperatureTint(-100)).toContain("0, 120, 255");
  });
});
