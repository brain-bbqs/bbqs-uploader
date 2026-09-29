import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow } from "@brain-bbqs/test-utils/playwright";
import { seedSignedIn } from "./helpers/auth";
import { dropFile } from "./helpers/drop";

// Common phone widths, narrowest first. The rows a narrow screen squeezes are the header (logo,
// title and sign-in button or avatar) and the staged folder's summary (name, stats and button).
const PHONE_WIDTHS = [320, 360, 375, 390, 414];

for (const width of PHONE_WIDTHS) {
  test.describe(`at ${width}px wide`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
    });

    test("the signed-out page does not scroll sideways", async ({ page }) => {
      await page.goto("/");
      await page.locator("#oauth-signin-btn").waitFor();
      await expectNoHorizontalOverflow(page);
    });

    test("the signed-in page does not scroll sideways", async ({ page }) => {
      await seedSignedIn(page);
      await page.goto("/");
      await page.locator("#oauth-avatar").waitFor();
      await expectNoHorizontalOverflow(page);
    });

    test("a staged folder's summary keeps its button inside the row", async ({ page }) => {
      await seedSignedIn(page);
      await page.goto("/");
      await dropFile(page, { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(32) });
      const summary = page.locator("#folder-summary");
      await expect(summary).toBeVisible();
      // Pinned to about the longest stats line the formatter produces, rather than staging 999
      // files of hundreds of gigabytes to reach it.
      await page.locator("#folder-summary-stats").evaluate((el) => (el.textContent = "999 files, 999 GB"));

      const row = await summary.boundingBox();
      const button = await page.locator("#change-folder-btn").boundingBox();
      expect(button!.x + button!.width).toBeLessThanOrEqual(row!.x + row!.width);
      await expectNoHorizontalOverflow(page);
    });
  });
}
