import { test, expect } from "@playwright/test";

/**
 * Full product flow through the real UI, in a browser:
 *   register → create config (NMC preset) → generate → save → publish →
 *   open the public share link in a COOKIELESS context → download the PDF.
 *
 * Runs against the production server with the in-process pglite DB
 * (E2E_PGLITE=1, wired in playwright.config.ts). The same flow is also covered
 * browser-free by `pnpm e2e:http` for environments without browser system deps.
 */
test("register → config → generate → save → publish → share (cookieless) → pdf", async ({
  page,
  context,
  baseURL,
}) => {
  const email = `pw-${Date.now()}@example.com`;

  // Register
  await page.goto("/register");
  await page.getByLabel("Organization name").fill("PW Org");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");

  // Create a named schedule from the NMC preset → lands on the config workspace
  await page.getByRole("button", { name: "New schedule" }).click();
  await page.getByLabel("Schedule name").fill("E2E Test Roster");
  await page.getByRole("button", { name: "Create schedule" }).click();
  await page.waitForURL("**/configs/**");

  // Generate (Web Worker) then save (server re-validates)
  await page.getByRole("button", { name: "Generate schedule" }).click();
  const saveBtn = page.getByRole("button", { name: "Save schedule" });
  await expect(saveBtn).toBeEnabled({ timeout: 30_000 });
  await saveBtn.click();
  await expect(page.getByText(/Saved as version 1/)).toBeVisible({ timeout: 30_000 });

  // Publish the saved version
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/published/i)).toBeVisible({ timeout: 15_000 });

  // Create a share link (the button copies the URL to the clipboard)
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Share link" }).click();
  await page.waitForTimeout(500);
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(shareUrl).toContain("/s/");

  // Open the share link in a brand-new COOKIELESS context
  const fresh = await page.context().browser()!.newContext();
  const freshPage = await fresh.newPage();
  await freshPage.goto(shareUrl);
  await expect(freshPage.getByText(/Full roster/)).toBeVisible();
  await expect(freshPage.getByText(/Intern 2\b/).first()).toBeVisible();
  await fresh.close();

  // PDF download still works for the authenticated user
  const scheduleIdMatch = shareUrl.match(/\/s\/([^/]+)/);
  expect(scheduleIdMatch).not.toBeNull();
  const pdfResp = await page.request.get(
    `${baseURL}/api/schedules/${(await firstScheduleId(page, baseURL!))}/pdf`,
  );
  expect(pdfResp.status()).toBe(200);
  expect(pdfResp.headers()["content-type"]).toContain("application/pdf");
});

// Helper: ask the API for the first schedule id of the user's first config.
async function firstScheduleId(page: import("@playwright/test").Page, baseURL: string) {
  const cfgs = await (await page.request.get(`${baseURL}/api/configs`)).json();
  const configId = cfgs.configs[0].id;
  const list = await (
    await page.request.get(`${baseURL}/api/configs/${configId}/schedules`)
  ).json();
  return list.schedules[0].id;
}
