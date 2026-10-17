import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // *.spec.ts files are Playwright tests.
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
