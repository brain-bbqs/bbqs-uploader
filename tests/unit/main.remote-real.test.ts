// @vitest-environment jsdom
// Boots src/main.ts signed in with two datasets and drives the REAL archive-listing paths (no
// "?test&remote_listing" injection): the read-only "Load from EMBER" browse and the staged-folder
// diff, including their checking/failed banners, stale-response guards (a slower older listing
// must never clobber a newer one), the classic-staging toggle, and chunked rendering of large
// listings and drops.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";
import { ensureFreshToken, handleRedirectCallback } from "../../src/lib/oauth";
import { listIncomingDandisets } from "../../src/lib/dandisets";
import { fetchDraftMetadata } from "../../src/lib/humanSubjects";
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

/** Every listRemoteFiles call parks here until the test settles it by hand. */
const listingCalls: { resolve: (listing: Map<string, number>) => void; reject: (e: unknown) => void }[] = [];

function lastListingCall() {
  return listingCalls[listingCalls.length - 1];
}

/** Runs an action that should trigger exactly one listing request, then waits for it: an OAuth
 * refresh await sits between the trigger and the listRemoteFiles call, so the request only
 * appears a few microtasks later. */
async function listingCallAfter(action: () => void) {
  const before = listingCalls.length;
  action();
  await vi.waitFor(() => {
    expect(listingCalls.length).toBe(before + 1);
  });
  return lastListingCall();
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

function rowTitles(): string[] {
  return Array.from(document.querySelectorAll<HTMLLIElement>("#file-list .file-item"), (li) => li.title);
}

beforeAll(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ dandisetId: "000123", oauth: SEEDED_TOKENS }));
  vi.mocked(handleRedirectCallback).mockResolvedValue(null);
  vi.mocked(ensureFreshToken).mockImplementation((tokens) => Promise.resolve(tokens));
  vi.mocked(renderIdentity).mockResolvedValue(undefined);
  vi.mocked(fetchDraftMetadata).mockResolvedValue({});
  vi.mocked(listIncomingDandisets).mockResolvedValue([
    { identifier: "000123", title: "Incoming: First", embargoed: true },
    { identifier: "000456", title: "Incoming: Second", embargoed: true },
  ]);
  vi.mocked(listRemoteFiles).mockImplementation(
    () => new Promise((resolve, reject) => listingCalls.push({ resolve, reject })),
  );
  await bootMain();
  await vi.waitFor(() => {
    expect(el<HTMLSelectElement>("dandiset-id").hidden).toBe(false);
  });
});

