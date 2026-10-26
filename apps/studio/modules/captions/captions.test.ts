import { describe, expect, it } from "vitest";
import { InvalidDataError } from "@flowcam/domain";
import { defaultEdits, deleteRange, pieces, setSpeed } from "../editing/edits";
import { cuesFor, fromWhisper, parseTranscript, toSrt, toVtt, type Transcript } from "./captions";

const transcript: Transcript = {
  version: 1,
  clips: {
    a: [
      { start: 0, end: 1500, text: "Hello there." },
      { start: 2000, end: 3800, text: "This is   a request." },
    ],
    b: [{ start: 200, end: 1800, text: "It reaches the server." }],
  },
};
const edits = { ...defaultEdits([{ clipId: "a", durationMs: 4000 }, { clipId: "b", durationMs: 2000 }]), deadAir: [] };

describe("fromWhisper", () => {
  it("maps chunks in seconds to trimmed lines in ms", () => {
    const out = fromWhisper(
      {
        text: " Hi. Bye.",
        chunks: [
          { text: " Hi.", timestamp: [0, 1.24] },
          { text: "   ", timestamp: [1.24, 2] },
          { text: " Bye.", timestamp: [2.5, null] },
        ],
      },
      3100,
    );
    expect(out).toEqual([
      { start: 0, end: 1240, text: "Hi." },
      { start: 2500, end: 3100, text: "Bye." },
    ]);
  });

  it("clamps to the Clip and handles no chunks", () => {
    expect(fromWhisper({ text: "x", chunks: [{ text: "x", timestamp: [29, 31] }] }, 30000)).toEqual([{ start: 29000, end: 30000, text: "x" }]);
    expect(fromWhisper({ text: "" }, 1000)).toEqual([]);
  });
});

describe("cues after edits", () => {
  it("places lines on the output timeline", () => {
    expect(cuesFor(pieces(edits), transcript).map((c) => [c.start, c.end])).toEqual([
      [0, 1500],
      [2000, 3800],
      [4200, 5800],
    ]);
  });

  it("follows cuts and speed", () => {
    const e = setSpeed(deleteRange(edits, 500, 2500), 2, 2); // cuts 0.5–2.5 s of "a", "b" at 2x
    expect(cuesFor(pieces(e), transcript)).toEqual([
      { start: 0, end: 500, text: "Hello there." },
      { start: 500, end: 1800, text: "This is   a request." },
      { start: 2100, end: 2900, text: "It reaches the server." },
    ]);
  });
});

describe("SRT and VTT", () => {
  const cues = [
    { start: 0, end: 1500.4, text: "Hello there." },
    { start: 3_725_042, end: 3_727_000, text: "Two\nlines --> here" },
  ];
  it("formats SRT", () => {
    expect(toSrt(cues)).toBe("1\n00:00:00,000 --> 00:00:01,500\nHello there.\n\n2\n01:02:05,042 --> 01:02:07,000\nTwo lines --> here\n");
  });
  it("formats VTT", () => {
    expect(toVtt(cues)).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nHello there.\n\n01:02:05.042 --> 01:02:07.000\nTwo lines -> here\n");
  });
});

describe("parseTranscript", () => {
  it("accepts a Transcript and rejects bad ones", () => {
    expect(parseTranscript(JSON.parse(JSON.stringify(transcript)))).toEqual(transcript);
    expect(() => parseTranscript({ version: 1, clips: { a: [{ start: 2, end: 1, text: "x" }] } })).toThrow(InvalidDataError);
    expect(() => parseTranscript({ version: 2, clips: {} })).toThrow(InvalidDataError);
  });
});
