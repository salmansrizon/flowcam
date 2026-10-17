import { defineConfig, devices } from "@playwright/test";

// PORT lets two worktrees run integration tests at once.
const port = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "apps/studio/e2e",
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  webServer: {
    command: `npm run dev -w studio -- --port ${port}`,
    url: `http://localhost:${port}`,
    // Never test against whatever else is on the port (e.g. apps/web).
    reuseExistingServer: false,
  },
});
