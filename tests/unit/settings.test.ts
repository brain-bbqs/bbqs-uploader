// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { throwingStorage } from "@brain-bbqs/test-utils/vitest";
import type { OAuthTokenSet } from "@brain-bbqs/ember-client";
import {
  loadStoredTheme,
  saveStoredTheme,
  settingsStore,
  loadSpeedTipsCollapsed,
  saveSpeedTipsCollapsed,
  STORAGE_KEY,
  THEME_KEY,
  SPEED_TIPS_COLLAPSED_KEY,
} from "../../src/lib/settings";

describe("theme preference storage", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing has been stored", () => {
    expect(loadStoredTheme()).toBe(null);
  });

  it("round-trips a saved preference", () => {
    saveStoredTheme("dark");
    expect(loadStoredTheme()).toBe("dark");
    saveStoredTheme("light");
    expect(loadStoredTheme()).toBe("light");
  });

  it("ignores a corrupted stored value", () => {
    localStorage.setItem(THEME_KEY, "sepia");
    expect(loadStoredTheme()).toBe(null);
  });
});

describe("settings storage", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the storage key signed-in browsers already hold", () => {
    expect(STORAGE_KEY).toBe("bbqs-uploader.settings.v1");
    expect(settingsStore.key).toBe(STORAGE_KEY);
  });

  it("returns null when nothing has been stored", () => {
    expect(settingsStore.load()).toBe(null);
  });

  it("round-trips stored settings", () => {
    const settings = {
      dandisetId: "000123",
      oauth: { accessToken: "a", refreshToken: "r", expiresAt: 123456 },
    };
    settingsStore.save(settings);
    expect(settingsStore.load()).toEqual(settings);
  });

  // A browser signed in before the store moved into @brain-bbqs/ember-client holds exactly these
  // bytes (what the app's own saveStoredSettings wrote: JSON.stringify of { dandisetId, oauth }).
  // It has to load unchanged, and a re-save has to write the very same bytes back.
  it("loads a record written before the move, and writes the same bytes back", () => {
    const oauth: OAuthTokenSet = { accessToken: "at-old", refreshToken: "rt-old", expiresAt: 1767225600000 };
    const written =
      '{"dandisetId":"000456","oauth":{"accessToken":"at-old","refreshToken":"rt-old","expiresAt":1767225600000}}';
    localStorage.setItem("bbqs-uploader.settings.v1", written);

    expect(settingsStore.load()).toEqual({ dandisetId: "000456", oauth });

    localStorage.clear();
    settingsStore.save({ dandisetId: "000456", oauth });
    expect(localStorage.getItem("bbqs-uploader.settings.v1")).toBe(written);
  });

  it("drops the tokens from the record on sign-out the same way (an undefined oauth is omitted)", () => {
    settingsStore.save({ dandisetId: "000456", oauth: undefined });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"dandisetId":"000456"}');
  });

  it("clears the stored record when saving null", () => {
    settingsStore.save({ dandisetId: "000123" });
    settingsStore.save(null);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(null);
    expect(settingsStore.load()).toBe(null);
  });

  it("treats corrupted stored JSON as absent instead of crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(settingsStore.load()).toBe(null);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("speed tips collapsed storage", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to expanded and round-trips a minimized state", () => {
    expect(loadSpeedTipsCollapsed()).toBe(false);
    saveSpeedTipsCollapsed(true);
    expect(loadSpeedTipsCollapsed()).toBe(true);
    saveSpeedTipsCollapsed(false);
    expect(loadSpeedTipsCollapsed()).toBe(false);
    expect(localStorage.getItem(SPEED_TIPS_COLLAPSED_KEY)).toBe(null);
  });
});

// Private-mode browsers (and some embedded webviews) throw on any localStorage access; every
// storage helper must degrade to its default instead of crashing the app.
describe("storage helpers when localStorage itself throws", () => {
  let restoreStorage: () => void;

  beforeEach(() => {
    restoreStorage = throwingStorage();
  });

  afterEach(() => {
    restoreStorage();
    vi.restoreAllMocks();
  });

  it("loadStoredTheme falls back to null", () => {
    expect(loadStoredTheme()).toBe(null);
  });

  it("saveStoredTheme warns instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => saveStoredTheme("dark")).not.toThrow();
    expect(warn).toHaveBeenCalledWith("Could not save theme preference:", expect.any(Error));
  });

  it("loadSpeedTipsCollapsed falls back to expanded", () => {
    expect(loadSpeedTipsCollapsed()).toBe(false);
  });

  it("saveSpeedTipsCollapsed warns instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => saveSpeedTipsCollapsed(true)).not.toThrow();
    expect(warn).toHaveBeenCalledWith("Could not save speed tips collapsed state:", expect.any(Error));
  });

  it("settingsStore.load falls back to no stored session", () => {
    expect(settingsStore.load()).toBe(null);
  });

  it("settingsStore.save warns instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => settingsStore.save({ dandisetId: "000123" })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(`Could not save ${STORAGE_KEY}:`, expect.any(Error));
  });
});
