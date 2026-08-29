// @vitest-environment jsdom
// Boots src/main.ts with stored settings seeded and no OAuth callback: the session restores from
// localStorage, the due token refresh returns a new token set that gets re-saved, and a failed
// human-subjects metadata check warns without closing the upload gate.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";
import { ensureFreshToken, handleRedirectCallback } from "../../src/lib/oauth";
import { listIncomingDandisets, type IncomingDandiset } from "../../src/lib/dandisets";
import { fetchDraftMetadata } from "../../src/lib/humanSubjects";
import { renderIdentity } from "../../src/ui/connection";
import { listRemoteFiles } from "../../src/lib/remote-listing";
import type { OAuthTokenSet, StoredSettings } from "../../src/lib/types";

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

// Already at expiry, so a refresh is due the moment any request path runs.
const SEEDED_TOKENS: OAuthTokenSet = {
  accessToken: "seeded-access",
  refreshToken: "seeded-refresh",
  expiresAt: Date.now(),
};
const DATASETS: IncomingDandiset[] = [
  { identifier: "000123", title: "Incoming: Real set", embargoed: true },
  { identifier: "000456", title: "Incoming: Second set", embargoed: true },
];

let warnSpy: MockInstance;

function storedSettings(): StoredSettings {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!) as StoredSettings;
}

beforeAll(async () => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  // Seeded before boot so loadSettings() restores both the session and the remembered dataset.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ dandisetId: "000456", oauth: SEEDED_TOKENS }));
  vi.mocked(handleRedirectCallback).mockResolvedValue(null);
  // A different object back means the refresh actually happened and must be persisted.
  vi.mocked(ensureFreshToken).mockImplementation((tokens) =>
    Promise.resolve({ ...tokens, accessToken: "refreshed-access" }),
  );
  vi.mocked(renderIdentity).mockResolvedValue(undefined);
  vi.mocked(listRemoteFiles).mockResolvedValue(new Map());
  vi.mocked(listIncomingDandisets).mockResolvedValue(DATASETS);
  vi.mocked(fetchDraftMetadata).mockRejectedValue(new Error("metadata endpoint down"));
  await bootMain();
});

describe("signed-in session restored from stored settings", () => {
  it("renders the signed-in header without any callback tokens", () => {
    expect(el("oauth-signin-btn").hidden).toBe(true);
    expect(el("oauth-signed-in").hidden).toBe(false);
    expect(handleRedirectCallback).toHaveBeenCalledTimes(1);
  });

  it("re-saves the settings with the refreshed token set", async () => {
    await vi.waitFor(() => {
      expect(storedSettings().oauth?.accessToken).toBe("refreshed-access");
    });
    expect(ensureFreshToken).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "seeded-access" }));
    // The identity render sees the refreshed token, not the stale seeded one.
    expect(renderIdentity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accessToken: "refreshed-access" }),
    );
  });

  it("restores the remembered dataset into the dropdown and the archive link", async () => {
    const select = el<HTMLSelectElement>("dandiset-id");
    await vi.waitFor(() => {
      expect(select.hidden).toBe(false);
    });
    expect(select.value).toBe("000456");
    const link = el<HTMLAnchorElement>("view-dataset-link");
    expect(link.hidden).toBe(false);
    expect(link.href).toContain("/dandiset/000456/draft/files");
  });

  it("warns on a failed metadata check but leaves the upload gate open", async () => {
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        "Could not check the selected dataset's metadata for human-subjects data:",
        expect.any(Error),
      );
    });
    expect(el("human-subjects-banner").hidden).toBe(true);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(false);
    expect(el("folder-card").hidden).toBe(false);
    expect(el("dropzone").hidden).toBe(false);
  });
});
