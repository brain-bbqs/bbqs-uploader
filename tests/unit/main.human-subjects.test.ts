// @vitest-environment jsdom
// Boots src/main.ts with "?test&num_datasets=2&human_subjects" (signed out): every fake dataset
// carries the human-subjects flag, so the warning banner gates the upload button until the
// per-dataset "I confirm", which is then remembered per dandiset id for the rest of the session.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";

const fetchMock = vi.fn(() => Promise.reject(new Error("network disabled in tests")));

function selectDataset(id: string): void {
  const select = el<HTMLSelectElement>("dandiset-id");
  select.value = id;
  select.dispatchEvent(new Event("change"));
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  await bootMain("?test&num_datasets=2&human_subjects");
});

describe("human-subjects confirmation gate (signed out)", () => {
  it("boots with the warning banner shown and the upload gate closed", async () => {
    await vi.waitFor(() => {
      expect(el("human-subjects-banner").hidden).toBe(false);
    });
    expect(el("human-subjects-unconfirmed").hidden).toBe(false);
    expect(el("human-subjects-confirmed").hidden).toBe(true);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(true);
    // Signed out, so the folder card and its dropzone stay hidden regardless of the gate.
    expect(el("folder-card").hidden).toBe(true);
    expect(el("dropzone").hidden).toBe(true);
    // Ascending integer order puts the more negative fake id first; nothing stored, so it wins.
    const select = el<HTMLSelectElement>("dandiset-id");
    expect(Array.from(select.options, (o) => o.value)).toEqual(["-000002", "-000001"]);
    expect(select.value).toBe("-000002");
  });

  it("I confirm swaps the warning for the confirmed notice and opens the upload gate", () => {
    el("human-subjects-confirm-btn").click();
    expect(el("human-subjects-banner").hidden).toBe(false);
    expect(el("human-subjects-unconfirmed").hidden).toBe(true);
    expect(el("human-subjects-confirmed").hidden).toBe(false);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(false);
  });

  it("switching to the other dataset demands its own confirmation", async () => {
    selectDataset("-000001");
    await vi.waitFor(() => {
      expect(el("human-subjects-unconfirmed").hidden).toBe(false);
    });
    expect(el("human-subjects-confirmed").hidden).toBe(true);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(true);
  });

  it("switching back finds the first dataset still confirmed this session", async () => {
    selectDataset("-000002");
    await vi.waitFor(() => {
      expect(el("human-subjects-confirmed").hidden).toBe(false);
    });
    expect(el("human-subjects-unconfirmed").hidden).toBe(true);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(false);
  });

  it("a staged folder keeps its card visible when the gate closes again", async () => {
    pickFolder([fakeFolderFile("a.bin", "base/a.bin"), fakeFolderFile("b.bin", "base/sub/b.bin")]);
    await vi.waitFor(() => {
      expect(el("selection-summary").textContent).toContain("2 of 2 files");
    });
    expect(el("folder-card").hidden).toBe(false);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(false);

    // The unconfirmed dataset closes the gate again, but the staged folder survives on screen.
    selectDataset("-000001");
    await vi.waitFor(() => {
      expect(el("human-subjects-unconfirmed").hidden).toBe(false);
    });
    expect(el("folder-card").hidden).toBe(false);
    expect(el("files-card").hidden).toBe(false);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(true);
  });

  it("never touched the network", () => {
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
