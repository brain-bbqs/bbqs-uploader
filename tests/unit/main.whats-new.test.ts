// @vitest-environment jsdom
// Boots the real src/main.ts (default URL, no #changelog) and drives the header extras: the
// What's New modal (button/close/hashchange paths and "Show more"), the theme toggle, the speed
// tips collapse, the config form's submit suppression, and the checksum-cache clear button.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";
import { SPEED_TIPS_COLLAPSED_KEY, THEME_KEY } from "../../src/lib/settings";

function modal(): HTMLDialogElement {
  return el<HTMLDialogElement>("whats-new-modal");
}

function versionSections(): number {
  return el("whats-new-content").querySelectorAll(".changelog-version").length;
}

beforeAll(async () => {
  await bootMain();
});

describe("What's New modal", () => {
  it("boots closed, with only the recent versions rendered and Show more offered", () => {
    expect(modal().open).toBe(false);
    expect(versionSections()).toBe(3);
    expect(el("whats-new-show-more").hidden).toBe(false);
  });

  it("opens from the header button and writes the #changelog fragment", () => {
    el("whats-new-button").click();
    expect(modal().open).toBe(true);
    expect(window.location.hash).toBe("#changelog");
  });

  it("Show more swaps in the full changelog and hides itself", () => {
    const before = versionSections();
    el("whats-new-show-more").click();
    expect(el("whats-new-show-more").hidden).toBe(true);
    expect(versionSections()).toBeGreaterThan(before);
  });

  it("the close button closes the modal and strips the fragment", () => {
    el("whats-new-close").click();
    expect(modal().open).toBe(false);
    expect(window.location.hash).toBe("");
  });

  it("navigating to #changelog reopens the modal", () => {
    window.location.hash = "changelog";
    // jsdom queues its own hashchange; dispatching directly keeps the test deterministic (the
    // listener is idempotent, so a second delivery is harmless).
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(modal().open).toBe(true);

    el("whats-new-close").click();
    expect(modal().open).toBe(false);
    expect(window.location.hash).toBe("");
  });
});

describe("header extras", () => {
  it("theme toggle flips away from the OS light preference and persists each choice", () => {
    // matchMedia stub reports light, and no override is stored, so the first click yields dark.
    expect(document.documentElement.dataset.theme).toBeUndefined();
    el("theme-toggle").click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    el("theme-toggle").click();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("speed tips start expanded and the toggle collapses, persists, and re-expands", () => {
    expect(el("speed-tips-body").hidden).toBe(false);
    expect(el("speed-tips-toggle").getAttribute("aria-expanded")).toBe("true");

    el("speed-tips-toggle").click();
    expect(el("speed-tips-body").hidden).toBe(true);
    expect(el("speed-tips-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem(SPEED_TIPS_COLLAPSED_KEY)).toBe("1");

    el("speed-tips-toggle").click();
    expect(el("speed-tips-body").hidden).toBe(false);
    expect(localStorage.getItem(SPEED_TIPS_COLLAPSED_KEY)).toBe(null);
  });

  it("the config form swallows submit so the page never reloads", () => {
    const submit = new Event("submit", { cancelable: true });
    el("config-form").dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
  });

  it("Clear checksum cache confirms inline, then restores the button", async () => {
    const btn = el<HTMLButtonElement>("clear-scan-cache-btn");
    const original = btn.textContent;
    btn.click();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("Checksum cache cleared");

    // The label restores on a real 1500ms timer.
    await vi.waitFor(
      () => {
        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toBe(original);
      },
      { timeout: 2500 },
    );
  }, 5000);
});
