// @vitest-environment jsdom
// Boots src/main.ts as a failed OAuth redirect callback (the mocked exchange rejects): the
// failure is logged and boot completes signed out, with none of the signed-in fetch paths run.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";
import { ensureFreshToken, handleRedirectCallback, startLogin } from "../../src/lib/oauth";
import { listIncomingDandisets } from "../../src/lib/dandisets";
import { fetchDraftMetadata } from "../../src/lib/humanSubjects";
import { renderIdentity } from "../../src/ui/connection";

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

let warnSpy: MockInstance;

beforeAll(async () => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  vi.mocked(handleRedirectCallback).mockRejectedValue(new Error("token exchange failed"));
  await bootMain();
});

describe("failed OAuth callback", () => {
  it("warns and completes the boot signed out", () => {
    expect(warnSpy).toHaveBeenCalledWith("OAuth sign-in callback failed:", expect.any(Error));
    expect(el("oauth-signin-btn").hidden).toBe(false);
    expect(el("oauth-signed-in").hidden).toBe(true);
    expect(el("dandiset-message").textContent).toContain("sign in");
    expect(el("folder-card").hidden).toBe(true);
    // Nothing worth persisting happened, so no settings were saved.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("leaves every signed-in fetch path untouched", () => {
    expect(ensureFreshToken).not.toHaveBeenCalled();
    expect(listIncomingDandisets).not.toHaveBeenCalled();
    expect(renderIdentity).not.toHaveBeenCalled();
    expect(fetchDraftMetadata).not.toHaveBeenCalled();
  });

  it("starts a new login from the Sign in button", () => {
    el("oauth-signin-btn").click();
    expect(startLogin).toHaveBeenCalledTimes(1);
  });
});
