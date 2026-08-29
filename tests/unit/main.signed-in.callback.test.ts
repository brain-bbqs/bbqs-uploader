// @vitest-environment jsdom
// Boots the real src/main.ts as a successful OAuth redirect callback (mocked token exchange):
// boot persists the exchanged tokens, renders the signed-in header, loads the incoming datasets,
// runs the real human-subjects check against mocked draft metadata, and signs back out.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";
import { ensureFreshToken, handleRedirectCallback, revokeToken, startLogin } from "../../src/lib/oauth";
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

const CALLBACK_TOKENS: OAuthTokenSet = {
  accessToken: "cb-access",
  refreshToken: "cb-refresh",
  expiresAt: Date.now() + 3_600_000,
};
const DATASETS: IncomingDandiset[] = [
  { identifier: "000456", title: "Incoming: Second set", embargoed: true },
  { identifier: "000123", title: "Incoming: Real set", embargoed: true },
];

let resolveDatasets!: (datasets: IncomingDandiset[]) => void;

function storedSettings(): StoredSettings {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!) as StoredSettings;
}

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  vi.mocked(handleRedirectCallback).mockResolvedValue(CALLBACK_TOKENS);
  // Nowhere near expiry, so the freshness check hands the same object back (no re-save).
  vi.mocked(ensureFreshToken).mockImplementation((tokens) => Promise.resolve(tokens));
  vi.mocked(revokeToken).mockResolvedValue(undefined);
  vi.mocked(renderIdentity).mockResolvedValue(undefined);
  vi.mocked(listRemoteFiles).mockResolvedValue(new Map());
  // Held pending until the dropdown test resolves it, so the loading placeholder is observable.
  vi.mocked(listIncomingDandisets).mockReturnValue(
    new Promise<IncomingDandiset[]>((res) => {
      resolveDatasets = res;
    }),
  );
  // Only 000123's draft carries the human-subjects marker phrase.
  vi.mocked(fetchDraftMetadata).mockImplementation((cfg) =>
    Promise.resolve({
      description: cfg.dandisetId === "000123" ? "This dataset CONTAINS HUMAN SUBJECTS data." : "Ordinary data.",
    }),
  );
  await bootMain();
});

describe("OAuth callback sign-in", () => {
  it("persists the exchanged tokens and renders the signed-in header", async () => {
    expect(el("oauth-signin-btn").hidden).toBe(true);
    expect(el("oauth-signed-in").hidden).toBe(false);
    expect(storedSettings().oauth?.accessToken).toBe("cb-access");
    await vi.waitFor(() => {
      expect(el("dandiset-message").textContent).toContain("Loading your incoming datasets");
    });
  });

  it("fills the dropdown, ranked by ascending id, once the dataset fetch resolves", async () => {
    resolveDatasets(DATASETS);
    const select = el<HTMLSelectElement>("dandiset-id");
    await vi.waitFor(() => {
      expect(select.hidden).toBe(false);
    });
    expect(Array.from(select.options, (o) => o.value)).toEqual(["000123", "000456"]);
    expect(select.options[0].textContent).toBe("(000123) Incoming: Real set");
    expect(select.value).toBe("000123");
  });

  it("points View on EMBER at the selected dataset's sourcedata/raw files", () => {
    const link = el<HTMLAnchorElement>("view-dataset-link");
    expect(link.hidden).toBe(false);
    expect(link.href).toContain("/dandiset/000123/draft/files?location=sourcedata%2Fraw");
    // Signed in with a real dataset id, so the read-only archive browse is on offer too.
    expect(el("load-remote-btn").hidden).toBe(false);
  });

  it("raises the human-subjects banner from the fetched draft metadata", async () => {
    await vi.waitFor(() => {
      expect(el("human-subjects-banner").hidden).toBe(false);
    });
    expect(el("human-subjects-unconfirmed").hidden).toBe(false);
    expect(el("folder-card").hidden).toBe(true);
    el("human-subjects-confirm-btn").click();
    expect(el("human-subjects-confirmed").hidden).toBe(false);
    expect(el("folder-card").hidden).toBe(false);
  });

  it("clears the banner when switching to a dataset without the marker", async () => {
    const select = el<HTMLSelectElement>("dandiset-id");
    select.value = "000456";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => {
      expect(fetchDraftMetadata).toHaveBeenCalledWith(expect.objectContaining({ dandisetId: "000456" }));
    });
    await vi.waitFor(() => {
      expect(el<HTMLAnchorElement>("view-dataset-link").href).toContain("/dandiset/000456/draft/files");
    });
    expect(el("human-subjects-banner").hidden).toBe(true);
    // The refresh handed the same object back every time, so the callback's save is still current.
    expect(ensureFreshToken).toHaveBeenCalledWith(CALLBACK_TOKENS);
    expect(storedSettings().oauth?.accessToken).toBe("cb-access");
    expect(storedSettings().dandisetId).toBe("000456");
  });

  it("signs out: revokes the tokens and drops them from storage, keeping the dataset id", () => {
    el("oauth-signout-btn").click();
    expect(el("oauth-signin-btn").hidden).toBe(false);
    expect(el("oauth-signed-in").hidden).toBe(true);
    expect(revokeToken).toHaveBeenCalledWith(CALLBACK_TOKENS);
    expect(storedSettings().oauth).toBeUndefined();
    expect(storedSettings().dandisetId).toBe("000456");
    expect(el("dandiset-message").textContent).toContain("sign in");
    expect(el("view-dataset-link").hidden).toBe(true);
    expect(el("folder-card").hidden).toBe(true);
  });

  it("starts a fresh login from the signed-out button", () => {
    el("oauth-signin-btn").click();
    expect(startLogin).toHaveBeenCalledTimes(1);
  });
});
