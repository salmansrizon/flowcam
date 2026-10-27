import { describe, expect, it } from "vitest";
import { defaultEdits, parseEdits, setSpeed, split } from "./edits";
import { addText, deleteText, MIN_TEXT_MS, moveText, resizeText, textSpan, textsOf, updateText } from "./texts";

const clips = [
  { clipId: "a", durationMs: 4000 },
  { clipId: "b", durationMs: 2000 },
];
const len = (id: string) => clips.find((c) => c.clipId === id)!.durationMs;
const base = defaultEdits(clips);

describe("text overlays", () => {
  it("adds a 3 s overlay pinned to the Clip under the playhead, and it validates", () => {
    const e = addText(base, 1000, len, "t1");
    expect(textsOf(e)).toEqual([expect.objectContaining({ id: "t1", clipId: "a", start: 1000, end: 4000, text: "Text", font: "sans", color: "#ffffff", box: true })]);
    expect(() => parseEdits(JSON.parse(JSON.stringify(e)), ["a", "b"])).not.toThrow();
  });

  it("stays within the Clip near its end and keeps the minimum length", () => {
    const e = addText(base, 4000 + 1900, len, "t");
    const t = textsOf(e)[0];
    expect(t.clipId).toBe("b");
    expect(t.end).toBeLessThanOrEqual(2000);
    expect(t.end - t.start).toBeGreaterThanOrEqual(MIN_TEXT_MS);
  });

  it("moves in output time, keeping its length", () => {
    let e = addText(base, 0, len, "t");
    e = moveText(e, "t", 500, len);
    expect(textsOf(e)[0]).toMatchObject({ clipId: "a", start: 500, end: 3500 });
  });

  it("move clamps inside the Clip", () => {
    let e = addText(base, 0, len, "t");
    e = moveText(e, "t", 3900, len);
    expect(textsOf(e)[0]).toMatchObject({ start: 1000, end: 4000 });
    e = moveText(e, "t", 5000, len);
    const t = textsOf(e)[0];
    expect(t.clipId).toBe("b");
    expect(t.start).toBeGreaterThanOrEqual(0);
    expect(t.end).toBeLessThanOrEqual(2000);
  });

  it("resizes either edge, never below the minimum nor past the Clip", () => {
    let e = addText(base, 1000, len, "t");
    e = resizeText(e, "t", "end", 1100, len);
    expect(textsOf(e)[0]).toMatchObject({ start: 1000, end: 1000 + MIN_TEXT_MS });
    e = resizeText(e, "t", "end", 3900, len);
    expect(textsOf(e)[0].end).toBe(3900);
    e = resizeText(e, "t", "start", 3999, len);
    expect(textsOf(e)[0].start).toBe(3900 - MIN_TEXT_MS);
    e = resizeText(e, "t", "start", -50, len);
    expect(textsOf(e)[0].start).toBe(0);
  });

  it("is carried by trims and speed changes", () => {
    let e = addText(base, 1000, len, "t");
    expect(textSpan(e, textsOf(e)[0])).toEqual({ at: 1000, length: 3000 });
    e = setSpeed(e, 0, 2);
    expect(textSpan(e, textsOf(e)[0])).toEqual({ at: 500, length: 1500 });
    e = split(e, 500);
    expect(textSpan(e, textsOf(e)[0])).not.toBeNull();
  });

  it("updates and deletes by id; unknown ids change nothing", () => {
    let e = addText(base, 0, len, "t");
    e = updateText(e, "t", { text: "Hi", size: 80 });
    expect(textsOf(e)[0]).toMatchObject({ text: "Hi", size: 80 });
    expect(updateText(e, "nope", { text: "x" })).toBe(e);
    expect(deleteText(e, "nope")).toBe(e);
    expect(textsOf(deleteText(e, "t"))).toEqual([]);
  });
});
