// @vitest-environment jsdom
// Boots src/main.ts with "?test&freeze_scan" (signed out): every scan pins at its just-started
// state, holding the Scanning badges and 0% summary still until "Cancel all" rejects the frozen
// hash jobs. The upload attempts that follow then hit the signed-out config gate, so the batch
// settles as blocked — covering the zero-progress cancel bookkeeping and the blocked tally.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";

const fetchMock = vi.fn(() => Promise.reject(new Error("network disabled in test")));

function badges(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLSpanElement>('#file-list .file-item [data-role="badge"]'),
    (b) => b.textContent ?? "",
  );
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  await bootMain("?test&freeze_scan");
  pickFolder([fakeFolderFile("a.bin", "base/a.bin", 64), fakeFolderFile("b.bin", "base/b.bin", 32)]);
  await vi.waitFor(() => {
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(2);
  });
});

describe("frozen scanning", () => {
  it("holds every row at Scanning with the summary pinned to zero progress", async () => {
    el("upload-all-btn").click();
    await new Promise((r) => setTimeout(r, 25));

    expect(badges()).toEqual(["Scanning", "Scanning"]);
    expect(el("cancel-all-btn").hidden).toBe(false);
    expect(el("progress-summary").hidden).toBe(false);
    expect(el("progress-hash-pct").textContent).toBe("0%");
    expect(el("progress-hash-files").textContent).toContain("0");
  });

  it("Cancel all rejects the frozen scans; the blocked uploads then settle the batch", async () => {
    el("cancel-all-btn").click();

    // The frozen jobs reject with AbortError (no bytes were ever hashed), the queue resumes,
    // and each upload attempt is blocked by the signed-out config before any network use.
    await vi.waitFor(() => {
      expect(badges()).toEqual(["Blocked", "Blocked"]);
    });
    expect(el("progress-footer-left").textContent).toBe("2 blocked");
    expect(el("cancel-all-btn").hidden).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
