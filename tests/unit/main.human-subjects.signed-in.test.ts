// @vitest-environment jsdom
// Boots the same "?test&num_datasets=2&human_subjects" injection signed in (stored OAuth tokens
// seeded before boot), where the unconfirmed gate is what withholds the folder card and dropzone:
// confirming brings both back, and switching to an unconfirmed dataset takes them away again.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";

const fetchMock = vi.fn(() => Promise.reject(new Error("network disabled in tests")));

function selectDataset(id: string): void {
  const select = el<HTMLSelectElement>("dandiset-id");
  select.value = id;
  select.dispatchEvent(new Event("change"));
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  // A far-from-expiry token seeded before boot signs the session in without any network round
  // trip (no refresh is due, and renderIdentity swallows its fetch failure against the stub).
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      dandisetId: "-000001",
      oauth: { accessToken: "test-token", expiresAt: Date.now() + 3_600_000 },
    }),
  );
  await bootMain("?test&num_datasets=2&human_subjects");
});

describe("human-subjects gate while signed in", () => {
  it("withholds the folder card and dropzone until the restored dataset is confirmed", async () => {
    expect(el("oauth-signed-in").hidden).toBe(false);
    await vi.waitFor(() => {
      expect(el("human-subjects-banner").hidden).toBe(false);
    });
    // Restored from stored settings, so it's the second option that starts selected.
    expect(el<HTMLSelectElement>("dandiset-id").value).toBe("-000001");
    expect(el("human-subjects-unconfirmed").hidden).toBe(false);
    expect(el("human-subjects-confirmed").hidden).toBe(true);
    expect(el("folder-card").hidden).toBe(true);
    expect(el("dropzone").hidden).toBe(true);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(true);
  });

  it("I confirm reopens the folder card and dropzone", () => {
    el("human-subjects-confirm-btn").click();
    expect(el("human-subjects-confirmed").hidden).toBe(false);
    expect(el("human-subjects-unconfirmed").hidden).toBe(true);
    expect(el("folder-card").hidden).toBe(false);
    expect(el("dropzone").hidden).toBe(false);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(false);
  });

  it("an unconfirmed dataset withholds them again while nothing is staged", async () => {
    selectDataset("-000002");
    await vi.waitFor(() => {
      expect(el("human-subjects-unconfirmed").hidden).toBe(false);
    });
    expect(el("folder-card").hidden).toBe(true);
    expect(el("dropzone").hidden).toBe(true);

    // The session cache still covers the dataset confirmed above.
    selectDataset("-000001");
    await vi.waitFor(() => {
      expect(el("human-subjects-confirmed").hidden).toBe(false);
    });
    expect(el("folder-card").hidden).toBe(false);
    expect(el("dropzone").hidden).toBe(false);
  });

  it("a staged folder keeps its card through a switch to an unconfirmed dataset", async () => {
    pickFolder([fakeFolderFile("a.bin", "base/a.bin")]);
    await vi.waitFor(() => {
      expect(el("folder-summary-name").textContent).toBe("base");
    });
    // Staged, so the dropzone's card spot belongs to the summary row from here on.
    expect(el("dropzone").hidden).toBe(true);

    selectDataset("-000002");
    await vi.waitFor(() => {
      expect(el("human-subjects-unconfirmed").hidden).toBe(false);
    });
    expect(el("folder-card").hidden).toBe(false);
    expect(el("files-card").hidden).toBe(false);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(true);
  });
});
