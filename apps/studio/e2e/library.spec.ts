import { existsSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const envFile = "apps/studio/.env.local"; // Playwright runs from the repo root
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY;

const cards = (page: Page) => page.getByTestId("presentation-card");
const card = (page: Page, title: string) => cards(page).filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const newItem = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
};

test("create Blank and Template, rename, duplicate, delete with confirmation, open", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByText("No Presentations yet")).toBeVisible();

  await newItem(page, "Blank");
  await expect(page.getByLabel("Presentation title")).toHaveValue("Untitled");
  await page.getByRole("link", { name: "Presentations" }).click();
  await expect(card(page, "Untitled")).toHaveCount(1);

  await newItem(page, "How Browsers Work");
  await expect(page.getByLabel("Presentation title")).toHaveValue("How Browsers Work");
  await page.getByRole("link", { name: "Presentations" }).click();
  await expect(cards(page)).toHaveCount(2);

  // Rename
  await card(page, "Untitled").getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Rename Presentation").fill("Roadmap");
  await page.getByLabel("Rename Presentation").press("Enter");
  await expect(card(page, "Roadmap")).toHaveCount(1);

  // Duplicate: a copy appears, and the open Presentation does not change.
  await card(page, "Roadmap").getByRole("button", { name: "Duplicate" }).click();
  await expect(card(page, "Roadmap (copy)")).toHaveCount(1);
  await expect(cards(page)).toHaveCount(3);

  // Delete needs confirmation.
  await card(page, "Roadmap (copy)").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(cards(page)).toHaveCount(3);
  await card(page, "Roadmap (copy)").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(cards(page)).toHaveCount(2);

  // Open
  await card(page, "Roadmap").getByRole("button", { name: "Open" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByLabel("Presentation title")).toHaveValue("Roadmap");
});

test("a Presentation from before the library is migrated and listed", async ({ page }) => {
  await page.goto("/library");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const p = { version: 1, id: crypto.randomUUID(), title: "Old deck", themeId: "paper", boards: [{ id: crypto.randomUUID(), elements: [], steps: [] }] };
    const w = await (await root.getFileHandle("presentation.json", { create: true })).createWritable();
    await w.write(JSON.stringify(p));
    await w.close();
  });
  await page.reload();
  await expect(card(page, "Old deck")).toHaveCount(1);
  const legacyLeft = await page.evaluate(async () => {
    try {
      await (await navigator.storage.getDirectory()).getFileHandle("presentation.json");
      return true;
    } catch {
      return false;
    }
  });
  expect(legacyLeft).toBe(false);
});

test.describe("Pro", () => {
  test.skip(!secret, "SKIPPED: SUPABASE_SECRET_KEY is not set, so test users cannot be created.");
  const admin = () => createClient(url, secret!, { auth: { persistSession: false } });
  let userId = "";
  test.afterEach(async () => {
    if (userId) await admin().auth.admin.deleteUser(userId);
    userId = "";
  });

  test("a cloud-only Presentation can be downloaded, and deleting removes the cloud copy", async ({ context, page, baseURL }) => {
    test.setTimeout(90_000);
    const email = `e2e+${crypto.randomUUID()}@flowcam.test`;
    const password = crypto.randomUUID();
    const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const end = new Date(Date.now() + 30 * 864e5).toISOString();
    expect((await admin().from("subscriptions").upsert({ user_id: userId, plan: "pro", status: "active", current_period_end: end })).error).toBeNull();
    const id = crypto.randomUUID();
    const deck = { version: 1, id, title: "From the cloud", themeId: "paper", boards: [{ id: crypto.randomUUID(), elements: [], steps: [] }] };
    expect((await admin().from("presentations").insert({ id, owner_id: userId, data: deck })).error).toBeNull();

    let cookies: { name: string; value: string }[] = [];
    const sb = createServerClient(url, publishable, { cookies: { getAll: () => [], setAll: (list) => void (cookies = list) } });
    expect((await sb.auth.signInWithPassword({ email, password })).error).toBeNull();
    await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, url: baseURL! })));

    await page.goto("/library");
    const remote = page.getByTestId("cloud-card").filter({ hasText: "From the cloud" });
    await expect(remote).toHaveCount(1, { timeout: 20_000 });
    await expect(cards(page)).toHaveCount(0);
    await remote.getByRole("button", { name: "Download" }).click();
    await expect(card(page, "From the cloud")).toHaveCount(1);
    await expect(remote).toHaveCount(0);

    await card(page, "From the cloud").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toContainText("your cloud");
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(cards(page)).toHaveCount(0);
    await expect
      .poll(async () => (await admin().from("presentations").select("deleted_at").eq("id", id).single()).data?.deleted_at, { timeout: 10_000 })
      .not.toBeNull();

    // It does not come back after a reload.
    await page.reload();
    await expect(page.getByText("No Presentations yet")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("cloud-card")).toHaveCount(0);
  });
});
