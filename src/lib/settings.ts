import type { StoredSettings, UploaderConfig } from "./types";
import { EMBER_INSTANCE } from "./instances";

export const STORAGE_KEY = "dandi-mp4-uploader.settings.v1";

export function loadStoredSettings(): StoredSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSettings;
  } catch (e) {
    console.warn("Could not restore settings:", e);
    return null;
  }
}

export function saveStoredSettings(settings: StoredSettings | null): void {
  if (!settings) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  // codeql[js/clear-text-storage-of-sensitive-data]: ember-uploader is a fully static,
  // backend-free page (no server to hold a session), so client storage is the only place
  // to persist the OAuth token between page loads; the pasted API key was stored the same way.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resolveConfig(input: { dandisetId: string; oauthAccessToken?: string }): UploaderConfig {
  const rawId = input.dandisetId.trim();
  const idMatch = rawId.match(/(\d{6,})/);
  return {
    api: EMBER_INSTANCE.api,
    web: EMBER_INSTANCE.web,
    accessToken: input.oauthAccessToken ?? "",
    dandisetId: idMatch ? idMatch[1] : "",
  };
}

export function configProblems(cfg: UploaderConfig): string[] {
  const problems: string[] = [];
  if (!cfg.api || !/^https?:\/\//.test(cfg.api)) problems.push("API base URL is missing or invalid.");
  if (!cfg.accessToken) problems.push("Not signed in.");
  else if (!cfg.dandisetId) problems.push("No dataset selected.");
  return problems;
}
