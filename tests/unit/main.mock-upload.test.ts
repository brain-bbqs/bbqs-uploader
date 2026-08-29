// @vitest-environment jsdom
// Boots src/main.ts with "?test&mock_upload=2" and runs the simulated pipeline to completion:
// auto-staged fake files, the shared scan phase (registerHashJob's success path), the mock upload
// phase, the coalesced progress summary (phase bars, ETA text, footer counts), and the batch
// epilogue (Cancel-all hiding, upload bar refresh, no transfer report in mock mode). The boot
// runs on real timers; the phases themselves are driven on fake timers (rAF + performance.now),
// so every animation-frame transition lands deterministically instead of racing the wall clock.
import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";

// Both pinned 10 MB files animate for 600 + log2(10)*200 ≈ 1264ms per phase (see mockUpload.ts).
const PHASE_MS = 600 + Math.log2(10) * 200;

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

// Lets the promise chains between animation frames settle (fake timers never block microtasks).
async function flushMicrotasks(turns = 25): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  // Pins the injected batch to two 10 MB files at the mock size range's floor, so the phase
  // durations and staged names/paths are reproducible.
  vi.spyOn(Math, "random").mockReturnValue(0);
  await bootMain("?test&mock_upload=2");
  await vi.waitFor(
    () => {
      expect(rows()).toHaveLength(2);
    },
    { timeout: 10_000 },
  );
});

afterAll(() => {
  vi.useRealTimers();
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

  it("Upload starts the scan phase: badges, summary, Cancel all, consumed checkboxes", async () => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
      ],
    });
    el("upload-all-btn").click();
    await flushMicrotasks();
    expect(visibleBadgeTexts()).toEqual(["Scanning", "Scanning"]);
    expect(el("progress-summary").hidden).toBe(false);
    expect(el("cancel-all-btn").hidden).toBe(false);
    // The batch consumed the selection, so the rows' include checkboxes lock.
    for (const row of rows()) {
      expect(row.querySelector<HTMLInputElement>(".select-check")!.disabled).toBe(true);
    }

    // Mid-scan: bytes flow, the warm-up window keeps the ETA estimating, the idle upload phase
    // shows the — placeholder.
    await vi.advanceTimersByTimeAsync(600);
    expect(visibleBadgeTexts()).toEqual(["Scanning", "Scanning"]);
    for (const row of rows()) {
      const width = row.querySelector<HTMLSpanElement>('[data-role="progress"]')!.style.width;
      expect(parseFloat(width)).toBeGreaterThan(0);
    }
    expect(el("progress-hash-eta").textContent).toBe("estimating…");
    expect(el("progress-upload-eta").textContent).toBe("—");
  });

  it("scan completion hands each row to the mock upload phase", async () => {
    // Past both scans' end (~1264ms), into the first stretch of the uploads.
    await vi.advanceTimersByTimeAsync(PHASE_MS - 600 + 150);
    expect(visibleBadgeTexts()).toEqual(["Uploading", "Uploading"]);
    for (const row of rows()) {
      expect(row.querySelector('[data-role="status"]')!.textContent).toMatch(/^\d+%$/);
    }
    expect(el("progress-hash-pct").textContent).toBe("100%");
    expect(el("progress-hash-fill").style.width).toBe("100%");
    expect(el("progress-hash-files").textContent).toBe("2 of 2");
  });

  it("finishes with every row Done and a completed summary", async () => {
    await vi.advanceTimersByTimeAsync(PHASE_MS + 200);
    await flushMicrotasks();
    expect(visibleBadgeTexts()).toEqual(["Done", "Done"]);
    expect(el("progress-footer-left").textContent).toBe("2 done");
    expect(el("progress-footer-mid").textContent).toBe("");
    expect(el("progress-upload-pct").textContent).toBe("100%");
    expect(el("progress-upload-fill").style.width).toBe("100%");
    expect(el("progress-upload-files").textContent).toBe("2 of 2");
    // reportHashBytes/reportUploadBytes round each report to whole bytes, so the telescoped
    // done-bytes counters land exactly on the totals and both phases settle at "done".
    expect(el("progress-hash-eta").textContent).toBe("done");
    expect(el("progress-upload-eta").textContent).toBe("done");
    expect(el("progress-hash-done").textContent).toMatch(/^(.+) of \1$/);
    expect(el("progress-upload-done").textContent).toMatch(/^(.+) of \1$/);
    for (const row of rows()) {
      expect(badgeOf(row).className).toBe("badge ok");
      expect(row.querySelector('[data-role="status"]')!.textContent).toBe("");
      expect(row.querySelector('[data-role="progress-wrap"]')!.classList.contains("done")).toBe(true);
    }
  });

  it("hides Cancel all and refreshes the upload bar once the batch settles", () => {
    expect(el("cancel-all-btn").hidden).toBe(true);
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
