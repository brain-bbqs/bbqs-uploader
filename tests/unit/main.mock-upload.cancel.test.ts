// @vitest-environment jsdom
// Boots src/main.ts with "?test&mock_upload=2" and cancels the simulated pipeline: once
// mid-upload (mockUploadFile's abort catch), then a freshly staged batch mid-scan
// (registerHashJob's AbortError catch), plus the beforeunload guard that only arms while
// uploads are in flight. Separate file from main.mock-upload.test.ts because module state
// persists per boot. Same clock scheme as that file: boot on real timers, phases driven on
// fake timers (rAF + performance.now) so every transition lands deterministically.
import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

// Lets the promise chains between animation frames settle (fake timers never block microtasks).
async function flushMicrotasks(turns = 25): Promise<void> {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  // Pins the injected batch to two 10 MB files (scan/upload animate ~1264ms each).
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

describe("cancelling a mock batch", () => {
  it("arms the leave warning only once uploads are in flight, not during the scan", async () => {
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
    expect(rows().map((r) => badgeOf(r).textContent)).toEqual(["Scanning", "Scanning"]);
    // Scanning registers no upload AbortControllers, so leaving is still allowed.
    expect(dispatchBeforeUnload()).toBe(false);

    // Past both scans (~1264ms) into the upload phase.
    await vi.advanceTimersByTimeAsync(1400);
    expect(rows().map((r) => badgeOf(r).textContent)).toEqual(["Uploading", "Uploading"]);
    expect(dispatchBeforeUnload()).toBe(true);
  });

  it("Cancel all mid-upload marks every row Cancelled and freezes the summary", async () => {
    el("cancel-all-btn").click();
    await flushMicrotasks();
    expect(rows().map((r) => badgeOf(r).textContent)).toEqual(["Cancelled", "Cancelled"]);
    for (const row of rows()) expect(badgeOf(row).className).toBe("badge warn");
    expect(el("progress-footer-left").textContent).toBe("2 cancelled");
    // The batch settled: Cancel all goes away, the ETA freezes instead of counting down, and
    // leaving no longer warns.
    expect(el("cancel-all-btn").hidden).toBe(true);
    expect(el("progress-upload-eta").textContent).toBe("—");
    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("Cancel all mid-scan cancels a freshly staged batch via its hash jobs", async () => {
    // mockMode covers genuinely picked files too; 40 MB keeps the scan animating ~1664ms.
    pickFolder([
      fakeFolderFile("c.bin", "second/c.bin", 40 * 1024 * 1024),
      fakeFolderFile("d.bin", "second/d.bin", 40 * 1024 * 1024),
    ]);
    await flushMicrotasks();
    const staged = () => rows().filter((r) => r.title.includes("/second/"));
    expect(staged()).toHaveLength(2);
    expect(el("upload-all-btn").textContent).toContain("Upload 2 files (");

    el("upload-all-btn").click();
    await flushMicrotasks();
    expect(staged().map((r) => badgeOf(r).textContent)).toEqual(["Scanning", "Scanning"]);
    expect(el("cancel-all-btn").hidden).toBe(false);

    // Some scan progress first, so the partial-scan stats path runs; 300ms is well inside the
    // ~1664ms animation.
    await vi.advanceTimersByTimeAsync(300);
    el("cancel-all-btn").click();
    await flushMicrotasks();
    expect(staged().map((r) => badgeOf(r).textContent)).toEqual(["Cancelled", "Cancelled"]);
    // Outcome counts accumulate across batches in the same session.
    expect(el("progress-footer-left").textContent).toBe("4 cancelled");
    expect(el("cancel-all-btn").hidden).toBe(true);
    // Nothing left in flight freezes the scan bar mid-way instead of crediting the lost bytes.
    expect(el("progress-hash-eta").textContent).toBe("—");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
