// @vitest-environment jsdom
// Boots src/main.ts over the exact localStorage bytes a browser signed in before the move to
// @brain-bbqs/ember-client holds, with nothing but the network stubbed: the real OAuth client,
// settings store, dataset picker and identity lookup all run. The session must restore, refresh
// through the same token request, and be written back in the same shape.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { jsonResponse, routeFetch, type FetchRouter } from "@brain-bbqs/test-utils/vitest";
import { bootMain, el } from "./helpers/mainHarness";

const STORED_BEFORE_THE_MOVE =
  '{"dandisetId":"000456","oauth":{"accessToken":"seeded-access","refreshToken":"seeded-refresh","expiresAt":1000}}';
const API = "https://api-dandi.emberarchive.org/api";
const ADMIN_CHECK = "https://uploader-codycbakerphd.pythonanywhere.com/admin-owned/";

let fetchMock: FetchRouter;
let warnSpy: MockInstance;

function headersOf(call: { init?: RequestInit }): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

beforeAll(async () => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock = routeFetch([
    {
      match: "https://api-dandi.emberarchive.org/oauth/token/",
      respond: () =>
        jsonResponse({ access_token: "refreshed-access", refresh_token: "refreshed-refresh", expires_in: 36000 }),
    },
    { match: `${API}/users/me/`, respond: () => jsonResponse({ username: "jdoe", name: "Jane Doe" }) },
    {
      match: `${API}/dandisets/?user=me`,
      respond: () =>
        jsonResponse({
          results: [
            { identifier: "000123", draft_version: { name: "Incoming: First" }, embargo_status: "EMBARGOED" },
            { identifier: "000456", draft_version: { name: "Incoming: Second" }, embargo_status: "EMBARGOED" },
            { identifier: "000789", draft_version: { name: "Incoming: Unchecked" }, embargo_status: "EMBARGOED" },
          ],
        }),
    },
    {
      match: (url) => url.startsWith(ADMIN_CHECK),
      respond: (url) => (url.endsWith("000789") ? jsonResponse({}, 503) : jsonResponse({ adminOwned: true })),
    },
    {
      match: `${API}/dandisets/000456/versions/draft/`,
      respond: () => jsonResponse({ description: "Ordinary data." }),
    },
  ]);
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem("bbqs-uploader.settings.v1", STORED_BEFORE_THE_MOVE);
  await bootMain();
});

describe("a sign-in stored before the move to @brain-bbqs/ember-client", () => {
  it("restores the signed-in session", () => {
    expect(el("oauth-signin-btn").hidden).toBe(true);
    expect(el("oauth-signed-in").hidden).toBe(false);
  });

  it("refreshes the expired token with the same request as before", async () => {
    await vi.waitFor(() => {
      expect(fetchMock.callsTo("/oauth/token/")).toHaveLength(1);
    });
    const [refresh] = fetchMock.callsTo("/oauth/token/");
    expect(refresh.init?.method).toBe("POST");
    expect(refresh.init?.body).toBe(
      "grant_type=refresh_token&refresh_token=seeded-refresh&client_id=KoQNdyPaJULkfRJXa9YSm6PTC29TLzEz8yZH3vNv",
    );
  });

  it("writes the refreshed tokens back in the same shape, under the same key", async () => {
    await vi.waitFor(() => {
      expect(localStorage.getItem("bbqs-uploader.settings.v1")).toContain("refreshed-access");
    });
    const raw = localStorage.getItem("bbqs-uploader.settings.v1")!;
    const { oauth } = JSON.parse(raw) as { oauth: { expiresAt: number } };
    expect(raw).toBe(
      JSON.stringify({
        dandisetId: "000456",
        oauth: { accessToken: "refreshed-access", refreshToken: "refreshed-refresh", expiresAt: oauth.expiresAt },
      }),
    );
    expect(Object.keys(localStorage)).toEqual(["bbqs-uploader.settings.v1"]);
  });

  it("calls the archive with the refreshed token, and the admin check with none", async () => {
    await vi.waitFor(() => {
      expect(el("oauth-username").textContent).toBe("jdoe");
    });
    expect(el("oauth-avatar").textContent).toBe("JD");
    for (const call of [...fetchMock.callsTo("/users/me/"), ...fetchMock.callsTo("/dandisets/?user=me")]) {
      expect(headersOf(call).Authorization).toBe("Bearer refreshed-access");
    }
    const adminChecks = fetchMock.callsTo("/admin-owned/");
    expect(adminChecks).toHaveLength(3);
    for (const call of adminChecks) expect(call.init).toBe(undefined);
  });

  it("restores the remembered dataset, leaving out the one whose admin check failed without a warning", async () => {
    const select = el<HTMLSelectElement>("dandiset-id");
    await vi.waitFor(() => {
      expect(select.hidden).toBe(false);
    });
    expect(Array.from(select.options, (o) => o.value)).toEqual(["000123", "000456"]);
    expect(select.value).toBe("000456");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
