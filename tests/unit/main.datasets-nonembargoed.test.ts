// @vitest-environment jsdom
// Boots the real src/main.ts with "?test&num_datasets=2&embargoed=false" (signed out): the
// injected non-embargoed datasets trip the upload gate, showing the embargo error card and
// disabling the upload button.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  await bootMain("?test&num_datasets=2&embargoed=false");
});

describe("non-embargoed dataset gate", () => {
  it("renders the dropdown for two injected datasets", () => {
    const select = el<HTMLSelectElement>("dandiset-id");
    expect(select.hidden).toBe(false);
    expect(el("dandiset-message").hidden).toBe(true);
    expect(el("dandiset-single").hidden).toBe(true);
    // Ascending integer order; the fake ids are negative, so dataset 2 ranks first.
    expect(Array.from(select.options, (o) => o.value)).toEqual(["-000002", "-000001"]);
    expect(select.value).toBe("-000002");
  });

  it("shows the embargo error and disables the upload button", () => {
    expect(el("dandiset-embargo-error").hidden).toBe(false);
    expect(el<HTMLButtonElement>("upload-all-btn").disabled).toBe(true);
  });
});
