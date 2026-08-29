// @vitest-environment jsdom
// Boots the real src/main.ts with "?test&num_datasets=3" (signed out) after seeding stored
// settings, so the dropdown restores the remembered dataset, then drives a selection change
// through the signed-out connection-check path.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  // Seeded before boot so loadSettings() picks the remembered dataset up.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ dandisetId: "-000002" }));
  await bootMain("?test&num_datasets=3");
});

describe("dataset dropdown with three injected datasets", () => {
  it("renders three options ranked by ascending integer id", () => {
    const select = el<HTMLSelectElement>("dandiset-id");
    expect(select.hidden).toBe(false);
    expect(el("dandiset-message").hidden).toBe(true);
    expect(el("dandiset-single").hidden).toBe(true);
    // The fake ids are negative, so ascending integer order reverses their spelling.
    expect(Array.from(select.options, (o) => o.value)).toEqual(["-000003", "-000002", "-000001"]);
    expect(select.options[0].textContent).toBe("(-000003) Incoming: Test dataset 3");
  });

  it("restores the remembered dataset from stored settings", () => {
    expect(el<HTMLSelectElement>("dandiset-id").value).toBe("-000002");
  });

  it("keeps Load from EMBER and the dataset link hidden while signed out", () => {
    // No remote_listing param and no sign-in, so neither branch can enable the button; the fake
    // negative identifier resolves to no dandiset id, so no archive URL exists either.
    expect(el("load-remote-btn").hidden).toBe(true);
    expect(el("view-dataset-link").hidden).toBe(true);
  });

  it("persists a dropdown change and re-renders the gates without a sign-in", async () => {
    const select = el<HTMLSelectElement>("dandiset-id");
    select.value = "-000001";
    select.dispatchEvent(new Event("change"));

    // runConnectionCheck saves synchronously; the OAuth refresh no-ops signed out.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ dandisetId: "-000001" });
    await vi.waitFor(() => {
      expect(el("view-dataset-link").hidden).toBe(true);
      expect(el("dandiset-embargo-error").hidden).toBe(true);
    });
    expect(select.value).toBe("-000001");
  });
});
