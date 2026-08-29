// @vitest-environment jsdom
// Boots the real src/main.ts with "?test&num_datasets=1&remote_listing=2" (signed out): one
// injected dataset renders the plain-text single view, and the remote_listing injection un-hides
// the "Load from EMBER" button through its test branch even without a sign-in.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  await bootMain("?test&num_datasets=1&remote_listing=2");
  // The remote_listing injection auto-opens the read-only archive browse; let it settle first.
  await vi.waitFor(() => {
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(2);
  });
});

describe("dataset picker with one injected dataset", () => {
  it("names the dataset as plain text with its identifier in a <code>", () => {
    expect(el("dandiset-single").hidden).toBe(false);
    expect(el("dandiset-message").hidden).toBe(true);
    expect(el("dandiset-id").hidden).toBe(true);
    expect(el("dandiset-single-text").querySelector("code")?.textContent).toBe("-000001");
    expect(el("dandiset-single-text").textContent).toContain('"Incoming: Test dataset 1"');
    // The hidden select still carries the id so currentConfig() keeps reading it.
    expect(el<HTMLSelectElement>("dandiset-id").value).toBe("-000001");
  });

  it("un-hides Load from EMBER via the remote_listing test branch while signed out", () => {
    expect(el("load-remote-btn").hidden).toBe(false);
  });

  it("keeps the embargo gate open (default embargoed) and the dataset link hidden", () => {
    expect(el("dandiset-embargo-error").hidden).toBe(true);
    // resolveConfig blanks the fake negative identifier, so no archive URL can be built.
    expect(el("view-dataset-link").hidden).toBe(true);
  });
});
