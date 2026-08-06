import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Route } from "@playwright/test";
import { API, seedSignedIn } from "./helpers/auth";
import { mockUploadApi } from "./helpers/api-mock";
import { dropFile } from "./helpers/drop";

test("hashes concurrently-uploading files on separate workers, not the main thread", async ({ page }) => {
  const workerUrls: string[] = [];
  page.on("worker", (w) => workerUrls.push(w.url()));

  await mockUploadApi(page);
  // Stall briefly before failing, so files stay parked mid-flight long enough to observe worker
  // creation without leaving requests hanging indefinitely (which slows down test teardown).
  await page.route(`${API}/uploads/initialize/`, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 500, body: "stalled for test" });
  });

  await seedSignedIn(page);
  await page.goto("/");
  await expect(page.locator("#dandiset-single")).toBeVisible();

  await dropFile(page, [
    { name: "a.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
    { name: "b.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
    { name: "c.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(6 * 1024 * 1024) },
  ]);

  await expect(page.locator("#upload-all-btn")).toHaveText("Upload 3 files (18 MB)");
  await page.locator("#upload-all-btn").click();

  // Hashing starts when "Upload" is clicked, fanning the batch out across pool workers.
  await expect(page.locator("[data-role='badge']").first()).toBeVisible({ timeout: 5000 });
  await expect.poll(() => workerUrls.length, { timeout: 5000 }).toBeGreaterThan(1);
});

test("fans a single multi-part file out across workers and cancels hashing via Cancel all", async ({ page }) => {
  const workerUrls: string[] = [];
  page.on("worker", (w) => workerUrls.push(w.url()));

  await seedSignedIn(page);
  // Even throttled, a fast CI runner can finish the scan before the cancel click lands; with no
  // upload API mocked, the batch would then error out instantly and hide the Cancel button mid-
  // click. Stalling the first upload call keeps the batch alive (and cancellable) either way —
  // a cancel landing in that window still reads "Cancelled" via the upload's own abort path.
  await page.route(`${API}/dandisets/000123/versions/draft/assets/?path=*`, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ status: 500, body: "stalled for test" });
  });
  await page.goto("/");

  // Slow the page down so the mid-hash cancel below isn't a race against real-time MD5 speed.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });

  // 64MB + 10 bytes plans exactly two parts, so one file alone exercises multi-worker fan-out.
  // Written to disk because Playwright rejects in-memory setFiles buffers this large.
  const bigPath = join(mkdtempSync(join(tmpdir(), "bbqs-hash-")), "big.bin");
  writeFileSync(bigPath, Buffer.alloc(64 * 1024 * 1024 + 10));

  await dropFile(page, bigPath);
  await page.locator("#upload-all-btn").click();

  const badge = page.locator("[data-role='badge']").first();
  await expect(badge).toHaveText("Scanning", { timeout: 10000 });
  // Both of the file's parts should be claimed by separate pool workers.
  await expect.poll(() => workerUrls.length, { timeout: 10000 }).toBeGreaterThan(1);

  // "Cancel all" is offered during the scan phase now, and aborts the in-progress hash mid-part.
  await page.locator("#cancel-all-btn").click();
  await expect(badge).toHaveText("Cancelled", { timeout: 10000 });
  await expect(page.locator("#cancel-all-btn")).toBeHidden();
});
