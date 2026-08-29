// @vitest-environment jsdom
// Boots signed in from stored settings with the incoming-datasets fetch REJECTING: the picker
// shows the could-not-load placeholder while the remembered dataset id survives for a retry.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";
import { ensureFreshToken, handleRedirectCallback } from "../../src/lib/oauth";
import { listIncomingDandisets } from "../../src/lib/dandisets";
import { fetchDraftMetadata } from "../../src/lib/humanSubjects";
import { renderIdentity } from "../../src/ui/connection";
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

const SEEDED_TOKENS: OAuthTokenSet = {
  accessToken: "seeded-access",
  refreshToken: "seeded-refresh",
  expiresAt: Date.now() + 3_600_000,
};

function storedSettings(): StoredSettings {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!) as StoredSettings;
}

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ dandisetId: "000456", oauth: SEEDED_TOKENS }));
  vi.mocked(handleRedirectCallback).mockResolvedValue(null);
  vi.mocked(ensureFreshToken).mockImplementation((tokens) => Promise.resolve(tokens));
  vi.mocked(renderIdentity).mockResolvedValue(undefined);
  vi.mocked(listIncomingDandisets).mockRejectedValue(new Error("archive is down"));
  await bootMain();
});

describe("failed incoming-datasets fetch while signed in", () => {
  it("shows the could-not-load placeholder but stays signed in", async () => {
    await vi.waitFor(() => {
      expect(el("dandiset-message").textContent).toContain("Could not load your datasets");
    });
    expect(el("dandiset-message").hidden).toBe(false);
    expect(el("dandiset-id").hidden).toBe(true);
    expect(el("oauth-signed-in").hidden).toBe(false);
    expect(listIncomingDandisets).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "seeded-access" }));
  });

  it("keeps the remembered dataset id saved for the next attempt", async () => {
    await vi.waitFor(() => {
      expect(storedSettings().dandisetId).toBe("000456");
    });
    expect(storedSettings().oauth?.accessToken).toBe("seeded-access");
    // No selected dataset, so no archive link, no browse button, and no metadata check.
    expect(el("view-dataset-link").hidden).toBe(true);
    expect(el("load-remote-btn").hidden).toBe(true);
    expect(fetchDraftMetadata).not.toHaveBeenCalled();
  });
});
