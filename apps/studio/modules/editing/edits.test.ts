import { describe, expect, it } from "vitest";
import { InvalidDataError } from "@flowcam/domain";
import {
  defaultEdits,
  deleteRange,
  fadeAt,
  layoutAt,
  outputDuration,
  parseEdits,
  pieces,
  setLayout,
  setSpeed,
  setTransition,
  split,
  toOutput,
  markAt,
  toSource,
  trim,
  type Edits,
} from "./edits";
import { DEAD_AIR_PAD_MS, detectDeadAir } from "./dead-air";

const clips = [
  { clipId: "a", durationMs: 4000 },
  { clipId: "b", durationMs: 2000 },
];
const base = (): Edits => ({ ...defaultEdits(clips), deadAir: [] });

describe("pieces and time mapping", () => {
  it("plays every Clip whole by default", () => {
    const ps = pieces(base());
    expect(ps.map((p) => [p.clipId, p.at, p.length])).toEqual([
      ["a", 0, 4000],
      ["b", 4000, 2000],
    ]);
    expect(outputDuration(ps)).toBe(6000);
  });

  it("cuts dead air only while trimming is on", () => {
    const e = { ...base(), deadAir: [{ clipId: "a", start: 1000, end: 2500 }] };
    expect(outputDuration(pieces(e))).toBe(4500);
    expect(outputDuration(pieces({ ...e, trimDeadAir: false }))).toBe(6000);
    const ps = pieces(e);
    expect(toOutput(ps, "a", 1200)).toBeNull();
    expect(toOutput(ps, "a", 2500)).toBe(1000);
    expect(toSource(ps, 1000)).toMatchObject({ clipId: "a", t: 2500 });
    expect(toSource(ps, 2600)).toMatchObject({ clipId: "b", t: 100 });
  });

  it("pins a Step inside cut time to where its Clip resumes", () => {
    const ps = pieces({ ...base(), deadAir: [{ clipId: "a", start: 0, end: 1500 }, { clipId: "b", start: 1500, end: 2000 }] });
    expect(markAt(ps, "a", 200)).toBe(0); // Cut from the start: shows where Clip a begins playing.
    expect(markAt(ps, "a", 2000)).toBe(toOutput(ps, "a", 2000));
    expect(markAt(ps, "b", 1800)).toBeNull(); // Nothing of Clip b plays after it.
  });

  it("maps through speed changes both ways", () => {
    const e = setSpeed(base(), 1, 2);
    const ps = pieces(e);
    expect(outputDuration(ps)).toBe(5000);
    expect(toOutput(ps, "b", 1000)).toBe(4500);
    expect(toSource(ps, 4500)).toMatchObject({ clipId: "b", t: 1000 });
    // Past the end: the last moment.
    expect(toSource(ps, 99_999)).toMatchObject({ clipId: "b", t: 2000 });
  });
});

describe("operations", () => {
  it("splits the Segment under the playhead", () => {
    const e = split(base(), 1500);
    expect(e.segments.map((s) => [s.clipId, s.start, s.end])).toEqual([
      ["a", 0, 1500],
      ["a", 1500, 4000],
      ["b", 0, 2000],
    ]);
    expect(outputDuration(pieces(e))).toBe(6000);
    // Splitting at an existing edge changes nothing.
    expect(split(e, 1500)).toBe(e);
  });

  it("splits at the right Clip moment when dead air is trimmed", () => {
    const e = { ...base(), deadAir: [{ clipId: "a", start: 1000, end: 2000 }] };
    expect(split(e, 1500).segments[0]).toMatchObject({ clipId: "a", start: 0, end: 2500 });
  });

  it("deletes an output range across Segments", () => {
    const e = deleteRange(base(), 3000, 4500);
    expect(e.segments.map((s) => [s.clipId, s.start, s.end])).toEqual([
      ["a", 0, 3000],
      ["b", 500, 2000],
    ]);
    expect(outputDuration(pieces(e))).toBe(4500);
  });

  it("deletes in source time on a sped-up Segment", () => {
    const e = deleteRange(setSpeed(base(), 0, 2), 500, 1000);
    expect(e.segments[0]).toMatchObject({ start: 0, end: 1000 });
    expect(e.segments[1]).toMatchObject({ start: 2000, end: 4000 });
    expect(outputDuration(pieces(e))).toBe(3500); // 1000 + 2000 of "a" at 2x, then 2000 of "b"
  });

  it("keeps trims inside the Clip", () => {
    const e = trim(base(), 1, -50, 9000, 2000);
    expect(e.segments[1]).toMatchObject({ start: 0, end: 2000 });
    const tight = trim(base(), 1, 1990, 1995, 2000);
    expect(tight.segments[1].end - tight.segments[1].start).toBeGreaterThanOrEqual(100);
  });

  it("clamps speed to 0.5x–2x", () => {
    expect(setSpeed(base(), 0, 5).segments[0].speed).toBe(2);
    expect(setSpeed(base(), 0, 0.1).segments[0].speed).toBe(0.5);
  });

  it("fades to black around a fade Transition", () => {
    const ps = pieces(setTransition(base(), 1, "fade"));
    expect(fadeAt(ps, 4000)).toBe(1);
    expect(fadeAt(ps, 3875)).toBeCloseTo(0.5);
    expect(fadeAt(ps, 3000)).toBe(0);
    expect(fadeAt(pieces(base()), 4000)).toBe(0);
  });

  it("changes the Layout from a moment on", () => {
    let e = setLayout(base(), 1000, "camera-only");
    e = setLayout(e, 4500, "board-only");
    const order = ["a", "b"];
    expect(layoutAt(e, order, "a", 500)).toBe("auto");
    expect(layoutAt(e, order, "a", 3999)).toBe("camera-only");
    expect(layoutAt(e, order, "b", 0)).toBe("camera-only");
    expect(layoutAt(e, order, "b", 600)).toBe("board-only");
  });
});

