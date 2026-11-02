import { describe, expect, it } from "vitest";
import { splitScript } from "./split";

describe("splitScript", () => {
  it("splits on blank lines, joins single newlines", () => {
    expect(splitScript("one\ntwo\n\n\n\nthree")).toEqual(["one two", "three"]);
  });
  it("--- forces a break without blank lines, whitespace allowed", () => {
    expect(splitScript("a\n  ---  \nb\n---\nc")).toEqual(["a", "b", "c"]);
  });
  it("trims and drops empty passages", () => {
    expect(splitScript("\n  a  \n---\n---\n\n   \n---\n")).toEqual(["a"]);
    expect(splitScript("")).toEqual([]);
  });
  it("keeps heading text without the # signs", () => {
    expect(splitScript("# Intro\nHello\n\n### Part two")).toEqual(["Intro Hello", "Part two"]);
  });
  it("handles CRLF and CR endings", () => {
    expect(splitScript("a\r\nb\r\n\r\nc\r\n---\r\nd")).toEqual(["a b", "c", "d"]);
    expect(splitScript("a\r\rb")).toEqual(["a", "b"]);
  });
});
