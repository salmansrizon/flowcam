import { describe, expect, it } from "vitest";
import { assignPassages, moveDivider } from "./assign";

describe("assignPassages", () => {
  it("one passage per Step", () => {
    expect(assignPassages(["a", "b"], 2)).toEqual({ texts: ["a", "b"], joined: false, unfilled: 0 });
  });
  it("extras join the last Step", () => {
    expect(assignPassages(["a", "b", "c", "d", "e"], 3)).toEqual({ texts: ["a", "b", "c d e"], joined: true, unfilled: 0 });
  });
  it("fewer passages leave later Steps unfilled", () => {
    expect(assignPassages(["a"], 3)).toEqual({ texts: ["a"], joined: false, unfilled: 2 });
  });
  it("handles no Steps or no passages", () => {
    expect(assignPassages(["a"], 0).texts).toEqual([]);
    expect(assignPassages([], 2)).toEqual({ texts: [], joined: false, unfilled: 2 });
  });
});

describe("moveDivider", () => {
  const t = ["One. Two.", "Three. Four."];
  it("up hands the last sentence down", () => {
    expect(moveDivider(t, 0, "up")).toEqual(["One.", "Two. Three. Four."]);
  });
  it("down pulls the next first sentence up", () => {
    expect(moveDivider(t, 0, "down")).toEqual(["One. Two. Three.", "Four."]);
  });
  it("never empties a row or goes out of range", () => {
    expect(moveDivider(["A.", "B."], 0, "up")).toEqual(["A.", "B."]);
    expect(moveDivider(["A.", "B. C."], 0, "up")).toEqual(["A.", "B. C."]);
    expect(moveDivider(t, 1, "up")).toBe(t);
  });
});
