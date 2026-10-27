import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

// The test runner (Node side) needs the secret key; playwright.config.ts also loads this file.
try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url));
} catch {
  // Env may already be set.
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed (apps/studio/.env.local).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TestUser = { id: string; email: string };

/** Creates a throwaway confirmed user `e2e+<random>@flowcam.test`. No email is sent. Delete it with `deleteTestUser`. */
export async function createTestUser(): Promise<TestUser> {
  const email = `e2e+${randomBytes(6).toString("hex")}@flowcam.test`;
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { id: data.user.id, email };
}

export async function deleteTestUser(user: TestUser) {
  const { error } = await admin().auth.admin.deleteUser(user.id);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}

/** A valid one-time code for the user, generated server-side so no email is sent. */
export async function generateOtp(email: string): Promise<string> {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.email_otp) throw new Error(`generateLink failed: ${error?.message}`);
  return data.properties.email_otp;
}

/** Stubs the browser's "send code" request so no email is ever sent; the code comes from `generateOtp` instead. */
export async function stubSendCode(page: Page) {
  await page.route("**/auth/v1/otp*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

/** Signs in through /sign-in with a server-generated code (no email is sent). */
export async function signInWithCode(page: Page, email: string, next?: string) {
  await stubSendCode(page);
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  await page.getByLabel("6-digit code").fill(await generateOtp(email));
  await page.getByRole("button", { name: "Verify code" }).click();
}

/** Creates a user and returns a page signed in as them. Call `cleanup()` (e.g. in afterAll) to delete the user. */
export async function signedInPage(page: Page): Promise<{ user: TestUser; cleanup: () => Promise<void> }> {
  const user = await createTestUser();
  await signInWithCode(page, user.email);
  await page.waitForURL((u) => u.pathname === "/");
  return { user, cleanup: () => deleteTestUser(user) };
}

/** Runs `npm run dev:grant-plan` for the user, as a developer would. */
export function grantPlan(email: string, plan: "pro" | "trial", days?: number) {
  execFileSync("npm", ["run", "dev:grant-plan", "--", email, plan, ...(days ? [String(days)] : [])], {
    cwd: new URL("../../..", import.meta.url),
    env: { ...process.env, FLOWCAM_ALLOW_GRANT: "1" },
    stdio: "pipe",
  });
}

/** Deletes every leftover `e2e+...` user (safety net after crashed runs). */
export async function deleteLeftoverTestUsers() {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email?.startsWith("e2e+")) await admin().auth.admin.deleteUser(u.id);
}
