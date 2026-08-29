// @vitest-environment jsdom
// Boots src/main.ts with "?test&mock_upload=1" and a simulateProgress stub that reports partial
// progress then fails for any real-sized file, while zero-byte files sail through instantly.
// Covers the non-abort failure paths of the mock pipeline (a failed scan hides its badge, a
// failed upload marks the row Error) and the zero-size progress fractions.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";
import { simulateProgress } from "../../src/lib/mockUpload";

vi.mock("../../src/lib/mockUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/mockUpload")>()),
  simulateProgress: vi.fn(),
}));

function rows(): HTMLLIElement[] {
  return Array.from(document.querySelectorAll<HTMLLIElement>("#file-list .file-item"));
}

function badgeOf(row: HTMLLIElement): HTMLSpanElement {
  return row.querySelector<HTMLSpanElement>('[data-role="badge"]')!;
}

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  // Freeze the clock so the failed/instant phases record 0-duration (0 MBps) timing stats.
  vi.spyOn(performance, "now").mockReturnValue(12_345);
  vi.mocked(simulateProgress).mockImplementation(async (totalBytes, _durationMs, _signal, onProgress) => {
    if (totalBytes === 0) {
      onProgress(0);
      return;
    }
    // Wait a beat so the hash job is fully registered before its first progress tick lands —
    // that tick must be recorded, so the failed scan still reports the rate it achieved.
    await new Promise((r) => setTimeout(r, 0));
    onProgress(Math.round(totalBytes / 2));
    throw new Error("simulated pipe burst");
  });
  await bootMain("?test&mock_upload=1");
  await vi.waitFor(() => {
    expect(rows()).toHaveLength(1);
  });
});

describe("mock pipeline failures", () => {
  it("hides a failed scan's badge and marks the failed upload as an Error", async () => {
    // A zero-byte real pick joins the injected fake file; mock mode simulates both.
    pickFolder([fakeFolderFile("empty.bin", "extra/empty.bin", 0)]);
    await vi.waitFor(() => {
      expect(rows()).toHaveLength(2);
    });

    el("upload-all-btn").click();

    // The injected (>0-byte) file fails both phases; the zero-byte one completes instantly.
    await vi.waitFor(() => {
      expect(el("progress-footer-left").textContent).toBe("1 done, 1 error");
    });
    const byTitle = (fragment: string) => rows().find((r) => r.title.includes(fragment))!;
    expect(badgeOf(byTitle("/extra/")).textContent).toBe("Done");
    expect(badgeOf(byTitle("/mock-dataset/")).textContent).toBe("Error");
  });

  it("pluralizes the error tally as later batches fail too", async () => {
    pickFolder([fakeFolderFile("more.bin", "extra2/more.bin", 4096)]);
    await vi.waitFor(() => {
      expect(rows()).toHaveLength(3);
    });

    el("upload-all-btn").click();

    await vi.waitFor(() => {
      expect(el("progress-footer-left").textContent).toBe("1 done, 2 errors");
    });
  });
});
