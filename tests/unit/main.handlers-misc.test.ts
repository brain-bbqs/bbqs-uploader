// @vitest-environment jsdom
// Boots src/main.ts signed in with two datasets and covers the smaller interaction handlers:
// the human-subjects gate's out-of-order metadata guards and its Upload block, an Upload click
// with nothing selected, the ignore-pattern input's Enter/duplicate/empty handling, "Change
// folder", the What's New modal's re-open and already-cleared-hash close, and the reveal
// slider's frame-coalesced input handling.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";
import { ensureFreshToken, handleRedirectCallback } from "../../src/lib/oauth";
import { listIncomingDandisets } from "../../src/lib/dandisets";
import { fetchDraftMetadata, HUMAN_SUBJECTS_PHRASE, type DraftVersionMetadata } from "../../src/lib/humanSubjects";
import { renderIdentity } from "../../src/ui/connection";
import { listRemoteFiles } from "../../src/lib/remote-listing";
import type { OAuthTokenSet } from "../../src/lib/types";

vi.mock("../../src/lib/oauth");
vi.mock("../../src/lib/dandisets");
vi.mock("../../src/ui/connection");
vi.mock("../../src/lib/humanSubjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/humanSubjects")>()),
  fetchDraftMetadata: vi.fn(),
}));
vi.mock("../../src/lib/remote-listing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/remote-listing")>()),
  listRemoteFiles: vi.fn(),
}));

const SEEDED_TOKENS: OAuthTokenSet = {
  accessToken: "seeded-access",
  refreshToken: "seeded-refresh",
  expiresAt: Number.MAX_SAFE_INTEGER,
};

/** Every human-subjects metadata fetch parks here until the test settles it by hand. */
const metadataCalls: { resolve: (m: DraftVersionMetadata) => void; reject: (e: unknown) => void }[] = [];

let warnSpy: MockInstance;

function selectDataset(identifier: string): void {
  const select = el<HTMLSelectElement>("dandiset-id");
  select.value = identifier;
  select.dispatchEvent(new Event("change"));
}

async function metadataCallAfter(action: () => void) {
  const before = metadataCalls.length;
  action();
  await vi.waitFor(() => {
    expect(metadataCalls.length).toBe(before + 1);
  });
  return metadataCalls[metadataCalls.length - 1];
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeAll(async () => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ dandisetId: "000123", oauth: SEEDED_TOKENS }));
  vi.mocked(handleRedirectCallback).mockResolvedValue(null);
  vi.mocked(ensureFreshToken).mockImplementation((tokens) => Promise.resolve(tokens));
  vi.mocked(renderIdentity).mockResolvedValue(undefined);
  vi.mocked(listRemoteFiles).mockResolvedValue(new Map());
  vi.mocked(listIncomingDandisets).mockResolvedValue([
    { identifier: "000123", title: "Incoming: First", embargoed: true },
    { identifier: "000456", title: "Incoming: Second", embargoed: true },
  ]);
  vi.mocked(fetchDraftMetadata).mockImplementation(
    () => new Promise((resolve, reject) => metadataCalls.push({ resolve, reject })),
  );
  await bootMain();
  await vi.waitFor(() => {
    expect(el<HTMLSelectElement>("dandiset-id").hidden).toBe(false);
    expect(metadataCalls.length).toBe(1);
  });
  metadataCalls[0].resolve({});
});

