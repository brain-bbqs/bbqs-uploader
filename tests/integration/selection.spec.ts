import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";
import { API, seedSignedIn } from "./helpers/auth";

// Stages a base folder with one root file, two session files, and one scratch file, against a
// mocked archive listing where same.bin already exists unchanged and diff.bin exists at a
// different size.
async function stageFolder(page: Page): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbqs-selection-"));
  fs.writeFileSync(path.join(dir, "keep.bin"), Buffer.alloc(16));
  fs.writeFileSync(path.join(dir, "scratch.tmp"), Buffer.alloc(16));
  fs.mkdirSync(path.join(dir, "sessions"));
  fs.writeFileSync(path.join(dir, "sessions", "same.bin"), Buffer.alloc(16));
  fs.writeFileSync(path.join(dir, "sessions", "diff.bin"), Buffer.alloc(16));

  await seedSignedIn(page);
  // Registered after seedSignedIn, so it wins over its empty-listing default.
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, (route: Route) =>
    route.fulfill({
      json: {
        results: [
          { asset_id: "a-1", path: "sourcedata/raw/sessions/same.bin", size: 16 },
          { asset_id: "a-2", path: "sourcedata/raw/sessions/diff.bin", size: 15 },
        ],
        next: null,
      },
    }),
  );
  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);
}

function rowByTitle(page: Page, title: string) {
  return page.locator(`#file-list .file-item[title="${title}"]`);
}

test("diffs staged files against the archive listing and deselects already-uploaded ones", async ({ page }) => {
  await stageFolder(page);

  await expect(page.locator("#remote-banner")).toContainText("Already on EMBER: 2 files");

  const same = rowByTitle(page, "sourcedata/raw/sessions/same.bin");
  await expect(same.locator(".badge")).toHaveText("Uploaded");
  await expect(same.locator(".select-check")).not.toBeChecked();
  await expect(same.locator('[data-role="status"]')).toHaveText("already on EMBER");

  const diff = rowByTitle(page, "sourcedata/raw/sessions/diff.bin");
  await expect(diff.locator(".badge")).toHaveText("Changed");
  await expect(diff.locator(".select-check")).toBeChecked();
  await expect(diff.locator('[data-role="status"]')).toHaveText("will replace");

  await expect(rowByTitle(page, "sourcedata/raw/keep.bin").locator(".badge")).toHaveText("New");

  // 3 of 4 selected (same.bin sits out), and the Upload button carries the live total.
  await expect(page.locator("#selection-summary")).toContainText("3 of 4 files");
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 3 files (48 B)");

  // The sessions/ folder is half-selected, so its checkbox reads indeterminate.
  const sessionsDir = page.locator(".dir-item", { has: page.locator(".dir-name", { hasText: "sessions/" }) });
  await expect(sessionsDir.locator(".dir-row .select-check").first()).toHaveJSProperty("indeterminate", true);

  // Re-checking an uploaded file flips it to a replace.
  await same.locator(".select-check").check();
  await expect(same.locator('[data-role="status"]')).toHaveText("will replace");
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 4 files (64 B)");
});

test("folder checkboxes cascade and Select all/none drive the whole tree", async ({ page }) => {
  await stageFolder(page);
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 3 files (48 B)");

  const sessionsDir = page.locator(".dir-item", { has: page.locator(".dir-name", { hasText: "sessions/" }) });
  const sessionsCheck = sessionsDir.locator(".dir-row .select-check").first();

  // Checking the half-selected folder selects everything under it (including the uploaded file).
  await sessionsCheck.check();
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 4 files (64 B)");
  await expect(sessionsCheck).toHaveJSProperty("indeterminate", false);

  await page.locator("#select-none-btn").click();
  await expect(page.locator("#selection-summary")).toContainText("0 of 4 files");
  await expect(page.locator("#upload-all-btn")).toBeHidden();

  await page.locator("#select-all-btn").click();
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 4 files (64 B)");
});

test("ignore patterns exclude matching files until removed", async ({ page }) => {
  await stageFolder(page);

  await page.locator("#ignore-pattern-input").fill("*.tmp");
  await page.locator("#ignore-pattern-add").click();

  const scratch = rowByTitle(page, "sourcedata/raw/scratch.tmp");
  await expect(scratch.locator(".badge")).toHaveText("Ignored");
  await expect(scratch.locator(".select-check")).toBeDisabled();
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 2 files (32 B)");

  // Removing the chip restores the file's previous selected state.
  await page.locator(".ignore-chip button").click();
  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 3 files (48 B)");
  await expect(rowByTitle(page, "sourcedata/raw/scratch.tmp").locator(".badge")).toHaveText("New");
});
