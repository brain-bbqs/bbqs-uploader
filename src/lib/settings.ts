import { createFlagStore } from "@brain-bbqs/utils";
import { createArchiveSettingsStore } from "@brain-bbqs/ember-client";

// Also read before first paint by the script configs/vite.config.ts injects into index.html.
export const STORAGE_KEY = "bbqs-uploader.settings.v1";
// Also read before first paint by the script configs/vite.config.ts injects into index.html.
// The header toggle (initThemeToggle from @brain-bbqs/ui) writes the light/dark choice here.
export const THEME_KEY = "bbqs-uploader.theme";

export const SPEED_TIPS_COLLAPSED_KEY = "bbqs-uploader.speed-tips-collapsed";

const speedTipsCollapsedStore = createFlagStore(SPEED_TIPS_COLLAPSED_KEY, (e) =>
  console.warn("Could not save speed tips collapsed state:", e),
);

/** Whether the user previously minimized the transfer speed recommendations card; defaults to
 *  expanded (false) if they never touched it. */
export function loadSpeedTipsCollapsed(): boolean {
  return speedTipsCollapsedStore.load();
}

export function saveSpeedTipsCollapsed(collapsed: boolean): void {
  speedTipsCollapsedStore.save(collapsed);
}

/**
 * The picked dandiset and the OAuth tokens, as one JSON record under STORAGE_KEY in localStorage.
 * The key and the record's shape are unchanged from before the store moved into
 * `@brain-bbqs/ember-client`, so a browser signed in before the move stays signed in. Client-side
 * token storage is an accepted, documented trade-off for this backend-free page; see SECURITY.md.
 */
export const settingsStore = createArchiveSettingsStore(STORAGE_KEY);
