import { test, expect } from "@playwright/test";
import { STORAGE_KEY } from "../../../src/lib/settings";
import { EMBER_INSTANCE } from "../../../src/lib/instances";
import { seedTheme } from "../helpers/theme";

const API = EMBER_INSTANCE.api;

// With more than one incoming dataset the picker is a dropdown, and its options should always be
// ranked by ascending integer dandiset id -- regardless of the order the archive's API returns
// them in (which is sorted by title).
test.describe("dataset dropdown ordering", () => {
  test.beforeEach(async ({ page }) => {
    await seedTheme(page, "light");
    // Merges with (rather than clobbers) any settings already in localStorage, since this init
    // script re-runs on every navigation including reload() -- overwriting unconditionally would
    // wipe out a dandisetId the app had just saved before a reload-persistence test reloads.
    await page.addInitScript(
      ({ key, expiresAt }) => {
        const existing = JSON.parse(localStorage.getItem(key) ?? "{}");
        localStorage.setItem(key, JSON.stringify({ ...existing, oauth: { accessToken: "test-token", expiresAt } }));
      },
      { key: STORAGE_KEY, expiresAt: Date.now() + 3600_000 },
    );
    await page.route(`${API}/dandisets/?user=me&embargoed=true&page_size=1000`, (route) =>
      route.fulfill({
        json: {
          count: 3,
          next: null,
          previous: null,
          results: [
            { identifier: "000100", draft_version: { name: "Incoming: Alpha Lab" }, embargo_status: "EMBARGOED" },
            { identifier: "000300", draft_version: { name: "Incoming: Gamma Lab" }, embargo_status: "EMBARGOED" },
            { identifier: "000200", draft_version: { name: "Incoming: Beta Lab" }, embargo_status: "EMBARGOED" },
          ],
        },
      }),
    );
    for (const identifier of ["000100", "000200", "000300"]) {
      await page.route(`${API}/dandisets/${identifier}/users/`, (route) =>
        route.fulfill({ json: [{ username: "rhingo" }] }),
      );
    }
  });

  test("ranks dropdown options by ascending integer id", async ({ page }) => {
    await page.goto("/");

    const options = page.locator("#dandiset-id option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText("(000100) Incoming: Alpha Lab");
    await expect(options.nth(1)).toHaveText("(000200) Incoming: Beta Lab");
    await expect(options.nth(2)).toHaveText("(000300) Incoming: Gamma Lab");
  });

  test("persists a manually picked dataset across reloads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#dandiset-id")).toHaveValue("000100");

    await page.locator("#dandiset-id").selectOption("000300");
    await page.reload();

    await expect(page.locator("#dandiset-id")).toHaveValue("000300");
  });
});
