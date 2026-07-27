import { test, expect } from "@playwright/test";
import { seedSignedIn } from "../helpers/auth";
import { dropFile } from "../helpers/drop";

// Exercises the "?test&num_datasets=N&embargoed=false" live test injection documented in
// docs/README.md -- previews the upload-blocked state for a dandiset that isn't embargoed,
// without needing a real account that owns one. A direct-upload dataset that has lost its
// embargo (or was never embargoed) must not accept uploads: a single error card in the Dataset
// section explains why, and the upload button is disabled instead of letting the user click it
// and get a per-file error.
test.describe("upload blocked for a non-embargoed dandiset", () => {
  test.beforeEach(async ({ page }) => {
    // seedSignedIn's own dandiset-list mock is bypassed by the ?test override below; it's only
    // needed here to seed a signed-in identity.
    await seedSignedIn(page);
  });

  test("single dataset: shows a dataset-level error and disables the upload button", async ({ page }) => {
    await page.goto("/?test&num_datasets=1&embargoed=false");
    await expect(page.locator("#dandiset-single")).toBeVisible();

    await expect(page.locator("#dandiset-embargo-error")).toBeVisible();
    await expect(page.locator("#dandiset-embargo-error")).toContainText("not embargoed");

    await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });

    await expect(page.locator("#upload-all-btn")).toBeDisabled();
    // No per-file "Blocked" message; the dataset-level card is the only place this shows up.
    const row = page.locator("#file-list .file-item").first();
    await expect(row.locator('[data-role="badge"]')).toBeHidden();
  });

  test("dropdown: shows the error below the dropdown without shrinking it", async ({ page }) => {
    await page.goto("/?test&num_datasets=2&embargoed=false");
    await expect(page.locator("#dandiset-id")).toBeVisible();
    await expect(page.locator("#dandiset-embargo-error")).toBeVisible();
    await expect(page.locator("#upload-all-btn")).toBeDisabled();

    // The error card is a sibling grid item below the dropdown, not beside it -- the dropdown
    // should still span the full width of the card, not get squeezed into a narrower column.
    const dropdownBox = await page.locator("#dandiset-id").boundingBox();
    const errorBox = await page.locator("#dandiset-embargo-error").boundingBox();
    expect(dropdownBox).not.toBeNull();
    expect(errorBox).not.toBeNull();
    expect(dropdownBox!.y).toBeLessThan(errorBox!.y);
    expect(Math.abs(dropdownBox!.width - errorBox!.width)).toBeLessThan(2);
  });

  test("an embargoed dataset (the default fakes) shows no error and an enabled upload button", async ({ page }) => {
    await page.goto("/?test&num_datasets=2");
    await expect(page.locator("#dandiset-id")).toBeVisible();
    await expect(page.locator("#dandiset-embargo-error")).toBeHidden();

    await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });
    await expect(page.locator("#upload-all-btn")).toBeEnabled();
  });
});
