import { describe, expect, it, vi } from "vitest";
import { listIncomingDandisets } from "../../src/lib/dandisets";
import type { UploaderConfig } from "../../src/lib/types";

const cfg: UploaderConfig = {
  api: "https://api-dandi.emberarchive.org/api",
  web: "https://dandi.emberarchive.org",
  accessToken: "token-1",
  dandisetId: "",
};

const ADMIN_USERNAME = "rhingo";
const NON_ADMIN_USERNAME = "some-random-user";

/** Routes the global fetch mock by URL: the dandiset list, then one /users/ lookup per dandiset. */
function stubFetch(listResults: unknown[], usersByIdentifier: Record<string, { username: string }[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/dandisets/?user=me")) {
        return { ok: true, json: async () => ({ results: listResults }) };
      }
      const match = /\/dandisets\/([^/]+)\/users\/$/.exec(url);
      const identifier = match?.[1] ?? "";
      return { ok: true, json: async () => usersByIdentifier[identifier] ?? [] };
    }),
  );
}

describe("listIncomingDandisets", () => {
  it("keeps only 'Incoming: ' titled dandisets that are also co-owned by an admin, sorted", async () => {
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
      {
        "000200": [{ username: ADMIN_USERNAME }],
        "000100": [{ username: NON_ADMIN_USERNAME }, { username: ADMIN_USERNAME }],
      },
    );

    const result = await listIncomingDandisets(cfg);

    expect(result).toEqual([
      { identifier: "000100", title: "Incoming: Alpha Lab", embargoed: false },
      { identifier: "000200", title: "Incoming: Zeta Lab", embargoed: true },
    ]);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api-dandi.emberarchive.org/api/dandisets/?user=me&embargoed=true&page_size=1000");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    vi.unstubAllGlobals();
  });

  it("excludes an 'Incoming: ' dandiset with no admin among its owners", async () => {
    stubFetch([{ identifier: "000100", draft_version: { name: "Incoming: Self Made" }, embargo_status: "EMBARGOED" }], {
      "000100": [{ username: NON_ADMIN_USERNAME }],
    });

    const result = await listIncomingDandisets(cfg);
    expect(result).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("excludes an 'Incoming: ' dandiset when the owner lookup fails", async () => {
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
        return { ok: false, status: 500, text: async () => "boom" };
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
      { "000100": [{ username: ADMIN_USERNAME }] },
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
