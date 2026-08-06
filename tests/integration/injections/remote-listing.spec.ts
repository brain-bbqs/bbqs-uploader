import { test, expect } from "@playwright/test";

// Exercises the "?test&remote_listing=N" live test injection documented in docs/README.md:
// combined with mock_upload's fake files, it fabricates an archive listing that marks the first
// N staged files (by path) as already uploaded, with the first of them reporting a different
// size so one row shows "Changed". No network is involved.
test.describe("?test&remote_listing", () => {
  test("marks the first N mock files as already on the archive", async ({ page }) => {
    await page.goto("/?test&mock_upload=6&remote_listing=2");

    await expect(page.locator("#file-list .file-item")).toHaveCount(6);
    await expect(page.locator("#remote-banner")).toContainText("Already on EMBER: 2 files");
    await expect(page.locator("#file-list .badge", { hasText: "Changed" })).toHaveCount(1);
    await expect(page.locator("#file-list .badge", { hasText: "Uploaded" })).toHaveCount(1);
    await expect(page.locator("#file-list .badge", { hasText: "New" })).toHaveCount(4);

    // The size-matched file starts deselected, so only 5 of 6 are staged for upload.
    await expect(page.locator("#selection-summary")).toContainText("5 of 6 files");
    await expect(page.locator("#upload-all-btn")).toContainText("Upload 5 files");
  });

  test("with nothing staged, auto-opens the read-only Load from EMBER browse", async ({ page }) => {
    await page.goto("/?test&remote_listing=5");

    await expect(page.locator("#remote-banner")).toContainText("On EMBER: 5 files");
    await expect(page.locator("#file-list .file-item")).toHaveCount(5);
    // Read-only: no checkboxes, nothing staged to upload.
    await expect(page.locator("#file-list .select-check:visible")).toHaveCount(0);
    await expect(page.locator("#upload-bar")).toBeHidden();
    await expect(page.locator("#selection-bar")).toBeHidden();
  });

  test("with nothing staged, a zero listing shows the empty-dataset browse banner", async ({ page }) => {
    await page.goto("/?test&remote_listing=0");

    await expect(page.locator("#remote-banner")).toContainText("Nothing uploaded yet");
    await expect(page.locator("#remote-banner")).toContainText("currently empty");
    await expect(page.locator("#file-list .file-item")).toHaveCount(0);
    await expect(page.locator("#upload-bar")).toBeHidden();
  });

  test("a zero listing renders the nothing-uploaded-yet banner with no badges", async ({ page }) => {
    await page.goto("/?test&mock_upload=3&remote_listing=0");

    await expect(page.locator("#remote-banner")).toContainText("Nothing uploaded yet");
    await expect(page.locator("#file-list .badge:visible")).toHaveCount(0);
    await expect(page.locator("#selection-summary")).toContainText("3 of 3 files");
  });
});
