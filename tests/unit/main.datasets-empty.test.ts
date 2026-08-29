// @vitest-environment jsdom
// Boots the real src/main.ts with "?test&num_datasets=0" (signed out): the dataset picker's
// empty-list branch shows the "not been added" placeholder and every dataset-dependent control
// stays hidden.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  await bootMain("?test&num_datasets=0");
});

describe("dataset picker with zero injected datasets", () => {
  it("shows the no-datasets placeholder instead of the single/dropdown views", () => {
    expect(el("dandiset-message").hidden).toBe(false);
    expect(el("dandiset-message").textContent).toContain("not been added");
    expect(el("dandiset-single").hidden).toBe(true);
    expect(el("dandiset-id").hidden).toBe(true);
  });

  it("keeps the dataset-dependent controls hidden", () => {
    // Signed out with no remote_listing param, so neither Load-from-EMBER branch can enable.
    expect(el("load-remote-btn").hidden).toBe(true);
    expect(el("view-dataset-link").hidden).toBe(true);
    expect(el("dandiset-embargo-error").hidden).toBe(true);
  });
});
