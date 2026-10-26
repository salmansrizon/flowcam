import { describe, expect, it } from "vitest";
import { defaultEdits, pieces, setSpeed, setTransition } from "../editing/edits";
import { buildProgram, enhance, loudness, TARGET_LUFS } from "./audio";

const sr = 16000;
const tone = (seconds: number, amp: number, hz = 440) => Float32Array.from({ length: seconds * sr }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));

describe("loudness levelling", () => {
  it("measures a full-scale 1 kHz sine near -3 LUFS", () => {
    expect(loudness(tone(3, 1, 1000), sr)).toBeCloseTo(-3.01, 0);
  });

  it("levels quiet and loud speech-like signals to about -16 LUFS without clipping", () => {
    for (const amp of [0.02, 0.9]) {
      const x = enhance(tone(4, amp, 300), sr);
      expect(Math.abs(loudness(x, sr) - TARGET_LUFS)).toBeLessThan(1.5);
      expect(Math.max(...x.map(Math.abs))).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
    }
  });

  it("removes low rumble relative to the voice", () => {
    // Amplitude of a frequency in the last second (the filters have settled by then).
    const amp = (x: Float32Array, hz: number) => {
      let re = 0, im = 0;
      for (let i = x.length - sr; i < x.length; i++) {
        re += x[i] * Math.cos((2 * Math.PI * hz * i) / sr);
        im += x[i] * Math.sin((2 * Math.PI * hz * i) / sr);
      }
      return (2 * Math.hypot(re, im)) / sr;
    };
    const voice = tone(3, 0.3, 300);
    const x = voice.map((v, i) => v + 0.3 * Math.sin((2 * Math.PI * 30 * i) / sr));
    enhance(x, sr);
    expect(amp(x, 30) / amp(x, 300)).toBeLessThan(0.2);
  });
});

describe("buildProgram", () => {
  const edits = { ...defaultEdits([{ clipId: "a", durationMs: 1000 }, { clipId: "b", durationMs: 1000 }]), deadAir: [] };
  const audio = new Map([
    ["a", { samples: new Float32Array(sr).fill(0.5), sampleRate: sr }],
    ["b", { samples: new Float32Array(sr / 2).fill(-0.25), sampleRate: sr / 2 }],
  ]);

  it("lays Clips end to end, converting the sample rate", () => {
    const out = buildProgram(pieces(edits), audio, sr, 2 * sr);
    expect(out[100]).toBe(0.5);
    expect(out[sr + 100]).toBeCloseTo(-0.25);
  });

  it("speeds a Clip up", () => {
    const ps = pieces(setSpeed(edits, 1, 2));
    const out = buildProgram(ps, audio, sr, 1.5 * sr);
    expect(out[Math.round(1.4 * sr)]).toBeCloseTo(-0.25);
  });

  it("dips to silence at a fade", () => {
    const out = buildProgram(pieces(setTransition(edits, 1, "fade")), audio, sr, 2 * sr);
    expect(Math.abs(out[sr])).toBeLessThan(0.01);
    expect(out[sr / 2]).toBe(0.5);
  });
});
