import { defineConfig, devices } from "@playwright/test";

// The account tests need the Supabase secret key on the Node side.
try {
  process.loadEnvFile("apps/studio/.env.local");
} catch {
  // Env may already be set.
}

// PORT lets two worktrees run integration tests at once. The marketing site runs on the next port.
const port = Number(process.env.PORT ?? 3000);
const webPort = port + 1;
const env = process.env as Record<string, string>;

export default defineConfig({
  use: {
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  projects: [
    { name: "studio", testDir: "apps/studio/e2e", use: { baseURL: `http://localhost:${port}` } },
    { name: "web", testDir: "apps/web/e2e", use: { baseURL: `http://localhost:${webPort}` } },
  ],
  webServer: [
    {
      command: `npm run dev -w studio -- --port ${port}`,
      url: `http://localhost:${port}`,
      // Never test against whatever else is on the port (e.g. apps/web).
      reuseExistingServer: false,
      // Pro is open (a past launch date); tests of the closed state move the browser clock before it.
      // The e2e AI tests expect the demo provider's results, whatever key .env.local holds.
      env: { ...env, OPENROUTER_API_KEY: "demo", NEXT_PUBLIC_PRO_LAUNCH_AT: "2000-01-01", NEXT_PUBLIC_WEB_URL: `http://localhost:${webPort}` },
    },
    {
      command: `npm run dev -w web -- --port ${webPort}`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: false,
      // A fixed launch moment; tests move the browser clock to either side of it.
      env: {
        ...env,
        NEXT_PUBLIC_PRO_LAUNCH_AT: "2030-01-01T00:00:00Z",
        NEXT_PUBLIC_STUDIO_URL: `http://localhost:${port}`,
        SUPABASE_URL: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      },
    },
  ],
});
