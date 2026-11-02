import { describe, expect, it } from "vitest";
import { defaultEdits } from "./edits";
import { applyPreset, presetOf, validatePresets } from "./presets";

const good = presetOf("Look", { ...defaultEdits([]), aspect: "9:16", frame: { background: "blue", padding: 8, shadow: 30, gradient: { from: "#112233", to: "#aabbcc", angle: 90 } } });

describe("validatePresets", () => {
  it("keeps a good preset unchanged", () => {
    expect(validatePresets(JSON.parse(JSON.stringify([good])))).toEqual([good]);
  });
  it("drops bad entries instead of throwing", () => {
    const bad = [
      null,
      "x",
      { ...good, name: " " },
      { ...good, aspect: "2:1" },
      { ...good, frame: { ...good.frame, padding: 99 } },
      { ...good, frame: { ...good.frame, gradient: { from: "red", to: "#000000", angle: 1 } } },
      { ...good, color: { ...good.color, contrast: 500 } },
      { ...good, captions: { enabled: "yes", style: "classic", position: "top" } },
      { ...good, name: "Other" },
    ];
    expect(validatePresets(bad).map((p) => p.name)).toEqual(["Other"]);
    expect(validatePresets({ not: "an array" })).toEqual([]);
  });
  it("keeps the first of a repeated name", () => {
    expect(validatePresets([good, { ...good, aspect: "1:1" }])).toEqual([good]);
  });
});

describe("applyPreset", () => {
  it("changes only the look", () => {
    const e = defaultEdits([{ clipId: "c", durationMs: 1000 }]);
    const out = applyPreset(e, good);
    expect(out.aspect).toBe("9:16");
    expect(out.frame).toEqual(good.frame);
    expect(out.segments).toBe(e.segments);
  });
});
