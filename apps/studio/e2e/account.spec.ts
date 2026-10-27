import { expect, test } from "@playwright/test";
import { createTestUser, deleteLeftoverTestUsers, deleteTestUser, grantPlan, signInWithCode, stubSendCode, type TestUser } from "./auth";

let user: TestUser;
test.beforeEach(async () => {
  user = await createTestUser();
});
test.afterEach(async () => {
  await deleteTestUser(user);
});
test.afterAll(deleteLeftoverTestUsers);

test("signed out: Sign in button, and the studio stays usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Flowcam Studio" })).toBeVisible();
});

test("sign in with a code, see the email and Free plan, sign out", async ({ page }) => {
  await signInWithCode(page, user.email);
  await page.waitForURL((u) => u.pathname === "/");
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByText(user.email).last()).toBeVisible();
  await expect(page.getByTestId("plan")).toHaveText("Free");
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("a wrong code shows an error and stays on the page", async ({ page }) => {
  await stubSendCode(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("One-time code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("wrong or has expired");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();
});

test("a granted plan shows in the menu", async ({ page }) => {
  grantPlan(user.email, "pro");
  await signInWithCode(page, user.email);
  await page.waitForURL((u) => u.pathname === "/");
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByTestId("plan")).toHaveText("Pro");
});

test("next= goes back to a same-origin path", async ({ page }) => {
  await signInWithCode(page, user.email, "/record");
  await page.waitForURL((u) => u.pathname === "/record");
});

test("next= to another origin is ignored", async ({ page }) => {
  await signInWithCode(page, user.email, "https://evil.example");
  await page.waitForURL((u) => u.pathname === "/");
  expect(new URL(page.url()).hostname).toBe("localhost");
});
