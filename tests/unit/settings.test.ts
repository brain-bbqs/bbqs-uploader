// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configProblems,
  resolveConfig,
  loadStoredTheme,
  saveStoredTheme,
  loadStoredSettings,
  saveStoredSettings,
  STORAGE_KEY,
  THEME_KEY,
} from "../../src/lib/settings";

describe("resolveConfig", () => {
  it("resolves the EMBER-DANDI API/web URLs and the dandiset id", () => {
    const cfg = resolveConfig({
      dandisetId: "DANDI:000123",
      oauthAccessToken: "the-access-token",
    });
    expect(cfg.api).toBe("https://api-dandi.emberarchive.org/api");
    expect(cfg.web).toBe("https://dandi.emberarchive.org");
    expect(cfg.accessToken).toBe("the-access-token");
    expect(cfg.dandisetId).toBe("000123");
  });

  it("resolves to an empty id when the input contains no numeric dandiset id", () => {
    const cfg = resolveConfig({ dandisetId: "not-a-real-id" });
    expect(cfg.dandisetId).toBe("");
  });

  it("rejects the negative fake identifiers used by the ?test&num_datasets injection", () => {
    const cfg = resolveConfig({ dandisetId: "-000001" });
    expect(cfg.dandisetId).toBe("");
  });

  it("leaves the access token empty when not signed in", () => {
    const cfg = resolveConfig({ dandisetId: "000123" });
    expect(cfg.accessToken).toBe("");
  });

  it("passes through the selected dataset's embargo status", () => {
    expect(resolveConfig({ dandisetId: "000123", embargoed: true }).embargoed).toBe(true);
    expect(resolveConfig({ dandisetId: "000123", embargoed: false }).embargoed).toBe(false);
    expect(resolveConfig({ dandisetId: "000123" }).embargoed).toBeUndefined();
  });
});

describe("configProblems", () => {
  it("flags a missing API URL and not being signed in (dandiset id is secondary while signed out)", () => {
    const problems = configProblems({ api: "", web: "", accessToken: "", dandisetId: "" });
    expect(problems).toHaveLength(2);
    expect(problems).toContain("Not signed in.");
  });

  it("passes for a fully valid config", () => {
    const problems = configProblems({
      api: "https://api-dandi.emberarchive.org/api",
      web: "https://dandi.emberarchive.org",
      accessToken: "abc",
      dandisetId: "000123",
    });
    expect(problems).toHaveLength(0);
  });

  it("reports 'No dataset selected.' when signed in but no dandiset is chosen", () => {
    const problems = configProblems({
      api: "https://api-dandi.emberarchive.org/api",
      web: "",
      accessToken: "abc",
      dandisetId: "",
    });
    expect(problems).toEqual(["No dataset selected."]);
  });
});

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

  it("returns null when nothing has been stored", () => {
    expect(loadStoredSettings()).toBe(null);
  });

  it("round-trips stored settings", () => {
    const settings = {
      dandisetId: "000123",
      oauth: { accessToken: "a", refreshToken: "r", expiresAt: 123456 },
    };
    saveStoredSettings(settings);
    expect(loadStoredSettings()).toEqual(settings);
  });

  it("clears the stored record when saving null (sign-out)", () => {
    saveStoredSettings({ dandisetId: "000123" });
    saveStoredSettings(null);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(null);
    expect(loadStoredSettings()).toBe(null);
  });

  it("treats corrupted stored JSON as absent instead of crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadStoredSettings()).toBe(null);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
