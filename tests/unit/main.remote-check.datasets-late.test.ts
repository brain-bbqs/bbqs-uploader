// @vitest-environment jsdom
// Boots src/main.ts signed in from stored tokens, with the incoming-datasets list still loading,
// and stages a folder before that list lands: the dropzone is live as soon as the stored tokens
// load, so a quick pick can beat the list. Once the list selects a dataset, the staged tree must
// be diffed against it rather than staying unchecked.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";
import {
  listIncomingDandisets,
  fetchDraftMetadata,
  type IncomingDandisetsResult,
  type OAuthTokenSet,
} from "@brain-bbqs/ember-client";
import { STORAGE_KEY } from "../../src/lib/settings";
import { ensureFreshToken, handleRedirectCallback } from "../../src/lib/oauth";
import { renderIdentity } from "../../src/ui/connection";
import { listRemoteFiles } from "../../src/lib/remote-listing";

vi.mock("../../src/lib/oauth");
vi.mock("../../src/ui/connection");
vi.mock("@brain-bbqs/ember-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brain-bbqs/ember-client")>()),
  listIncomingDandisets: vi.fn(),
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

let resolveDatasets!: (result: IncomingDandisetsResult) => void;

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ oauth: SEEDED_TOKENS }));
  vi.mocked(handleRedirectCallback).mockResolvedValue(null);
  vi.mocked(ensureFreshToken).mockImplementation((tokens) => Promise.resolve(tokens));
  vi.mocked(renderIdentity).mockResolvedValue(undefined);
  vi.mocked(fetchDraftMetadata).mockResolvedValue({});
  vi.mocked(listIncomingDandisets).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveDatasets = resolve;
      }),
  );
  vi.mocked(listRemoteFiles).mockResolvedValue(new Map([["sourcedata/raw/base/same.bin", 4]]));
  await bootMain();
  await vi.waitFor(() => {
    expect(listIncomingDandisets).toHaveBeenCalledTimes(1);
  });
});

describe("a folder staged before the dataset list loads", () => {
  it("has no dataset to diff against yet, so no archive check runs", async () => {
    expect(el("dropzone").hidden).toBe(false);
    pickFolder([fakeFolderFile("same.bin", "base/same.bin", 4), fakeFolderFile("new.bin", "base/new.bin", 6)]);
    await vi.waitFor(() => {
      expect(el("selection-summary").textContent).toContain("2 of 2 files");
    });

    expect(el("remote-banner").hidden).toBe(true);
    expect(listRemoteFiles).not.toHaveBeenCalled();
  });

  it("is diffed against the dataset the list selects once it lands", async () => {
    resolveDatasets({ datasets: [{ identifier: "000123", title: "Incoming: Lab", embargoed: true }], unverified: 0 });

    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("Already on EMBER: 1 file (4 B)");
    });
    expect(el("remote-banner").hidden).toBe(false);
    expect(vi.mocked(listRemoteFiles).mock.calls.map(([cfg]) => cfg.dandisetId)).toEqual(["000123"]);
    expect(el("selection-summary").textContent).toContain("1 of 2 files");
  });
});
