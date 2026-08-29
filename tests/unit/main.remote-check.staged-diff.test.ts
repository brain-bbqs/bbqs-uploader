// @vitest-environment jsdom
// Boots the real src/main.ts with "?test&remote_listing=3" (signed out) and stages a folder: the
// injected listing marks the first 3 staged paths (sorted) as already on EMBER, the first of them
// size-mismatched. Covers the staged-diff banner, Uploaded/Changed/New row badging, auto-collapse
// of fully-uploaded folders, Re-check, and the "Compare with EMBER" toggle round trip.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";

// Full archive paths of the staged files, in the sorted order the injection sees: a0.bin sorts
// first (digits before letters), so it gets the size-mismatch; both aaa/ files land inside the
// first 3 so that whole folder reads as fully uploaded; zzz/z.bin stays outside the listing.
const CHANGED = "sourcedata/raw/base/a0.bin";
const UPLOADED_X = "sourcedata/raw/base/aaa/x.bin";
const UPLOADED_Y = "sourcedata/raw/base/aaa/y.bin";
const FRESH = "sourcedata/raw/base/zzz/z.bin";

function row(title: string): HTMLLIElement {
  const li = document.querySelector<HTMLLIElement>(`#file-list .file-item[title="${title}"]`);
  if (!li) throw new Error(`missing row ${title}`);
  return li;
}

function badge(li: HTMLLIElement): HTMLSpanElement {
  return li.querySelector<HTMLSpanElement>('[data-role="badge"]')!;
}

function status(li: HTMLLIElement): HTMLSpanElement {
  return li.querySelector<HTMLSpanElement>('[data-role="status"]')!;
}

function check(li: HTMLLIElement): HTMLInputElement {
  return li.querySelector<HTMLInputElement>(".select-check")!;
}

function dirItem(name: string): HTMLLIElement {
  const items = Array.from(document.querySelectorAll<HTMLLIElement>("#file-list li.dir-item"));
  const li = items.find((item) => item.querySelector(".dir-name")?.textContent === `${name}/`);
  if (!li) throw new Error(`missing dir ${name}`);
  return li;
}

function dirChildren(li: HTMLLIElement): HTMLUListElement {
  return li.querySelector<HTMLUListElement>(":scope > .dir-children")!;
}

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  await bootMain("?test&remote_listing=3");
  // remote_listing with nothing staged auto-opens the read-only browse; let it settle so staging
  // replaces a finished render instead of racing it.
  await vi.waitFor(() => {
    expect(el("remote-banner-title").textContent).toContain("On EMBER: 3 files");
  });
  pickFolder([
    fakeFolderFile("a0.bin", "base/a0.bin", 10),
    fakeFolderFile("x.bin", "base/aaa/x.bin", 5),
    fakeFolderFile("y.bin", "base/aaa/y.bin", 7),
    fakeFolderFile("z.bin", "base/zzz/z.bin", 3),
  ]);
  // Listed bytes are the remote sizes: 10+1 (mismatch) + 5 + 7 = 23 B.
  await vi.waitFor(() => {
    expect(el("remote-banner-title").textContent).toBe("Already on EMBER: 3 files (23 B)");
  });
});

