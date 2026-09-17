import { test, expect } from "@chromatic-com/playwright";
import { seedSignedIn } from "../integration/helpers/auth";
import { dropFile } from "../integration/helpers/drop";
import { VIEWPORTS, expectNoHorizontalOverflow } from "../integration/helpers/layout";

// One test per viewport rather than one per Playwright project: see VIEWPORTS for why. The Chromatic
// fixture snapshots the page after each test body, named by the test's title, so the viewport in
// the title is what tells the captures apart.
for (const viewport of VIEWPORTS) {
  const size = { width: viewport.width, height: viewport.height };

  test(`Main page - default [${viewport.name}]`, async ({ page }) => {
    await page.setViewportSize(size);
    // The upload card (dropzone included) only shows once signed in; the default, signed-out
    // landing view instead leads with the sign-in button.
    await page.goto("/");
    await expect(page.locator("#oauth-signin-btn")).toBeVisible();
    await expect(page.locator("#folder-card")).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test(`Main page - file queued [${viewport.name}]`, async ({ page }) => {
    await page.setViewportSize(size);
    await seedSignedIn(page);
    // A real scan of this 32-byte file finishes in milliseconds, racing the end-of-test snapshot
    // between the mid-scan and scan-finished states; the freeze_scan injection pins the row
    // mid-scan (scanning starts at "Upload" now) so the capture always shows the "Scanning" badge
    // and Cancel button.
    await page.goto("/?test&freeze_scan");
    await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });
    await page.locator("#upload-all-btn").click();
    const row = page.locator("#file-list .file-item");
    await expect(row).toBeVisible();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Scanning");
    await expect(page.locator("#cancel-all-btn")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
