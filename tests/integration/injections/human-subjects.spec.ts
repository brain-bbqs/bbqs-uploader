import { test, expect, type Page } from "@playwright/test";
import { seedSignedIn, API } from "../helpers/auth";
import { seedTheme } from "../helpers/theme";

// A dataset whose draft description carries the human-subjects marker phrase must show the
// warning banner and keep the upload button disabled until the user enters an IRB number and
// clicks "I confirm", which records the number in the draft's metadata.
test.describe("human subjects warning banner", () => {
  const DRAFT_URL = `${API}/dandisets/000123/versions/draft/`;

  function mockDraftMetadata(page: Page, metadata: Record<string, unknown>) {
    return page.route(DRAFT_URL, (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: metadata });
      return route.fulfill({ json: {} });
    });
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

  test("blocks uploads until confirmed; entering an IRB number records it on confirm", async ({ page }) => {
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

    const putRequest = page.waitForRequest((req) => req.url() === DRAFT_URL && req.method() === "PUT");
    await page.locator("#irb-number-input").fill("STUDY00001234");
    await page.locator("#human-subjects-confirm-btn").click();

    const put = await putRequest;
    const body = put.postDataJSON() as { metadata: { ethicsApproval: { schemaKey: string; identifier: string }[] } };
    expect(body.metadata.ethicsApproval).toEqual([{ schemaKey: "EthicsApproval", identifier: "STUDY00001234" }]);

    await expect(page.locator("#human-subjects-confirmed")).toContainText("STUDY00001234");
    await expect(page.locator("#human-subjects-unconfirmed")).toBeHidden();
    await expect(page.locator("#upload-all-btn")).toBeEnabled();
  });

  test("the IRB number is optional: a bare 'I confirm' unlocks uploads without a metadata write", async ({ page }) => {
    let putSeen = false;
    await page.route(DRAFT_URL, (route) => {
      if (route.request().method() === "PUT") {
        putSeen = true;
        return route.fulfill({ json: {} });
      }
      return route.fulfill({
        json: { name: "Incoming: Test Lab", description: "Careful, this one CONTAINS HUMAN SUBJECTS data." },
      });
    });
    await page.goto("/");

    await expect(page.locator("#human-subjects-banner")).toBeVisible();
    await expect(page.locator("#upload-all-btn")).toBeDisabled();

    await page.locator("#human-subjects-confirm-btn").click();

    await expect(page.locator("#human-subjects-confirmed")).toContainText("Confirmed");
    await expect(page.locator("#human-subjects-unconfirmed")).toBeHidden();
    await expect(page.locator("#upload-all-btn")).toBeEnabled();
    expect(putSeen).toBe(false);
  });

  test("prefills an IRB number already recorded in the metadata and skips re-saving it", async ({ page }) => {
    let putSeen = false;
    await page.route(DRAFT_URL, (route) => {
      if (route.request().method() === "PUT") {
        putSeen = true;
        return route.fulfill({ json: {} });
      }
      return route.fulfill({
        json: {
          name: "Incoming: Test Lab",
          description: "CONTAINS HUMAN SUBJECTS",
          ethicsApproval: [{ schemaKey: "EthicsApproval", identifier: "STUDY-EXISTING" }],
        },
      });
    });
    await page.goto("/");

    await expect(page.locator("#irb-number-input")).toHaveValue("STUDY-EXISTING");
    await page.locator("#human-subjects-confirm-btn").click();

    await expect(page.locator("#human-subjects-confirmed")).toContainText("STUDY-EXISTING");
    await expect(page.locator("#upload-all-btn")).toBeEnabled();
    expect(putSeen).toBe(false);
  });
});

// Exercises the "?test&num_datasets=N&human_subjects" live test injection documented in
// docs/README.md: fake datasets (negative identifiers, no real draft to fetch or write to) show
// the same banner and confirm flow, entirely off the network and even while signed out.
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

    await page.locator("#irb-number-input").fill("STUDY00001234");
    await page.locator("#human-subjects-confirm-btn").click();

    await expect(page.locator("#human-subjects-confirmed")).toContainText("STUDY00001234");
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
