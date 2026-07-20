import { test, expect } from "@chromatic-com/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Main page - default", async ({ page }) => {
  await expect(page.locator("#dropzone")).toBeVisible();
});

test("Main page - file queued", async ({ page }) => {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(32),
  });
  await expect(page.locator("#file-list .file-item")).toBeVisible();
});
