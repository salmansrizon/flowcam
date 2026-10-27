import { expect, test } from "vitest";
import { MAX_HISTORY, emptyHistory, record, redo, undo } from "./history";

test("undo and redo walk back and forth through the recorded states", () => {
  const h = record(record(emptyHistory<number>(), 1), 2); // states 1 -> 2 -> now 3
  const u1 = undo(h, 3)!;
  expect(u1.value).toBe(2);
  const u2 = undo(u1.history, u1.value)!;
  expect(u2.value).toBe(1);
  expect(undo(u2.history, u2.value)).toBeNull();
  const r1 = redo(u2.history, u2.value)!;
  expect(r1.value).toBe(2);
  const r2 = redo(r1.history, r1.value)!;
  expect(r2.value).toBe(3);
  expect(redo(r2.history, r2.value)).toBeNull();
});

test("a new edit clears redo", () => {
  const u = undo(record(emptyHistory<number>(), 1), 2)!;
  expect(u.history.future).toEqual([2]);
  expect(record(u.history, 1).future).toEqual([]);
});

test("history is capped at 100 entries, dropping the oldest", () => {
  let h = emptyHistory<number>();
  for (let i = 0; i < MAX_HISTORY + 20; i++) h = record(h, i);
  expect(h.past).toHaveLength(MAX_HISTORY);
  expect(h.past[0]).toBe(20);
  expect(h.past.at(-1)).toBe(MAX_HISTORY + 19);
});
