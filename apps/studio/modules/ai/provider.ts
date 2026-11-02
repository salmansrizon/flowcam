import "server-only";
import { demoProvider } from "./demo";
import { openrouterProvider } from "./openrouter";
import type { AiProvider } from "./types";

/** OpenRouter when a real key is set; the local demo adapter for a missing key or "demo" (never silently in production). */
export function aiProvider(): AiProvider {
  const key = process.env.OPENROUTER_API_KEY;
  const demo = !key || key === "demo";
  if (demo && process.env.NODE_ENV === "production" && process.env.FLOWCAM_ALLOW_DEMO_AI !== "1") {
    throw new Error("OPENROUTER_API_KEY is not set. Set it, or FLOWCAM_ALLOW_DEMO_AI=1 to allow fake AI results in production.");
  }
  return demo ? demoProvider : openrouterProvider(key);
}