describe("staged-folder diff against an injected remote listing", () => {
  it("shows the checked banner and badges each row against the listing", () => {
    expect(el("remote-banner").hidden).toBe(false);
    expect(el("remote-banner").classList.contains("checked")).toBe(true);
    expect(el("remote-banner-body").textContent).toContain("re-select to replace");
    expect(el("remote-recheck-btn").hidden).toBe(false);

    // First sorted path reports a different remote size -> Changed, still selected.
    const changed = row(CHANGED);
    expect(badge(changed).textContent).toBe("Changed");
    expect(badge(changed).className).toBe("badge warn");
    expect(check(changed).checked).toBe(true);
    expect(status(changed).textContent).toBe("will replace");
    expect(status(changed).classList.contains("warn")).toBe(true);

    // Same-size matches -> Uploaded, deselected, dimmed.
    for (const path of [UPLOADED_X, UPLOADED_Y]) {
      const uploaded = row(path);
      expect(badge(uploaded).textContent).toBe("Uploaded");
      expect(badge(uploaded).className).toBe("badge ok");
      expect(check(uploaded).checked).toBe(false);
      expect(uploaded.classList.contains("deselected")).toBe(true);
      expect(status(uploaded).textContent).toBe("already on EMBER");
    }

    // Not in the listing -> New (badged because a non-empty diff is in effect).
    const fresh = row(FRESH);
    expect(badge(fresh).textContent).toBe("New");
    expect(badge(fresh).className).toBe("badge upload");
    expect(status(fresh).textContent).toBe("");

    expect(el("selection-summary").textContent).toContain("2 of 4 files");
    expect(el("upload-bar").hidden).toBe(false);
    expect(el("upload-all-btn").textContent).toBe("Upload 2 files (13 B)");
  });

  it("auto-collapses only the folder the archive already holds in full", () => {
    const aaa = dirItem("aaa");
    expect(dirChildren(aaa).hidden).toBe(true);
    expect(aaa.querySelector(".dir-toggle")!.getAttribute("aria-expanded")).toBe("false");
    for (const name of ["base", "zzz"]) {
      expect(dirChildren(dirItem(name)).hidden).toBe(false);
    }
  });

  it("flips statuses as uploaded/changed rows are re-selected or deselected", () => {
    // Re-selecting an already-uploaded row promises a replacement.
    const uploaded = row(UPLOADED_X);
    check(uploaded).checked = true;
    check(uploaded).dispatchEvent(new Event("change"));
    expect(badge(uploaded).textContent).toBe("Uploaded");
    expect(status(uploaded).textContent).toBe("will replace");
    expect(status(uploaded).classList.contains("warn")).toBe(true);
    expect(uploaded.classList.contains("deselected")).toBe(false);
    expect(el("selection-summary").textContent).toContain("3 of 4 files");
    expect(el("upload-all-btn").textContent).toBe("Upload 3 files (18 B)");

    check(uploaded).checked = false;
    check(uploaded).dispatchEvent(new Event("change"));
    expect(status(uploaded).textContent).toBe("already on EMBER");

    // Deselecting the size-mismatched row leaves it flagged, without the replace warning.
    const changed = row(CHANGED);
    check(changed).checked = false;
    check(changed).dispatchEvent(new Event("change"));
    expect(badge(changed).textContent).toBe("Changed");
    expect(status(changed).textContent).toBe("differs on EMBER");
    expect(status(changed).classList.contains("warn")).toBe(false);

    // Restore the freshly-applied diff state for the scenarios below.
    check(changed).checked = true;
    check(changed).dispatchEvent(new Event("change"));
    expect(status(changed).textContent).toBe("will replace");
  });

  it("Re-check re-applies the diff without undoing the user's expanding", () => {
    const aaa = dirItem("aaa");
    aaa.querySelector<HTMLButtonElement>(".dir-toggle")!.click();
    expect(dirChildren(aaa).hidden).toBe(false);
    const uploaded = row(UPLOADED_X);
    check(uploaded).checked = true;
    check(uploaded).dispatchEvent(new Event("change"));

    el("remote-recheck-btn").click();

    expect(check(uploaded).checked).toBe(false);
    expect(status(uploaded).textContent).toBe("already on EMBER");
    expect(el("remote-banner-title").textContent).toBe("Already on EMBER: 3 files (23 B)");
    // Only the first applied listing may collapse folders.
    expect(dirChildren(aaa).hidden).toBe(false);
  });

  it("turning Compare with EMBER off restores classic staging", () => {
    // Collapse a folder by hand so the toggle-off re-expansion is observable.
    const aaa = dirItem("aaa");
    aaa.querySelector<HTMLButtonElement>(".dir-toggle")!.click();
    expect(dirChildren(aaa).hidden).toBe(true);

    const toggle = el<HTMLInputElement>("remote-check-toggle");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    expect(el("remote-banner").hidden).toBe(true);
    for (const path of [CHANGED, UPLOADED_X, UPLOADED_Y, FRESH]) {
      expect(check(row(path)).checked).toBe(true);
      expect(badge(row(path)).hidden).toBe(true);
      expect(status(row(path)).textContent).toBe("");
    }
    expect(dirChildren(aaa).hidden).toBe(false);
    expect(el("selection-summary").textContent).toContain("4 of 4 files");
    expect(el("upload-all-btn").textContent).toBe("Upload 4 files (25 B)");
  });

  it("turning the toggle back on re-applies the diff", () => {
    const toggle = el<HTMLInputElement>("remote-check-toggle");
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));

    expect(el("remote-banner").hidden).toBe(false);
    expect(el("remote-banner-title").textContent).toBe("Already on EMBER: 3 files (23 B)");
    expect(check(row(UPLOADED_X)).checked).toBe(false);
    expect(badge(row(UPLOADED_X)).textContent).toBe("Uploaded");
    expect(badge(row(FRESH)).textContent).toBe("New");
    expect(el("selection-summary").textContent).toContain("2 of 4 files");
  });
});
