import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// ADR 0018: the renderer must run unchanged in the editor, export worker and desktop app.
test("renderer depends on no UI framework", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
  expect(deps.filter((d) => /^(react|react-dom|vue|svelte|solid-js|preact)$/.test(d))).toEqual([]);
});
