// @vitest-environment jsdom
// Boots src/main.ts with "?test&mock_upload=2" and runs the simulated pipeline to completion:
// auto-staged fake files, the shared scan phase (registerHashJob's success path), the mock upload
// phase, the coalesced progress summary (phase bars, ETA text, footer counts), and the batch
// epilogue (Cancel-all hiding, upload bar refresh, no transfer report in mock mode).
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";

const fetchMock = vi.fn(() => Promise.reject(new Error("network disabled in tests")));

function rows(): HTMLLIElement[] {
  return Array.from(document.querySelectorAll<HTMLLIElement>("#file-list .file-item"));
}

function badgeOf(row: HTMLLIElement): HTMLSpanElement {
  return row.querySelector<HTMLSpanElement>('[data-role="badge"]')!;
}

function visibleBadgeTexts(): (string | null)[] {
  return rows().map((r) => (badgeOf(r).hidden ? null : badgeOf(r).textContent));
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

describe("?test&mock_upload=2 pipeline", () => {
  it("auto-stages two fake files under the mock base folder", () => {
    expect(el("folder-summary-name").textContent).toBe("mock-dataset");
    expect(el("folder-summary-stats").textContent).toContain("2 files");
    expect(el<HTMLButtonElement>("upload-all-btn").textContent).toContain("Upload 2 files (");
    // Nothing is running yet, so neither the summary nor Cancel all is offered.
    expect(el("progress-summary").hidden).toBe(true);
    expect(el("cancel-all-btn").hidden).toBe(true);
  });

  it("Upload starts the scan phase: badges, summary, Cancel all, consumed checkboxes", { timeout: 10_000 }, async () => {
    el("upload-all-btn").click();
    await vi.waitFor(() => {
      expect(visibleBadgeTexts()).toEqual(["Scanning", "Scanning"]);
    });
    expect(el("progress-summary").hidden).toBe(false);
    expect(el("cancel-all-btn").hidden).toBe(false);
    // The batch consumed the selection, so the rows' include checkboxes lock.
    for (const row of rows()) {
      expect(row.querySelector<HTMLInputElement>(".select-check")!.disabled).toBe(true);
    }
    // Inside the ETA warm-up window the scan chip estimates while the idle upload phase shows —.
    await vi.waitFor(
      () => {
        expect(el("progress-hash-eta").textContent).toBe("estimating…");
      },
      { timeout: 5_000 },
    );
    expect(el("progress-upload-eta").textContent).toBe("—");
  });

  it("rows move to Uploading with a live percent status", { timeout: 15_000 }, async () => {
    await vi.waitFor(
      () => {
        const uploading = rows().find((r) => badgeOf(r).textContent === "Uploading");
        expect(uploading).toBeDefined();
        expect(uploading!.querySelector('[data-role="status"]')!.textContent).toMatch(/^\d+%$/);
      },
      { timeout: 12_000 },
    );
  });

  it("finishes with every row Done and a completed summary", { timeout: 30_000 }, async () => {
    await vi.waitFor(
      () => {
        expect(visibleBadgeTexts()).toEqual(["Done", "Done"]);
      },
      { timeout: 20_000 },
    );
    // The 500ms ticker refreshes the summary even after the last progress event.
    await vi.waitFor(
      () => {
        expect(el("progress-footer-left").textContent).toBe("2 done");
        expect(el("progress-hash-eta").textContent).toBe("done");
        expect(el("progress-upload-eta").textContent).toBe("done");
      },
      { timeout: 5_000 },
    );
    expect(el("progress-footer-mid").textContent).toBe("");
    expect(el("progress-hash-pct").textContent).toBe("100%");
    expect(el("progress-upload-pct").textContent).toBe("100%");
    expect(el("progress-hash-files").textContent).toBe("2 of 2");
    expect(el("progress-upload-files").textContent).toBe("2 of 2");
    expect(el("progress-hash-fill").style.width).toBe("100%");
    expect(el("progress-upload-fill").style.width).toBe("100%");
    for (const row of rows()) {
      expect(badgeOf(row).className).toBe("badge ok");
      expect(row.querySelector('[data-role="status"]')!.textContent).toBe("");
      expect(row.querySelector('[data-role="progress-wrap"]')!.classList.contains("done")).toBe(true);
    }
  });

  it("hides Cancel all and refreshes the upload bar once the batch settles", async () => {
    await vi.waitFor(() => {
      expect(el("cancel-all-btn").hidden).toBe(true);
    });
    // Everything staged was consumed, so there is nothing left to upload (bar stays, button goes).
    expect(el("upload-bar").hidden).toBe(false);
    expect(el("upload-all-btn").hidden).toBe(true);
    expect(el("upload-all-btn").textContent).toBe("Upload 0 files (0 B)");
  });

  it("no longer warns about leaving and never touched the network (mock skips the report)", () => {
    expect(dispatchBeforeUnload()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
