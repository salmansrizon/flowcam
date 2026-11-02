/** Splits a Script document into passages: blank lines or a `---` line end a passage, `#` heading marks are dropped. */
export function splitScript(text: string): string[] {
  const passages: string[] = [];
  let lines: string[] = [];
  const flush = () => {
    const p = lines.join(" ").replace(/\s+/g, " ").trim();
    if (p) passages.push(p);
    lines = [];
  };
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (line === "" || line === "---") flush();
    else lines.push(line.replace(/^#+\s*/, ""));
  }
  flush();
  return passages;
}
