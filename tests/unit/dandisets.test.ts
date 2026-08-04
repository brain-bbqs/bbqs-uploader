import { describe, expect, it, vi } from "vitest";
import { listIncomingDandisets } from "../../src/lib/dandisets";
import type { UploaderConfig } from "../../src/lib/types";

const cfg: UploaderConfig = {
  api: "https://api-dandi.emberarchive.org/api",
  web: "https://dandi.emberarchive.org",
  accessToken: "token-1",
  dandisetId: "",
};

const ADMIN_CHECK_BASE_URL = "https://uploader-codycbakerphd.pythonanywhere.com";

/** Routes the global fetch mock by URL: the dandiset list, then one admin-check call per dandiset. */
function stubFetch(listResults: unknown[], adminOwnedByIdentifier: Record<string, boolean>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/dandisets/?user=me")) {
        return { ok: true, json: async () => ({ results: listResults }) };
      }
      const match = new RegExp(`^${ADMIN_CHECK_BASE_URL}/admin-owned/([^/]+)$`).exec(url);
      const identifier = match?.[1] ?? "";
      return { ok: true, json: async () => ({ adminOwned: adminOwnedByIdentifier[identifier] ?? false }) };
    }),
  );
}

describe("listIncomingDandisets", () => {
  it("keeps only 'Incoming: ' titled dandisets that are also admin-owned, sorted", async () => {
    stubFetch(
      [
        { identifier: "000200", draft_version: { name: "Incoming: Zeta Lab" }, embargo_status: "EMBARGOED" },
        {
          identifier: "000100",
          most_recent_published_version: { name: "Incoming: Alpha Lab" },
          embargo_status: "OPEN",
        },
        { identifier: "000300", draft_version: { name: "Not an incoming dataset" }, embargo_status: "EMBARGOED" },
      ],
      { "000200": true, "000100": true },
    );

    const result = await listIncomingDandisets(cfg);

    expect(result).toEqual([
      { identifier: "000100", title: "Incoming: Alpha Lab", embargoed: false },
      { identifier: "000200", title: "Incoming: Zeta Lab", embargoed: true },
    ]);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api-dandi.emberarchive.org/api/dandisets/?user=me&embargoed=true&page_size=1000");
    expect(init.headers.Authorization).toBe("Bearer token-1");

    const adminCheckCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([callUrl]) =>
      String(callUrl).includes("/admin-owned/000100"),
    );
    expect(adminCheckCall?.[1].headers.Authorization).toBe("Bearer token-1");
    vi.unstubAllGlobals();
  });

  it("excludes an 'Incoming: ' dandiset the admin-check service says is not admin-owned", async () => {
    stubFetch([{ identifier: "000100", draft_version: { name: "Incoming: Self Made" }, embargo_status: "EMBARGOED" }], {
      "000100": false,
    });

    const result = await listIncomingDandisets(cfg);
    expect(result).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("excludes an 'Incoming: ' dandiset when the admin-check service fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/dandisets/?user=me")) {
          return {
            ok: true,
            json: async () => ({
              results: [
                { identifier: "000100", draft_version: { name: "Incoming: Broken" }, embargo_status: "EMBARGOED" },
              ],
            }),
          };
        }
        return { ok: false, status: 502 };
      }),
    );

    const result = await listIncomingDandisets(cfg);
    expect(result).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("prefers the published version's title over the draft's", async () => {
    stubFetch(
      [
        {
          identifier: "000100",
          draft_version: { name: "Incoming: Draft Title" },
          most_recent_published_version: { name: "Incoming: Published Title" },
          embargo_status: "EMBARGOED",
        },
      ],
      { "000100": true },
    );

    const result = await listIncomingDandisets(cfg);
    expect(result).toEqual([{ identifier: "000100", title: "Incoming: Published Title", embargoed: true }]);
    vi.unstubAllGlobals();
  });

  it("returns an empty list when the response has no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const result = await listIncomingDandisets(cfg);
    expect(result).toEqual([]);
    vi.unstubAllGlobals();
  });
});
