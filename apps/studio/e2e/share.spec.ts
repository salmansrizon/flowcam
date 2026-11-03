import { expect, test, type Page } from "@playwright/test";
import { grantPlan, signedInPage } from "./auth";
import { seedPresentation } from "./seed";

// Share Links end to end with the demo video host (MUX_TOKEN_ID=demo). Needs the secret key to create users.
test.skip(!process.env.SUPABASE_SECRET_KEY, "SKIPPED: SUPABASE_SECRET_KEY is not set, so test users cannot be created.");

const presentation = (title: string) => ({
  version: 1,
  id: crypto.randomUUID(),
  title,
  themeId: "paper",
  boards: [{ id: crypto.randomUUID(), elements: [], steps: [] }],
});

async function share(page: Page, p: ReturnType<typeof presentation>, password?: string): Promise<string> {
  const res = await page.request.post("/api/share", {
    multipart: {
      video: { name: "flowcam.mp4", mimeType: "video/mp4", buffer: Buffer.from("not really an mp4, but the demo host stores any bytes") },
      title: p.title,
      presentation: JSON.stringify(p),
      ...(password ? { password } : {}),
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).id as string;
}

test("a Pro user shares; anyone watches, counts a view, passes the password gate and remixes", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("flowcam.onboarding", "done"));
  const { user, cleanup } = await signedInPage(page);
  try {
    grantPlan(user.email, "pro");
    const p = presentation("Shared volcano talk");
    await seedPresentation(page, p);

    await page.goto("/export?recording=none");
    await expect(page.getByRole("button", { name: "Share link" })).toBeVisible();

    const open = await share(page, p);
    const locked = await share(page, { ...p, title: "Locked talk" }, "s3cret");

    // Signed out: the video plays from a signed URL, and the visit is counted once.
    const anon = await browser.newContext();
    const view = await anon.newPage();
    await view.goto(`/s/${open}`);
    await expect(view.getByRole("heading", { name: "Shared volcano talk" })).toBeVisible();
    await expect(view.getByLabel("Shared video")).toHaveAttribute("src", /.+/);
    await view.reload();
    await expect(view.getByLabel("Shared video")).toBeVisible();

    await page.goto("/shares");
    const row = page.getByTestId("share-row").filter({ hasText: "Shared volcano talk" });
    await expect(row.getByTestId("views")).toHaveText("1"); // reload in the same session did not count again

    // Password gate: no video until the right password.
    const gated = await anon.newPage();
    await gated.goto(`/s/${locked}`);
    await expect(gated.getByLabel("Shared video")).toHaveCount(0);
    await gated.getByLabel("Password").fill("wrong");
    await gated.getByRole("button", { name: "Watch" }).click();
    await expect(gated.getByText("Wrong password.")).toBeVisible();
    await expect(gated.getByLabel("Shared video")).toHaveCount(0);
    await gated.getByLabel("Password").fill("s3cret");
    await gated.getByRole("button", { name: "Watch" }).click();
    await expect(gated.getByLabel("Shared video")).toHaveAttribute("src", /.+/);

    // Open Board and Remix into the viewer's library, then the editor.
    await view.getByRole("button", { name: "Open Board" }).click();
    await expect(view.getByLabel("Board")).toBeVisible();
    await view.getByRole("button", { name: "Remix" }).click();
    await expect(view).toHaveURL(/\/$/);
    await expect(view.getByLabel("Presentation title")).toHaveValue("Shared volcano talk");
    await anon.close();

    // Delete: the link is gone.
    await page.goto("/shares");
    expect((await page.request.delete(`/api/share/${open}`)).ok()).toBe(true);
    expect((await page.request.get(`/s/${open}`)).status()).toBe(404);
  } finally {
    await cleanup();
  }
});

test("a Free user sees the upgrade panel instead of sharing", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("flowcam.onboarding", "done"));
  const { cleanup } = await signedInPage(page);
  try {
    await page.goto("/export?recording=none");
    await page.getByRole("button", { name: "Share link" }).click();
    await expect(page.getByRole("dialog", { name: /Share links/ })).toBeVisible();
    expect((await page.request.post("/api/share", { multipart: { title: "x" } })).status()).toBe(403);
  } finally {
    await cleanup();
  }
});
