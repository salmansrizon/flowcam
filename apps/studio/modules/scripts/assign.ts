export type Assignment = { texts: string[]; joined: boolean; unfilled: number };

/** Gives passage i to Step i. Extra passages join the last Step; Steps beyond the passages are left alone (`unfilled`). */
export function assignPassages(passages: string[], stepCount: number): Assignment {
  if (stepCount <= 0 || !passages.length) return { texts: [], joined: false, unfilled: Math.max(stepCount, 0) };
  const texts = passages.slice(0, stepCount);
  const extra = passages.slice(stepCount);
  if (extra.length) texts[stepCount - 1] = [texts[stepCount - 1], ...extra].join(" ");
  return { texts, joined: extra.length > 0, unfilled: Math.max(stepCount - passages.length, 0) };
}

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean);

/**
 * Moves the divider between rows `i` and `i+1` by one sentence: `up` hands row i's last sentence to row i+1,
 * `down` hands row i+1's first sentence to row i. A row never gives away its only sentence.
 */
export function moveDivider(texts: string[], i: number, dir: "up" | "down"): string[] {
  if (i < 0 || i + 1 >= texts.length) return texts;
  const from = dir === "up" ? i : i + 1;
  const src = sentences(texts[from]);
  if (src.length < 2) return texts;
  const moved = dir === "up" ? src.pop()! : src.shift()!;
  const out = [...texts];
  out[from] = src.join(" ");
  out[dir === "up" ? i + 1 : i] = dir === "up" ? `${moved} ${texts[i + 1]}` : `${texts[i]} ${moved}`;
  return out;
}
