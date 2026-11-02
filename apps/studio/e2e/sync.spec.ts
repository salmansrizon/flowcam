import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const envFile = "apps/studio/.env.local"; // Playwright runs from the repo root
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY;

test.skip(!secret, "SKIPPED: SUPABASE_SECRET_KEY is not set, so test users cannot be created.");

// A 1x1 PNG, so the test needs no fixture file.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const HASH = createHash("sha256").update(PNG).digest("hex");

const admin = () => createClient(url, secret!, { auth: { persistSession: false } });
let userId = "";

/**
 * Signs in on the Node side and hands the browser the exact session cookies the Supabase browser client reads.
 * (The /sign-in page is built elsewhere; this keeps Sync tests independent of it.)
 */
async function signInContext(context: BrowserContext, baseURL: string, email: string, password: string) {
  let cookies: { name: string; value: string }[] = [];
  const sb = createServerClient(url, publishable, { cookies: { getAll: () => [], setAll: (list) => void (cookies = list) } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, url: baseURL })));
}

const status = (page: Page) => page.locator('[aria-label="Sync status"]') // a modal dialog hides it from the role tree;
const title = (page: Page) => page.getByLabel("Presentation title");
const cloudTitles = async () =>
  ((await admin().from("presentations").select("data").eq("owner_id", userId)).data ?? []).map((r) => (r.data as { title: string }).title).sort();
const opfsAssets = (page: Page) =>
  page.evaluate(async () => {
    try {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("assets");
      const names: string[] = [];
      for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string]> }).entries()) names.push(name);
      return names;
    } catch {
      return [];
    }
  });

test.afterEach(async () => {
  if (userId) await admin().auth.admin.deleteUser(userId); // cascades to presentations and assets rows
  if (userId) await admin().storage.from("assets").remove([`${userId}/${HASH}`]);
  userId = "";
});

test("a Pro user syncs between two browsers, and an offline edit on both sides raises a conflict", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const email = `e2e+${crypto.randomUUID()}@flowcam.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  const end = new Date(Date.now() + 30 * 864e5).toISOString();
  expect((await admin().from("subscriptions").upsert({ user_id: userId, plan: "pro", status: "active", current_period_end: end })).error).toBeNull();

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await signInContext(ctxA, baseURL!, email, password);
  await signInContext(ctxB, baseURL!, email, password);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // A edits (a title and an Image) and syncs.
  await a.goto("/");
  await expect(title(a)).toHaveValue("Untitled"); // the editor ignores edits until the Presentation has loaded
  await title(a).fill("Alpha");
  await a.getByLabel("Upload image").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(cloudTitles, { timeout: 20_000 }).toEqual(["Alpha"]);
  await expect(status(a)).toHaveText("Saved to cloud", { timeout: 20_000 });
  expect((await admin().from("assets").select("sha256").eq("owner_id", userId)).data).toEqual([{ sha256: HASH }]);

  // B gets the change, including the Image.
  await b.goto("/");
  await expect(title(b)).toHaveValue("Alpha");
  await expect(status(b)).toHaveText("Saved to cloud");
  expect(await opfsAssets(b)).toEqual([HASH]);

  // Both edit offline; A syncs first, then B is refused as stale.
  await ctxA.setOffline(true);
  await ctxB.setOffline(true);
  await title(a).fill("Alpha from A");
  await title(b).fill("Alpha from B");
  await expect(status(a)).toHaveText("Offline", { timeout: 20_000 });
  await expect(status(b)).toHaveText("Offline", { timeout: 20_000 });
  await ctxA.setOffline(false);
  await expect.poll(cloudTitles, { timeout: 20_000 }).toEqual(["Alpha from A"]);
  await ctxB.setOffline(false);
  const dialog = b.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(status(b)).toHaveText("Conflict");
  expect(await cloudTitles()).toEqual(["Alpha from A"]); // nothing overwritten

  // Keep both: B's edit survives as a copy, and B adopts the cloud version.
  await dialog.getByRole("button", { name: "Keep both" }).click();
  await expect(title(b)).toHaveValue("Alpha from A");
  expect(await cloudTitles()).toEqual(["Alpha from A", "Alpha from B (copy)"]);
  await ctxA.close();
  await ctxB.close();
});

test("signed-out visitors make no Sync requests", async ({ page }) => {
  const sync: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(".supabase.co")) sync.push(r.url());
  });
  await page.goto("/");
  await title(page).fill("Local only");
  await page.waitForTimeout(2000);
  expect(sync).toEqual([]);
  await expect(status(page)).toHaveCount(0);
});
