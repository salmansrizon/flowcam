import { defineConfig, devices } from "@playwright/test";

// The account tests need the Supabase secret key on the Node side.
try {
  process.loadEnvFile("apps/studio/.env.local");
} catch {
  // Env may already be set.
}

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
