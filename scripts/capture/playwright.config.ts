import { defineConfig, devices } from "@playwright/test";

// Captures the real Studio for the marketing site: `npm run capture:landing` writes apps/web/public/product/*.
// Needs ffmpeg on PATH. Not part of the test gates.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const port = Number(process.env.PORT ?? 3000);
// The camera preview shows a calm gradient instead of Chromium's green test pattern (the video uses Board only).
const camera = resolve(__dirname, "../../test-results/capture-camera.y4m");
mkdirSync(resolve(camera, ".."), { recursive: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "gradients=s=640x480:c0=0x3d4f63:c1=0x1aa7b8:speed=0.02:d=4", "-pix_fmt", "yuv420p", camera]);

export default defineConfig({
  testDir: ".",
  testMatch: "landing.capture.ts",
  timeout: 180_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    colorScheme: "light",
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${camera}`] },
  },
  webServer: {
    command: `npm run dev -w studio -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: { ...(process.env as Record<string, string>), NEXT_PUBLIC_PRO_LAUNCH_AT: "2999-01-01" /* the real pre-launch Studio: no sign-in */, OPENROUTER_API_KEY: "demo" },
  },
});
