import { test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "@brain-bbqs/test-utils/playwright";
import { seedSignedIn } from "./helpers/auth";

// Common phone widths, narrowest first. The header is what a narrow screen squeezes: the logo,
// the title and the sign-in button (or avatar) have to share one row with no sideways scroll.
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
  });
}
