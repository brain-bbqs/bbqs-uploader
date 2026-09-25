import type { Page, Route } from "@playwright/test";
import { seedSignedIn as seedArchiveSignedIn, type StubDandiset } from "@brain-bbqs/test-utils/playwright";
import { STORAGE_KEY } from "../../../src/lib/settings";
import { EMBER_INSTANCE } from "@brain-bbqs/ember-client";

export const API = EMBER_INSTANCE.api;

/**
 * Seeds an already-signed-in OAuth session under this app's settings key and mocks the calls
 * sign-in fans out to (see @brain-bbqs/test-utils), plus this app's own "already on EMBER"
 * listing, so tests can pick straight up at "Connected" instead of driving the real PKCE flow.
 */
export async function seedSignedIn(page: Page, dandiset: StubDandiset = {}): Promise<void> {
  const { identifier = "000123" } = dandiset;
  await seedArchiveSignedIn(page, { storageKey: STORAGE_KEY, ...dandiset });
  // The "already on EMBER" check lists existing sourcedata/raw/ assets once files are staged; an
  // empty listing keeps unrelated tests off the network. Matched against the listing request's
  // exact URL (not a "?path=*" glob) so it can't shadow the per-path existing-asset lookups
  // other helpers and tests mock — this route is registered last and would otherwise win.
  await page.route(
    `${API}/dandisets/${identifier}/versions/draft/assets/` +
      `?path=sourcedata%2Fraw%2F&metadata=false&order=path&page_size=1000`,
    (route: Route) => route.fulfill({ json: { results: [], next: null } }),
  );
}
