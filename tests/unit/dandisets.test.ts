import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, routeFetch } from "@brain-bbqs/test-utils/vitest";
import { listIncomingDandisets, type ArchiveConfig } from "@brain-bbqs/ember-client";

// listIncomingDandisets lives in @brain-bbqs/ember-client, whose own suite covers it in full. This
// suite pins the one property SECURITY.md promises about it from this app's side, so a package
// update that broke it would fail here too: the user's token goes to the archive and nowhere else.

const cfg: ArchiveConfig = {
  api: "https://api-dandi.emberarchive.org/api",
  web: "https://dandi.emberarchive.org",
  accessToken: "token-1",
  dandisetId: "",
};

const ADMIN_CHECK_PREFIX = "https://uploader-codycbakerphd.pythonanywhere.com/admin-owned/";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listIncomingDandisets, as the dataset picker calls it", () => {
  it("sends the access token to the archive but never to the admin-check service", async () => {
    const fetchMock = vi.fn(
      routeFetch([
        {
          match: "/dandisets/?user=me",
          respond: jsonResponse({
            results: [
              { identifier: "000100", draft_version: { name: "Incoming: Alpha Lab" }, embargo_status: "EMBARGOED" },
            ],
          }),
        },
        { match: (url) => url.startsWith(ADMIN_CHECK_PREFIX), respond: jsonResponse({ adminOwned: true }) },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { datasets } = await listIncomingDandisets(cfg, { onUnverified: () => {} });

    expect(datasets).toEqual([{ identifier: "000100", title: "Incoming: Alpha Lab", embargoed: true }]);
    const [listUrl, listInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(listUrl).toBe("https://api-dandi.emberarchive.org/api/dandisets/?user=me&embargoed=true&page_size=1000");
    expect((listInit.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
    const adminCheckCall = fetchMock.mock.calls.find(([url]) => String(url) === `${ADMIN_CHECK_PREFIX}000100`);
    expect(adminCheckCall?.[1]).toBe(undefined);
  });

  it("fails closed, silently, when the admin-check service cannot answer", async () => {
    const warn = vi.spyOn(console, "warn");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        routeFetch([
          {
            match: "/dandisets/?user=me",
            respond: jsonResponse({
              results: [
                { identifier: "000100", draft_version: { name: "Incoming: Broken" }, embargo_status: "EMBARGOED" },
              ],
            }),
          },
          { match: (url) => url.startsWith(ADMIN_CHECK_PREFIX), respond: () => Promise.reject(new TypeError("down")) },
        ]),
      ),
    );

    const result = await listIncomingDandisets(cfg, { onUnverified: () => {} });

    expect(result).toEqual({ datasets: [], unverified: 1 });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
