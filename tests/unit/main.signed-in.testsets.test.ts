// @vitest-environment jsdom
// Boots "?test&num_datasets=2" signed in (seeded tokens) with the token refresh REJECTING: the
// injected-dataset branch still refreshes and renders the identity, and the failed refresh falls
// back to the stored tokens instead of signing the session out.
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
  expiresAt: Date.now(),
};

function storedSettings(): StoredSettings {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!) as StoredSettings;
}

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ oauth: SEEDED_TOKENS }));
  vi.mocked(handleRedirectCallback).mockResolvedValue(null);
  vi.mocked(ensureFreshToken).mockRejectedValue(new Error("refresh endpoint down"));
  vi.mocked(renderIdentity).mockResolvedValue(undefined);
  await bootMain("?test&num_datasets=2");
});

describe("injected datasets while signed in", () => {
  it("attempts the refresh and renders the identity, surviving the refresh failure", async () => {
    await vi.waitFor(() => {
      expect(renderIdentity).toHaveBeenCalled();
    });
    expect(ensureFreshToken).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "seeded-access" }));
    // The failed refresh falls back to the stored tokens rather than signing out.
    expect(renderIdentity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accessToken: "seeded-access" }),
    );
    expect(el("oauth-signed-in").hidden).toBe(false);
    expect(el("oauth-signin-btn").hidden).toBe(true);
  });

  it("applies the injected list without touching the real dataset endpoints", async () => {
    const select = el<HTMLSelectElement>("dandiset-id");
    await vi.waitFor(() => {
      expect(select.hidden).toBe(false);
    });
    expect(Array.from(select.options, (o) => o.value)).toEqual(["-000002", "-000001"]);
    expect(select.value).toBe("-000002");
    expect(listIncomingDandisets).not.toHaveBeenCalled();
    // Fake identifiers have no real draft, so the human-subjects check never fetches.
    expect(fetchDraftMetadata).not.toHaveBeenCalled();
    // The fake negative identifier resolves to no dandiset id, so no archive URL exists.
    expect(el("view-dataset-link").hidden).toBe(true);
  });

  it("keeps the stored tokens untouched after the failed refresh", () => {
    expect(storedSettings().oauth?.accessToken).toBe("seeded-access");
    expect(storedSettings().dandisetId).toBeUndefined();
  });
});