describe("real archive listings", () => {
  it("shows the checking banner while browsing and the failed banner when the listing dies", async () => {
    expect(el("load-remote-btn").hidden).toBe(false);
    const call = await listingCallAfter(() => el("load-remote-btn").click());
    expect(el("remote-banner-title").textContent).toBe("Checking EMBER…");
    expect(el("files-card").hidden).toBe(false);
    expect(el("remote-recheck-btn").hidden).toBe(true);

    call.reject(new Error("listing exploded"));
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("Couldn't check what's already on EMBER");
    });
    expect(el("remote-banner").classList.contains("failed")).toBe(true);
  });

  it("renders the browse from the winning listing, ignoring a stale slower response", async () => {
    // Nothing is staged, so the re-check button re-opens the browse.
    const stale = await listingCallAfter(() => el("remote-recheck-btn").click());
    // A second, newer request supersedes the first.
    const current = await listingCallAfter(() => el("load-remote-btn").click());

    stale.resolve(new Map([["sourcedata/raw/stale.bin", 1]]));
    await settle();
    expect(el("remote-banner-title").textContent).toBe("Checking EMBER…"); // stale result dropped

    current.resolve(
      new Map([
        ["sourcedata/raw/base/a.bin", 5],
        ["sourcedata/raw/", 0], // path collapsing to an empty name still renders
        ["unprefixed/b.bin", 7], // a path outside the prefix is shown as-is
        ["sourcedata/raw/.transfer/report.json", 3], // machinery folders stay hidden
        ["sourcedata/raw/base/sub/c.bin", 9],
      ]),
    );
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("On EMBER: 4 files (21 B)");
    });
    expect(el("file-list").classList.contains("browse")).toBe(true);
    expect(rowTitles().some((t) => t.includes(".transfer"))).toBe(false);
    // Browse rows are read-only: no checkboxes anywhere.
    expect(document.querySelectorAll("#file-list .file-item .select-check")).toHaveLength(0);
  });

  it("re-browses on a dataset switch, silently dropping a stale failure", async () => {
    const select = el<HTMLSelectElement>("dandiset-id");
    const stale = await listingCallAfter(() => {
      select.value = "000456";
      select.dispatchEvent(new Event("change"));
    });
    const current = await listingCallAfter(() => el("remote-recheck-btn").click());
    expect(current).not.toBe(stale);

    stale.reject(new Error("old dataset's listing died late"));
    await settle();
    expect(el("remote-banner-title").textContent).toBe("Checking EMBER…");

    current.resolve(new Map([["sourcedata/raw/solo/one.bin", 4]]));
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("On EMBER: 1 file (4 B)");
    });
  });

  it("keeps Select all a no-op while the read-only browse is showing", () => {
    el("select-all-btn").click();
    expect(el("selection-summary").textContent).toContain("0 of 0 files");
    expect(el("upload-bar").hidden).toBe(true);
  });

  it("stages a folder over the browse and diffs it against a fresh listing", async () => {
    const call = await listingCallAfter(() =>
      pickFolder([fakeFolderFile("x.bin", "staged/x.bin", 5), fakeFolderFile("y.bin", "staged/y.bin", 7)]),
    );
    expect(el("remote-banner-title").textContent).toBe("Checking EMBER…");
    expect(el("file-list").classList.contains("browse")).toBe(false);

    call.resolve(new Map([["sourcedata/raw/staged/x.bin", 5]]));
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("Already on EMBER: 1 file (5 B)");
    });
    const uploaded = document.querySelector<HTMLLIElement>('[title="sourcedata/raw/staged/x.bin"]')!;
    expect(uploaded.querySelector<HTMLSpanElement>('[data-role="badge"]')!.textContent).toBe("Uploaded");
    expect(el("selection-summary").textContent).toContain("1 of 2 files");
  });

  it("a staged Load from EMBER click is refused outright", async () => {
    const callsBefore = listingCalls.length;
    el("load-remote-btn").click();
    await settle();
    expect(listingCalls).toHaveLength(callsBefore);
  });

  it("re-checks tolerate stale settles in both directions and report real failures", async () => {
    // Round 1: an older re-check fails late while a newer one is pending -> silently dropped.
    const staleReject = await listingCallAfter(() => el("remote-recheck-btn").click());
    const winner = await listingCallAfter(() => el("remote-recheck-btn").click());
    staleReject.reject(new Error("stale re-check failed"));
    await settle();
    expect(el("remote-banner-title").textContent).toBe("Checking EMBER…");
    winner.resolve(new Map([["sourcedata/raw/staged/x.bin", 5]]));
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("Already on EMBER: 1 file (5 B)");
    });

    // Round 2: an older re-check succeeds late -> also dropped; the newer one wins. The URL
    // briefly carries a malformed remote_listing override, which must read as "no injection".
    window.history.replaceState(null, "", "/?test&remote_listing=-1");
    const staleResolve = await listingCallAfter(() => el("remote-recheck-btn").click());
    const winner2 = await listingCallAfter(() => el("remote-recheck-btn").click());
    staleResolve.resolve(new Map());
    await settle();
    expect(el("remote-banner-title").textContent).toBe("Checking EMBER…");
    winner2.resolve(new Map([["sourcedata/raw/staged/x.bin", 5]]));
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("Already on EMBER: 1 file (5 B)");
    });
    window.history.replaceState(null, "", "/");

    // Round 3: the current (newest) re-check fails -> the failed banner shows.
    const failing = await listingCallAfter(() => el("remote-recheck-btn").click());
    failing.reject(new Error("current re-check failed"));
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("Couldn't check what's already on EMBER");
    });
  });

  it("skips the archive check for drops made while Compare with EMBER is off", async () => {
    const toggle = el<HTMLInputElement>("remote-check-toggle");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(el("remote-banner").hidden).toBe(true);

    const callsBefore = listingCalls.length;
    pickFolder([fakeFolderFile("z.bin", "staged2/z.bin", 3)]);
    await vi.waitFor(() => {
      expect(rowTitles()).toContain("sourcedata/raw/staged2/z.bin");
    });
    expect(listingCalls).toHaveLength(callsBefore);
    expect(el("remote-banner").hidden).toBe(true);
  });

  it("chunks the rendering of large drops and large browse listings", async () => {
    pickFolder(Array.from({ length: 200 }, (_, i) => fakeFolderFile(`f${i}.bin`, `big/f${i}.bin`, 1)));
    await vi.waitFor(() => {
      expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(203);
    });

    el("reset-all-btn").click();
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(0);

    const browseCall = await listingCallAfter(() => el("load-remote-btn").click());
    browseCall.resolve(new Map(Array.from({ length: 201 }, (_, i) => [`sourcedata/raw/many/b${i}.bin`, 1] as const)));
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("On EMBER: 201 files (201 B)");
    });
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(201);
  });
});
