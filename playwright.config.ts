import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "apps/studio/e2e",
  use: {
    baseURL: "http://localhost:3000",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  webServer: {
    command: "npm run dev -w studio",
    url: "http://localhost:3000",
    // Never test against whatever else is on port 3000 (e.g. apps/web).
    reuseExistingServer: false,
  },
});
