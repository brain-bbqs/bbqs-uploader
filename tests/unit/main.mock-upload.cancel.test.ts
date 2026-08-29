// @vitest-environment jsdom
// Boots src/main.ts with "?test&mock_upload=2" and cancels the simulated batch: once mid-upload
// (mockUploadFile's AbortError catch), then a freshly staged batch mid-scan (registerHashJob's
// AbortError catch), plus the beforeunload guard while uploads are in flight. Separate file from
// main.mock-upload.test.ts because module state persists per boot.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";

const fetchMock = vi.fn(() => Promise.reject(new Error("network disabled in tests")));

function rows(): HTMLLIElement[] {
  return Array.from(document.querySelectorAll<HTMLLIElement>("#file-list .file-item"));
}

function badgeOf(row: HTMLLIElement): HTMLSpanElement {
  return row.querySelector<HTMLSpanElement>('[data-role="badge"]')!;
}

function dispatchBeforeUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  await bootMain("?test&mock_upload=2");
  await vi.waitFor(() => {
    expect(rows()).toHaveLength(2);
  });
});

describe("cancelling a mock batch", () => {
  it("warns about leaving while the batch is in flight", { timeout: 15_000 }, async () => {
    el("upload-all-btn").click();
    // The queue registers its AbortControllers a few microtasks after the click; poll by
    // re-dispatching until the beforeunload guard bites.
    await vi.waitFor(
      () => {
        expect(dispatchBeforeUnload()).toBe(true);
      },
      { timeout: 5_000 },
    );
  });

  it("Cancel all mid-upload marks every row Cancelled and freezes the summary", { timeout: 30_000 }, async () => {
    // Wait for the upload phase so at least one file aborts inside its simulated transfer.
    await vi.waitFor(
      () => {
        expect(rows().some((r) => badgeOf(r).textContent === "Uploading")).toBe(true);
      },
      { timeout: 12_000 },
    );
    el("cancel-all-btn").click();
    await vi.waitFor(
      () => {
        expect(rows().map((r) => badgeOf(r).textContent)).toEqual(["Cancelled", "Cancelled"]);
        expect(el("progress-footer-left").textContent).toBe("2 cancelled");
      },
      { timeout: 10_000 },
    );
    for (const row of rows()) expect(badgeOf(row).className).toBe("badge warn");
    // The batch settled, so Cancel all goes away and the ETA freezes instead of counting down.
    await vi.waitFor(() => {
      expect(el("cancel-all-btn").hidden).toBe(true);
    });
    expect(el("progress-upload-eta").textContent).toBe("—");
    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("Cancel all mid-scan cancels via the hash job for a freshly staged batch", { timeout: 30_000 }, async () => {
    // mockMode covers genuinely picked files too; large sizes keep the scan animation running
    // long enough to cancel deterministically inside it.
    pickFolder([
      fakeFolderFile("c.bin", "second/c.bin", 40 * 1024 * 1024),
      fakeFolderFile("d.bin", "second/d.bin", 40 * 1024 * 1024),
    ]);
    const staged = () => rows().filter((r) => r.title.includes("/second/"));
    await vi.waitFor(() => {
      expect(staged()).toHaveLength(2);
      expect(el("upload-all-btn").textContent).toContain("Upload 2 files (");
    });

    el("upload-all-btn").click();
    await vi.waitFor(() => {
      expect(staged().map((r) => badgeOf(r).textContent)).toEqual(["Scanning", "Scanning"]);
    });
    el("cancel-all-btn").click();
    await vi.waitFor(
      () => {
        expect(staged().map((r) => badgeOf(r).textContent)).toEqual(["Cancelled", "Cancelled"]);
        // Outcome counts accumulate across batches in the same session.
        expect(el("progress-footer-left").textContent).toBe("4 cancelled");
      },
      { timeout: 10_000 },
    );
    await vi.waitFor(() => {
      expect(el("cancel-all-btn").hidden).toBe(true);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