describe("parseEdits", () => {
  const ids = ["a", "b"];
  it("accepts what it writes", () => {
    const e = setLayout(setTransition(split(base(), 1000), 1, "fade"), 10, "bubble");
    expect(parseEdits(JSON.parse(JSON.stringify(e)), ids)).toEqual(e);
    expect(parseEdits(JSON.parse(JSON.stringify(defaultEdits(clips))), ids).deadAir).toBeNull();
  });

  it("accepts frame corners in range and rejects them outside it", () => {
    const e = base();
    expect(parseEdits({ ...e, frame: { ...e.frame, corners: 32 } }, ids).frame.corners).toBe(32);
    expect(() => parseEdits({ ...e, frame: { ...e.frame, corners: 999 } }, ids)).toThrow(InvalidDataError);
  });

  it.each([
    ["wrong version", (e: Edits) => ({ ...e, version: 2 })],
    ["unknown Clip", (e: Edits) => ({ ...e, segments: [{ ...e.segments[0], clipId: "zzz" }] })],
    ["empty range", (e: Edits) => ({ ...e, segments: [{ ...e.segments[0], end: 0 }] })],
    ["speed out of range", (e: Edits) => ({ ...e, segments: [{ ...e.segments[0], speed: 3 }] })],
    ["bad transition", (e: Edits) => ({ ...e, segments: [{ ...e.segments[0], transition: "wipe" }] })],
    ["bad layout", (e: Edits) => ({ ...e, layouts: [{ clipId: "a", t: 0, layout: "grid" }] })],
    ["bad caption style", (e: Edits) => ({ ...e, captions: { ...e.captions, style: "comic" } })],
    ["padding too large", (e: Edits) => ({ ...e, frame: { ...e.frame, padding: 50 } })],
    ["not an object", () => "edits"],
  ])("rejects %s", (_, mutate) => {
    expect(() => parseEdits(mutate(base()), ids)).toThrow(InvalidDataError);
  });
});

describe("detectDeadAir", () => {
  const sr = 8000;
  /** Tone and silence in turns: [ms, loud?][]. */
  function signal(parts: [number, boolean][]) {
    const total = parts.reduce((n, [ms]) => n + (ms * sr) / 1000, 0);
    const out = new Float32Array(total);
    let i = 0;
    for (const [ms, loud] of parts) {
      for (let k = 0; k < (ms * sr) / 1000; k++, i++) out[i] = loud ? 0.3 * Math.sin((2 * Math.PI * 440 * i) / sr) : 0.001 * Math.sin(i);
    }
    return out;
  }

  it("finds silences over 1.5 s and keeps 0.3 s of padding", () => {
    const ranges = detectDeadAir(signal([[1000, true], [2000, false], [1000, true], [1000, false], [500, true], [3000, false]]), sr);
    expect(ranges).toEqual([
      { start: 1000 + DEAD_AIR_PAD_MS, end: 3000 - DEAD_AIR_PAD_MS },
      { start: 5500 + DEAD_AIR_PAD_MS, end: 8500 - DEAD_AIR_PAD_MS },
    ]);
  });

  it("finds nothing in continuous sound", () => {
    expect(detectDeadAir(signal([[4000, true]]), sr)).toEqual([]);
  });
});
