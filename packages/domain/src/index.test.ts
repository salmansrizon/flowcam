import { expect, test } from "vitest";
import { LOG_SCHEMA_VERSION } from "@flowcam/domain";

test("domain resolves through the workspace", () => {
  expect(LOG_SCHEMA_VERSION).toBe(1);
});
