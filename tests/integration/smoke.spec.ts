import { test, expect } from "@playwright/test";
import { seedSignedIn } from "./helpers/auth";
import { dropFile } from "./helpers/drop";

test.describe("BBQS uploader shell", () => {
  test("renders branding, version, and the connection form", async ({ page }) => {
    // Wide enough that the corner watermark and footer bar stay in their fixed, viewport-anchored
    // spots instead of the narrow-screen fallback (see the max-width: 1400px query in style.css)
    // that hides the watermark and flows the footer into the page to avoid overlapping cards.
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedSignedIn(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/BBQS Uploader/);
    await expect(page.locator(".header-logo")).toBeVisible();
    await expect(page.locator(".brand-watermark-logo")).toBeVisible();
    const versionLink = page.locator("#version-indicator");
    await expect(versionLink).toHaveText(/^v\d+\.\d+\.\d+$/);
    await expect(versionLink).toHaveAttribute("href", "https://github.com/brain-bbqs/bbqs-uploader");
    const conLink = page.locator('a.con-brand-link[href="https://centerforopenneuroscience.org"]');
    await expect(conLink).toBeVisible();
    await expect(page.locator("#dropzone")).toBeVisible();
  });

  // The dropzone (and the rest of the upload card) is hidden for a signed-out visitor, so a file
  // can only end up queued while signed out via a mid-session sign-out: it's queued while signed
  // in, then the user signs out before clicking "Upload". `configProblems()` still catches that at
  // upload time and blocks the file instead of sending it.
  test("blocks an uploaded file if signed out before upload", async ({ page }) => {
    await seedSignedIn(page);
    await page.goto("/");
    await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toBeHidden();
    await page.locator("#oauth-avatar").click();
    await page.locator("#oauth-signout-btn").click();
    await expect(page.locator("#dropzone")).toBeHidden();

    await page.locator("#upload-all-btn").click();
    await expect(row.locator('[data-role="badge"]')).toHaveText("Blocked");
    await expect(row.locator('[data-role="status"]')).toContainText("Not signed in");
  });

  // Signing out mid-session leaves the dataset card's message behind, but the picker's <select>
  // keeps its options even while hidden, so the card heading's "View on EMBER" button used to
  // stay visible (still pointing at the last selected dataset) until the page was reloaded.
  test("drops the dataset view link on a mid-session sign-out", async ({ page }) => {
    await seedSignedIn(page);
    await page.goto("/");
    await expect(page.locator("#view-dataset-link")).toBeVisible();

    await page.locator("#oauth-avatar").click();
    await page.locator("#oauth-signout-btn").click();

    await expect(page.locator("#dandiset-message")).toHaveText("Please sign in to see your incoming datasets.");
    await expect(page.locator("#view-dataset-link")).toBeHidden();
    await expect(page.locator("#load-remote-btn")).toBeHidden();
  });

  test("accepts non-mp4 files (queued, not rejected, once signed in)", async ({ page }) => {
    await seedSignedIn(page);
    await page.goto("/");
    await dropFile(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });

    // Not rejected for its file type: it queues cleanly and shows no badge until "Upload" runs.
    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toBeHidden();
  });
});
