// @vitest-environment jsdom
// Boots the real src/main.ts with "?test&remote_listing=0" (signed out): the auto-opened browse
// renders an empty dataset, and staging a folder afterwards applies an empty listing — the
// "Nothing uploaded yet" staged banner with no diff badges and everything selected.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  await bootMain("?test&remote_listing=0");
  await vi.waitFor(() => {
    expect(el("remote-banner").hidden).toBe(false);
  });
});

describe("empty injected remote listing", () => {
  it("auto-opens an empty read-only browse with the pick-a-folder banner", () => {
    expect(el("remote-banner-title").textContent).toBe("Nothing uploaded yet");
    expect(el("remote-banner-body").textContent).toContain("pick a base folder");
    expect(el("files-card").hidden).toBe(false);
    expect(el("file-list").classList.contains("browse")).toBe(true);
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(0);
    // Nothing staged, so the upload bar has nothing to offer.
    expect(el("upload-bar").hidden).toBe(true);
  });

  it("staging a folder shows the empty-dataset banner with no diff to draw", async () => {
    pickFolder([fakeFolderFile("p.txt", "base/p.txt", 4), fakeFolderFile("q.txt", "base/sub/q.txt", 6)]);
    await vi.waitFor(() => {
      expect(el("selection-summary").textContent).toContain("2 of 2 files");
    });

    // Staged (non-browse) empty-listing banner: same title, different body.
    expect(el("remote-banner").hidden).toBe(false);
    expect(el("remote-banner").classList.contains("checked")).toBe(true);
    expect(el("remote-banner-title").textContent).toBe("Nothing uploaded yet");
    expect(el("remote-banner-body").textContent).toBe("This dataset is currently empty.");
    expect(el("file-list").classList.contains("browse")).toBe(false);

    // An empty listing reads as "no diff": no New badges, nothing deselected.
    const rows = Array.from(document.querySelectorAll<HTMLLIElement>("#file-list .file-item"));
    expect(rows).toHaveLength(2);
    for (const li of rows) {
      expect(li.querySelector<HTMLSpanElement>('[data-role="badge"]')!.hidden).toBe(true);
      expect(li.querySelector<HTMLInputElement>(".select-check")!.checked).toBe(true);
    }
    expect(el("upload-bar").hidden).toBe(false);
    expect(el("upload-all-btn").textContent).toBe("Upload 2 files (10 B)");
  });
});
