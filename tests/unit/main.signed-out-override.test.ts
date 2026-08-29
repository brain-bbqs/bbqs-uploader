// @vitest-environment jsdom
// Boots the real src/main.ts with "?test&signed_out&mock_upload=0": the signed_out override
// forces every auth-dependent render to the signed-out state, and mock_upload=0 is a deliberate
// no-op (the injection only accepts positive counts). Also exercises the hardwareConcurrency
// fallback (stubbed to 0 before boot) and the theme toggle's first flip for an OS-dark visitor.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bodyFromIndexHtml, el, installDialogPolyfill, installMatchMedia } from "./helpers/mainHarness";
import { THEME_KEY } from "../../src/lib/settings";

const fetchMock = vi.fn(() => Promise.reject(new Error("network disabled in test")));

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  // Browsers without the API report undefined/0; the pool size must fall back to its default.
  Object.defineProperty(navigator, "hardwareConcurrency", { value: 0, configurable: true });
  // Same steps as bootMain, but with an OS-level dark preference instead of the default light.
  window.history.replaceState(null, "", "/?test&signed_out&mock_upload=0");
  document.body.innerHTML = bodyFromIndexHtml();
  installMatchMedia(true);
  installDialogPolyfill();
  await import("../../src/main");
});

describe("signed-out override boot", () => {
  it("shows the signed-out header and the sign-in placeholder in the dataset picker", () => {
    expect(el("oauth-signin-btn").hidden).toBe(false);
    expect(el("oauth-signed-in").hidden).toBe(true);
    expect(el("dandiset-message").textContent).toBe("Please sign in to see your incoming datasets.");
    expect(el("dandiset-message").hidden).toBe(false);
    expect(el<HTMLAnchorElement>("view-dataset-link").hidden).toBe(true);
    expect(el("folder-card").hidden).toBe(true);
    expect(el("load-remote-btn").hidden).toBe(true);
  });

  it("treats mock_upload=0 as a no-op instead of queueing an empty mock batch", () => {
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(0);
    expect(el("files-card").hidden).toBe(true);
  });

  it("flips the theme away from the OS dark preference on the first toggle click", () => {
    expect(document.documentElement.dataset.theme).toBeUndefined();
    el("theme-toggle").click();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    el("theme-toggle").click();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("signs out cleanly even though no tokens were ever held", () => {
    el("oauth-signout-btn").click();
    // No token revocation request goes out for a session that never had tokens.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el("oauth-signin-btn").hidden).toBe(false);
    expect(el("dandiset-message").textContent).toBe("Please sign in to see your incoming datasets.");
  });

  it("ignores a re-check request while signed out instead of trying to browse the archive", async () => {
    el("remote-recheck-btn").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(el("remote-banner").hidden).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
