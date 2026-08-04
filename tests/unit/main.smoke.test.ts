// @vitest-environment jsdom
// Boots the real src/main.ts against the real index.html markup and drives the staging flow end
// to end (folder pick, selection toggles, ignore patterns, reset). Besides covering main.ts's
// wiring, this guards the index.html/elements.ts id contract: getElements() throws on import if
// any registered id is missing from the page.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

function bodyFromIndexHtml(): string {
  // import.meta.url is an http URL under jsdom; vitest's cwd is the repo root (see its config).
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf-8");
  // The inline pre-paint/analytics scripts (and the module entry) don't belong in this harness —
  // main.ts is imported directly below instead. Parsed and pruned via the DOM (DOMParser never
  // executes scripts) rather than regex-filtering the HTML.
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const script of Array.from(doc.querySelectorAll("script"))) script.remove();
  return doc.body.innerHTML;
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

function fakeFolderFile(name: string, webkitRelativePath: string): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "webkitRelativePath", { value: webkitRelativePath, configurable: true });
  return file;
}

function pickFolder(files: File[]): void {
  const input = el<HTMLInputElement>("folder-input");
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change"));
}

async function waitForSummary(text: string): Promise<void> {
  await vi.waitFor(() => {
    expect(el("selection-summary").textContent).toContain(text);
  });
}

beforeAll(async () => {
  document.body.innerHTML = bodyFromIndexHtml();
  // jsdom has no matchMedia; main.ts only reads `.matches` for the theme toggle's starting point.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  await import("../../src/main");
});

describe("main.ts boot", () => {
  it("renders the version indicator and the signed-out dataset placeholder", () => {
    expect(el("version-indicator").textContent).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(el("dandiset-message").textContent).toContain("sign in");
    expect(el("upload-card").hidden).toBe(true);
  });

  it("stages a picked folder: summary row, hidden dropzone, live selection UI", async () => {
    pickFolder([
      fakeFolderFile("notes.txt", "base/notes.txt"),
      fakeFolderFile("a.bin", "base/session1/a.bin"),
      fakeFolderFile("b.bin", "base/session1/b.bin"),
    ]);
    await waitForSummary("3 of 3 files");

    expect(el("dropzone").hidden).toBe(true);
    expect(el("folder-summary").hidden).toBe(false);
    expect(el("folder-summary-name").textContent).toBe("base");
    expect(el("folder-summary-stats").textContent).toContain("3 files");
    // Signed out, so no archive check runs and no banner shows.
    expect(el("remote-banner").hidden).toBe(true);
    // Scanning starts at Upload, not on staging.
    expect(el("progress-summary").hidden).toBe(true);
    expect(el<HTMLButtonElement>("upload-all-btn").textContent).toBe("Upload 3 files (3 B)");
    const titles = Array.from(document.querySelectorAll<HTMLLIElement>("#file-list .file-item"), (li) => li.title);
    expect(titles.sort()).toEqual([
      "sourcedata/raw/notes.txt",
      "sourcedata/raw/session1/a.bin",
      "sourcedata/raw/session1/b.bin",
    ]);
  });

  it("keeps folder tri-states and the Upload button in step with row toggles", async () => {
    const sessionCheck = document.querySelector<HTMLInputElement>(".dir-row .select-check")!;
    const fileChecks = Array.from(document.querySelectorAll<HTMLInputElement>("#file-list .file-item .select-check"));
    expect(fileChecks).toHaveLength(3);

    fileChecks[1].checked = false;
    fileChecks[1].dispatchEvent(new Event("change"));
    await waitForSummary("2 of 3 files");
    expect(sessionCheck.indeterminate).toBe(true);

    sessionCheck.checked = true;
    sessionCheck.dispatchEvent(new Event("change"));
    await waitForSummary("3 of 3 files");
    expect(sessionCheck.indeterminate).toBe(false);

    el("select-none-btn").click();
    await waitForSummary("0 of 3 files");
    expect(el("upload-all-btn").hidden).toBe(true);
    el("select-all-btn").click();
    await waitForSummary("3 of 3 files");
    expect(el("upload-all-btn").hidden).toBe(false);
  });

  it("applies and removes ignore patterns via the chip editor", async () => {
    const input = el<HTMLInputElement>("ignore-pattern-input");
    input.value = "*.bin";
    el("ignore-pattern-add").click();
    await waitForSummary("1 of 3 files");
    const badges = Array.from(document.querySelectorAll("#file-list .badge")).filter((b) => !b.hasAttribute("hidden"));
    expect(badges.map((b) => b.textContent)).toEqual(["Ignored", "Ignored"]);
    expect(document.querySelector(".ignore-chip")?.textContent).toContain("*.bin");

    document.querySelector<HTMLButtonElement>(".ignore-chip button")!.click();
    await waitForSummary("3 of 3 files");
    expect(document.querySelector(".ignore-chip")).toBe(null);
  });

  it("Reset returns to the empty dropzone state", () => {
    el("reset-all-btn").click();
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(0);
    expect(el("folder-summary").hidden).toBe(true);
    expect(el("selection-bar").hidden).toBe(true);
    expect(el("upload-bar").hidden).toBe(true);
    // Signed out, so the dropzone stays hidden along with the rest of the upload card.
    expect(el("upload-card").hidden).toBe(true);
  });
});