describe("gate races and interaction handlers", () => {
  it("stages a folder for the scenarios below", async () => {
    pickFolder([fakeFolderFile("a.bin", "stuff/a.bin", 4), fakeFolderFile("b.bin", "stuff/b.bin", 6)]);
    await vi.waitFor(() => {
      expect(el("selection-summary").textContent).toContain("2 of 2 files");
    });
  });

  it("ignores a stale metadata result that lands after a newer dataset switch", async () => {
    const stale = await metadataCallAfter(() => selectDataset("000456"));
    const current = await metadataCallAfter(() => selectDataset("000123"));

    // The old dataset's answer arrives late claiming human subjects; it must not gate 000123.
    stale.resolve({ description: `beware: ${HUMAN_SUBJECTS_PHRASE}` });
    await settle();
    expect(el("human-subjects-banner").hidden).toBe(true);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(false);

    current.resolve({});
    await settle();
    expect(el("human-subjects-banner").hidden).toBe(true);
  });

  it("ignores a stale metadata failure the same way, without even warning", async () => {
    const stale = await metadataCallAfter(() => selectDataset("000456"));
    const current = await metadataCallAfter(() => selectDataset("000123"));

    const warnsBefore = warnSpy.mock.calls.length;
    stale.reject(new Error("stale metadata fetch died"));
    await settle();
    expect(warnSpy.mock.calls.length).toBe(warnsBefore);
    expect(el("human-subjects-banner").hidden).toBe(true);

    current.resolve({});
    await settle();
  });

  it("blocks Upload on an unconfirmed human-subjects dataset until 'I confirm'", async () => {
    const call = await metadataCallAfter(() => selectDataset("000456"));
    call.resolve({ description: `This dataset ${HUMAN_SUBJECTS_PHRASE}.` });
    await vi.waitFor(() => {
      expect(el("human-subjects-banner").hidden).toBe(false);
    });
    expect(el("human-subjects-unconfirmed").hidden).toBe(false);
    const uploadBtn = el<HTMLButtonElement>("upload-all-btn");
    expect(uploadBtn.disabled).toBe(true);

    // Even a click that slips past the disabled attribute must not start the batch.
    uploadBtn.disabled = false;
    uploadBtn.click();
    await settle();
    expect(el("progress-summary").hidden).toBe(true);
    uploadBtn.disabled = true;

    el("human-subjects-confirm-btn").click();
    expect(el("human-subjects-confirmed").hidden).toBe(false);
    expect(uploadBtn.disabled).toBe(false);
  });

  it("refuses an Upload click when nothing is selected", async () => {
    el("select-none-btn").click();
    expect(el("upload-all-btn").hidden).toBe(true);

    el("upload-all-btn").click();
    await settle();
    expect(el("progress-summary").hidden).toBe(true);

    el("select-all-btn").click();
    expect(el("upload-all-btn").hidden).toBe(false);
  });

  it("adds ignore patterns on Enter and refuses duplicates and empties", () => {
    const input = el<HTMLInputElement>("ignore-pattern-input");
    input.value = "*.tmp";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(input.value).toBe("");
    expect(el("ignore-chips").querySelectorAll(".ignore-chip")).toHaveLength(1);

    // A non-Enter key changes nothing.
    input.value = "*.log";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", cancelable: true }));
    expect(input.value).toBe("*.log");

    // Duplicates keep the input as-is (nothing consumed) and add no chip.
    input.value = "*.tmp";
    el("ignore-pattern-add").click();
    expect(input.value).toBe("*.tmp");
    expect(el("ignore-chips").querySelectorAll(".ignore-chip")).toHaveLength(1);

    input.value = "   ";
    el("ignore-pattern-add").click();
    expect(el("ignore-chips").querySelectorAll(".ignore-chip")).toHaveLength(1);
  });

  it("Change folder clears the staging area and reopens the folder picker", () => {
    const picker = vi.spyOn(el<HTMLInputElement>("folder-input"), "click").mockImplementation(() => {});
    el("change-folder-btn").click();
    expect(picker).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(0);
    expect(el("files-card").hidden).toBe(true);
    picker.mockRestore();
  });

  it("re-opening What's New while already open is a no-op, and closing tolerates a cleared hash", async () => {
    el("whats-new-button").click();
    const modal = el<HTMLDialogElement>("whats-new-modal");
    expect(modal.open).toBe(true);
    await vi.waitFor(() => {
      expect(window.location.hash).toBe("#changelog");
    });

    // A repeated open request (the hashchange listener re-fires on the same hash) changes nothing.
    window.dispatchEvent(new Event("hashchange"));
    expect(modal.open).toBe(true);

    // Something else already stripped the fragment; closing must not touch the URL again.
    window.history.replaceState({}, "", "/");
    el("whats-new-close").click();
    expect(modal.open).toBe(false);
    expect(window.location.hash).toBe("");
  });

  it("coalesces reveal-slider input into one per-frame update that re-expands folders", async () => {
    pickFolder([
      fakeFolderFile("c1.bin", "deep/sub/c1.bin", 1),
      fakeFolderFile("c2.bin", "deep/sub/c2.bin", 1),
      fakeFolderFile("c3.bin", "deep/sub/c3.bin", 1),
    ]);
    await vi.waitFor(() => {
      expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(3);
    });

    // Collapse a folder by hand; the slider must override it (its count would lie otherwise).
    const deepToggle = Array.from(document.querySelectorAll<HTMLButtonElement>("#file-list .dir-toggle")).find(
      (t) => t.querySelector(".dir-name")?.textContent === "deep/",
    )!;
    deepToggle.click();
    expect(deepToggle.getAttribute("aria-expanded")).toBe("false");

    const slider = el<HTMLInputElement>("expand-depth");
    slider.value = "2";
    slider.dispatchEvent(new Event("input"));
    slider.value = "3";
    slider.dispatchEvent(new Event("input")); // second event lands inside the same frame

    await vi.waitFor(() => {
      expect(deepToggle.getAttribute("aria-expanded")).toBe("true");
    });
    expect(el("expand-depth-value").textContent).toBe("3");
    const visible = Array.from(document.querySelectorAll<HTMLLIElement>("#file-list .file-item")).filter(
      (li) => !li.hidden,
    );
    expect(visible).toHaveLength(3);
  });
});
