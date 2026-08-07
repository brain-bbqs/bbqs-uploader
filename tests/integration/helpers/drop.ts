import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";

interface FilePayload {
  name: string;
  mimeType?: string;
  buffer: Buffer;
}

/**
 * Stages file(s) through the dropzone's folder chooser. The dropzone only accepts base folders,
 * so the given payloads/paths are materialized into a fresh temp directory and that directory is
 * picked; since the base folder's own name is stripped from every relativePath, the staged files
 * come out identical to the loose-file drops this helper used to perform. On-disk paths are
 * copied with their mtimes preserved, so checksum-cache keys survive the round-trip.
 */
export async function dropFile(page: Page, files: string | FilePayload | (string | FilePayload)[]): Promise<void> {
  const list = Array.isArray(files) ? files : [files];
  // The picked folder's own name is stripped from every relativePath, but it still surfaces
  // verbatim in the UI (the folder-summary label). mkdtemp's random suffix would otherwise leak
  // into that label and change on every run, drifting the Chromatic baseline; nesting a
  // fixed-name folder inside the random temp root keeps parallel test runs isolated on disk
  // while the folder actually picked always has the same, stable name.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bbqs-drop-"));
  const dir = path.join(root, "dataset");
  fs.mkdirSync(dir);
  for (const f of list) {
    if (typeof f === "string") {
      const dest = path.join(dir, path.basename(f));
      fs.copyFileSync(f, dest);
      const stat = fs.statSync(f);
      fs.utimesSync(dest, stat.atime, stat.mtime);
    } else {
      fs.writeFileSync(path.join(dir, f.name), f.buffer);
    }
  }
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(dir);
}
