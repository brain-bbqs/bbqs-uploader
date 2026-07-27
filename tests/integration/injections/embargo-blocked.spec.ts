import { test, expect } from "@playwright/test";
import { seedSignedIn } from "../helpers/auth";
import { dropFile } from "../helpers/drop";

// A direct-upload dataset that has lost its embargo (or was never embargoed) must not accept
// uploads: a single error card in the Dataset section explains why, and the upload button is
// disabled instead of letting the user click it and get a per-file error.
test.describe("upload blocked for a non-embargoed dandiset", () => {
  test.beforeEach(async ({ page }) => {
    await seedSignedIn(page, { embargoed: false });
  });

  test("shows a single dataset-level error and disables the upload button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#dandiset-single")).toBeVisible();

    await expect(page.locator("#dandiset-embargo-error")).toBeVisible();
    await expect(page.locator("#dandiset-embargo-error")).toContainText("not embargoed");

    await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

    await expect(page.locator("#upload-all-btn")).toBeDisabled();
    // No per-file "Blocked" message; the dataset-level card is the only place this shows up.
    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toBeHidden();
  });
});
