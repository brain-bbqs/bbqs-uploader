import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedSignedIn } from "./helpers/auth";

test("recursive folder selection derives sourcedata/raw paths and skips .git", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbqs-upload-"));
  const dirName = path.basename(dir);
  fs.mkdirSync(path.join(dir, "session1"));
  fs.writeFileSync(path.join(dir, "session1", "a.txt"), "a");
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(path.join(dir, ".git", "config"), "ignored");
  fs.writeFileSync(path.join(dir, ".noannex"), "ignored");

  await seedSignedIn(page);
  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  // Only a.txt should surface — the .git/config file and top-level .noannex must be filtered out.
  // The picked base folder's own name is kept as the base path segment under sourcedata/raw/,
  // and the folder is also named in the summary row.
  const row = page.locator("#file-list .file-item").first();
  await expect(page.locator("#file-list .file-item")).toHaveCount(1);
  await expect(row).toHaveAttribute("title", `sourcedata/raw/${dirName}/session1/a.txt`);
  await expect(page.locator("#folder-summary-name")).toHaveText(dirName);
  await expect(page.locator("#folder-summary-stats")).toContainText("1 file");

  // The slider now ranges over the total number of dropped files (1 here), and defaults to
  // revealing everything since 1 is within the default reveal count (30). The ruler's quarter
  // labels dedupe down to just "0" and "1" for a single-file drop.
  await expect(page.locator("#expand-depth")).toHaveAttribute("max", "1");
  expect(await page.locator("#expand-depth").inputValue()).toBe("1");
  await expect(page.locator("#expand-depth-ticks .tick-label")).toHaveCount(2);
});

test("recursive folder selection skips device-specific hidden files like .DS_Store", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbqs-upload-"));
  fs.mkdirSync(path.join(dir, "session1"));
  fs.writeFileSync(path.join(dir, "session1", "a.txt"), "a");
  fs.writeFileSync(path.join(dir, "session1", ".DS_Store"), "junk");
  fs.writeFileSync(path.join(dir, "Thumbs.db"), "junk");

  await seedSignedIn(page);
  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  // Only a.txt should surface — the .DS_Store and Thumbs.db files must be filtered out.
  await expect(page.locator("#file-list .file-item")).toHaveCount(1);
});

test("recursive folder selection skips Python cache files and folders", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbqs-upload-"));
  fs.mkdirSync(path.join(dir, "session1"));
  fs.writeFileSync(path.join(dir, "session1", "a.txt"), "a");
  fs.mkdirSync(path.join(dir, "session1", "__pycache__"));
  fs.writeFileSync(path.join(dir, "session1", "__pycache__", "analysis.cpython-312.pyc"), "junk");
  fs.writeFileSync(path.join(dir, "session1", "analysis.pyc"), "junk");
  fs.mkdirSync(path.join(dir, ".pytest_cache"));
  fs.writeFileSync(path.join(dir, ".pytest_cache", "README.md"), "junk");

  await seedSignedIn(page);
  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  // Only a.txt should surface — the __pycache__/, *.pyc, and .pytest_cache/ entries must be filtered out.
  await expect(page.locator("#file-list .file-item")).toHaveCount(1);
});

test("a folder containing an empty file still reveals every other file and the expand slider", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbqs-upload-empty-"));
  const bigDir = path.join(dir, "bigfolder");
  fs.mkdirSync(bigDir);
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(bigDir, `file-${i}.txt`), String(i));
  }
  // An empty file used to throw synchronously out of the per-entry hashing loop, aborting the
  // rest of the batch: every row after it stayed hidden and the expand slider never appeared.
  fs.writeFileSync(path.join(bigDir, "empty.txt"), "");

  await seedSignedIn(page);
  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  await expect(page.locator("#file-list .file-item")).toHaveCount(6);
  await expect(page.locator("#file-list .file-item:visible")).toHaveCount(6);
  await expect(page.locator("#expand-depth")).toHaveAttribute("max", "6");
});

test("the dropzone and its browse link both open the folder picker", async ({ page }) => {
  await seedSignedIn(page);
  await page.goto("/");

  const folderChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#browse-folder-btn").click();
  const folderChooser = await folderChooserPromise;
  expect(await folderChooser.element().getAttribute("id")).toBe("folder-input");

  const dropzoneChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const dropzoneChooser = await dropzoneChooserPromise;
  expect(await dropzoneChooser.element().getAttribute("id")).toBe("folder-input");
});

test("a folder with more than 30 files reveals the first 30 and truncates the rest with a placeholder", async ({
  page,
}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bbqs-upload-big-"));
  const bigDir = path.join(dir, "bigfolder");
  fs.mkdirSync(bigDir);
  for (let i = 0; i < 35; i++) {
    fs.writeFileSync(path.join(bigDir, `file-${i}.txt`), String(i));
  }

  await seedSignedIn(page);
  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(dir);

  // Folder rows are always visible and expanded; the slider only governs file rows.
  const toggle = page.locator(".dir-toggle", { hasText: "bigfolder/" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // All 35 file rows are queued in the DOM, but only the default reveal count (30) is visible;
  // the truncation is signposted by a free "… N more files" placeholder row.
  await expect(page.locator("#expand-depth")).toHaveAttribute("max", "35");
  expect(await page.locator("#expand-depth").inputValue()).toBe("30");
  await expect(page.locator("#expand-depth-bubble")).toHaveText("30 files");
  await expect(page.locator("#file-list .file-item")).toHaveCount(35);
  await expect(page.locator("#file-list .file-item:visible")).toHaveCount(30);
  await expect(page.locator("#file-list .more-files")).toHaveText("… 5 more files");

  // Dragging the slider to the max reveals every row, drops the placeholder, and the value
  // bubble riding the thumb tracks the new count.
  await page.locator("#expand-depth").fill("35");
  await expect(page.locator("#expand-depth-bubble")).toHaveText("35 files");
  await expect(page.locator("#file-list .file-item:visible")).toHaveCount(35);
  await expect(page.locator("#file-list .more-files")).toHaveCount(0);
});

test("dropping a loose file rejects it with a message card centered in the dropzone", async ({ page }) => {
  await seedSignedIn(page);
  await page.goto("/");

  // A real drag-and-drop of a loose file: the synthetic DataTransfer's item still answers
  // webkitGetAsEntry(), so the dropzone takes the "files, but no folder" rejection branch
  // rather than the "browser can't read folders" one.
  await page.locator("#dropzone").evaluate((dz) => {
    const dt = new DataTransfer();
    dt.items.add(new File(["clip"], "clip.mp4", { type: "video/mp4" }));
    dz.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });

  const reject = page.locator("#dropzone-reject");
  await expect(reject).toHaveText(/Individual files can't be uploaded on their own/);

  // The "what to do instead" half sits on its own line, one blank line below the first.
  await expect(reject.locator("br")).toHaveCount(2);
  expect(await reject.innerText()).toBe(
    "Individual files can't be uploaded on their own.\n\nDrop the folder that contains them instead.",
  );

  // The card is narrower than the dropzone, so it only looks deliberate when it sits on the
  // dropzone's center line; `.dz-inner p` used to zero out its `auto` side margins and pin it
  // to the left edge.
  const dzBox = (await page.locator("#dropzone").boundingBox())!;
  const rejectBox = (await reject.boundingBox())!;
  expect(rejectBox.width).toBeLessThan(dzBox.width);
  expect(Math.abs(rejectBox.x + rejectBox.width / 2 - (dzBox.x + dzBox.width / 2))).toBeLessThan(1);
});
