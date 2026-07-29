import { test, expect, type Page } from "@playwright/test";
import { seedSignedIn, API } from "../helpers/auth";
import { seedTheme } from "../helpers/theme";

// A dataset whose draft description carries the human-subjects marker phrase must show the
// warning banner and keep the upload button disabled until the user clicks "I confirm".
test.describe("human subjects warning banner", () => {
  const DRAFT_URL = `${API}/dandisets/000123/versions/draft/`;

  function mockDraftMetadata(page: Page, metadata: Record<string, unknown>) {
    return page.route(DRAFT_URL, (route) => route.fulfill({ json: metadata }));
  }

  test.beforeEach(async ({ page }) => {
    await seedTheme(page, "light");
    await seedSignedIn(page);
  });

  test("stays hidden for a dataset without the marker phrase", async ({ page }) => {
    await mockDraftMetadata(page, { name: "Incoming: Test Lab", description: "Ordinary mouse ephys data." });
    await page.goto("/");

    await expect(page.locator("#dandiset-single")).toBeVisible();
    await expect(page.locator("#human-subjects-banner")).toBeHidden();
    await expect(page.locator("#upload-all-btn")).toBeEnabled();
  });

  test("blocks uploads until 'I confirm' is clicked", async ({ page }) => {
    await mockDraftMetadata(page, {
      name: "Incoming: Test Lab",
      description: "Careful, this one CONTAINS HUMAN SUBJECTS data.",
    });
    await page.goto("/");

    const banner = page.locator("#human-subjects-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("de-identified");
    await expect(banner).toContainText("IRB approval");
    await expect(page.locator("#upload-all-btn")).toBeDisabled();

    await page.locator("#human-subjects-confirm-btn").click();

    await expect(page.locator("#human-subjects-confirmed")).toContainText("Confirmed");
    await expect(page.locator("#human-subjects-unconfirmed")).toBeHidden();
    await expect(page.locator("#upload-all-btn")).toBeEnabled();
  });
});

// Exercises the "?test&num_datasets=N&human_subjects" live test injection documented in
// docs/README.md: fake datasets (negative identifiers, no real draft to fetch) show the same
// banner and confirm flow, entirely off the network and even while signed out.
test.describe("?test&num_datasets=N&human_subjects injection", () => {
  test.beforeEach(async ({ page }) => {
    await seedTheme(page, "light");
  });

  test("shows the banner for a fake dataset and confirms without any API calls", async ({ page }) => {
    let apiCalled = false;
    await page.route(`${API}/**`, (route) => {
      apiCalled = true;
      return route.fulfill({ status: 500, body: "" });
    });
    await page.goto("/?test&num_datasets=1&human_subjects");

    await expect(page.locator("#dandiset-single")).toBeVisible();
    await expect(page.locator("#human-subjects-banner")).toBeVisible();
    await expect(page.locator("#upload-all-btn")).toBeDisabled();

    await page.locator("#human-subjects-confirm-btn").click();

    await expect(page.locator("#human-subjects-confirmed")).toContainText("Confirmed");
    await expect(page.locator("#upload-all-btn")).toBeEnabled();
    expect(apiCalled).toBe(false);
  });

  test("without the flag, fake datasets show no banner", async ({ page }) => {
    await page.goto("/?test&num_datasets=1");

    await expect(page.locator("#dandiset-single")).toBeVisible();
    await expect(page.locator("#human-subjects-banner")).toBeHidden();
    await expect(page.locator("#upload-all-btn")).toBeEnabled();
  });
});
