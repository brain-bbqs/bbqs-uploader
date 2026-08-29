// @vitest-environment jsdom
// Boots src/main.ts at #changelog with the speed-tips card previously minimized: covers the
// modal's auto-open on load, the backdrop-click dismissal, and loadSpeedTipsCollapsed's stored
// branch. Separate file from main.whats-new.test.ts because each boot configuration needs its
// own module registry.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";
import { SPEED_TIPS_COLLAPSED_KEY } from "../../src/lib/settings";

function modal(): HTMLDialogElement {
  return el<HTMLDialogElement>("whats-new-modal");
}

beforeAll(async () => {
  // Seeded before import so main.ts's boot-time reads see a returning visitor's state.
  localStorage.setItem(SPEED_TIPS_COLLAPSED_KEY, "1");
  await bootMain("#changelog");
});

describe("boot at #changelog", () => {
  it("auto-opens the What's New modal and keeps the fragment", () => {
    expect(modal().open).toBe(true);
    expect(window.location.hash).toBe("#changelog");
  });

  it("clicks inside the modal body do not dismiss it", () => {
    el("whats-new-content").click();
    expect(modal().open).toBe(true);
  });

  it("a backdrop click closes the modal and strips the fragment", () => {
    // The <dialog> itself is the click target only when the backdrop is hit.
    modal().click();
    expect(modal().open).toBe(false);
    expect(window.location.hash).toBe("");
  });
});

describe("speed tips restored collapsed", () => {
  it("boots minimized and the toggle re-expands and clears the stored flag", () => {
    expect(el("speed-tips-body").hidden).toBe(true);
    expect(el("speed-tips-toggle").getAttribute("aria-expanded")).toBe("false");

    el("speed-tips-toggle").click();
    expect(el("speed-tips-body").hidden).toBe(false);
    expect(el("speed-tips-toggle").getAttribute("aria-expanded")).toBe("true");
    expect(localStorage.getItem(SPEED_TIPS_COLLAPSED_KEY)).toBe(null);
  });
});
