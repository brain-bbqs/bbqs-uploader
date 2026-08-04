import type { Page, Route } from "@playwright/test";
import { STORAGE_KEY } from "../../../src/lib/settings";
import { EMBER_INSTANCE } from "../../../src/lib/instances";

export const API = EMBER_INSTANCE.api;

/**
 * Seeds an already-signed-in OAuth session (localStorage) before the page's own script runs, and
 * mocks the "my incoming datasets" dropdown endpoint so tests can pick straight up at "Connected"
 * instead of driving the real PKCE redirect flow.
 */
export async function seedSignedIn(
  page: Page,
  {
    identifier = "000123",
    title = "Incoming: Test Lab",
    embargoed = true,
  }: { identifier?: string; title?: string; embargoed?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ({ key, expiresAt }) => {
      localStorage.setItem(key, JSON.stringify({ oauth: { accessToken: "test-token", expiresAt } }));
    },
    { key: STORAGE_KEY, expiresAt: Date.now() + 3600_000 },
  );
  await page.route(`${API}/dandisets/?user=me&embargoed=true&page_size=1000`, (route: Route) =>
    route.fulfill({
      json: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            identifier,
            draft_version: { name: title },
            embargo_status: embargoed ? "EMBARGOED" : "OPEN",
          },
        ],
      },
    }),
  );
  // The human-subjects gate fetches the selected draft's metadata on every (re)selection; a
  // benign default keeps unrelated tests off the network. Tests exercising the gate override
  // this by registering their own route for the same URL after this call.
  await page.route(`${API}/dandisets/${identifier}/versions/draft/`, (route: Route) =>
    route.fulfill({ json: { name: title, description: "A test dataset." } }),
  );
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
