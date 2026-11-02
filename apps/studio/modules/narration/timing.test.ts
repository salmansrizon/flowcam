import { describe, expect, test } from "vitest";
import { parseClipLog, type Board, type Presentation, type Step } from "@flowcam/domain";
import { fillSilence, missingNarrations, narratedClipLog, setNarration, timeline } from "./timing";

const step = (id: string, narration?: Step["narration"]): Step => ({ id, kind: "reveal", elementIds: [], ...(narration ? { narration } : {}) });
const board = (id: string, steps: Step[]): Board => ({ id, elements: [], steps });
const deck = (...boards: Board[]): Presentation => ({ version: 1, id: "p", title: "T", themeId: "paper", boards });
const voice = { kind: "voice", assetId: "abc", durationMs: 1500 } as const;
const quiet = { kind: "silence", durationMs: 2000 } as const;

describe("narrated timing", () => {
  const p = deck(board("b1", [step("s1", voice), step("s2", quiet)]), board("b2", [step("s3", quiet)]));

  test("each Narration starts where the previous ended", () => {
    const t = timeline(p);
    expect(t.startsMs).toEqual([0, 1500, 3500]);
    expect(t.totalMs).toBe(5500);
  });

  test("ClipLog shows Step j from the start of Narration j, passes parseClipLog, and survives JSON", () => {
    const log = narratedClipLog(p, "c1");
    expect(log.durationMs).toBe(5500);
    expect(log.startStep).toBe(0);
    expect(log.events).toEqual([
      { t: 0, type: "step", index: 1 },
      { t: 1500, type: "step", index: 2 },
      { t: 3500, type: "board", index: 1 },
      { t: 3500, type: "step", index: 1 },
    ]);
    expect(parseClipLog(JSON.parse(JSON.stringify(log)))).toEqual(log);
  });

  test("refuses to time a Step without a Narration", () => {
    expect(() => timeline(deck(board("b", [step("s1", voice), step("s2")])))).toThrow("Step 2");
  });

  test("lists Steps without a Narration and fills them with silence", () => {
    const q = deck(board("b1", [step("s1", voice), step("s2")]), board("b2", [step("s3")]));
    expect(missingNarrations(q).map((m) => m.label)).toEqual(["Board 1, Step 2", "Board 2, Step 1"]);
    const filled = fillSilence(q, 3000);
    expect(missingNarrations(filled)).toEqual([]);
    expect(filled.boards[0].steps[0].narration).toEqual(voice);
    expect(timeline(filled).totalMs).toBe(1500 + 3000 + 3000);
  });

  test("setNarration sets and clears one Step", () => {
    const b = setNarration(board("b", [step("s1"), step("s2")]), 1, quiet);
    expect(b.steps[1].narration).toEqual(quiet);
    expect(setNarration(b, 1, null).steps[1]).not.toHaveProperty("narration");
  });
});
