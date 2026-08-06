import { afterEach, describe, expect, it, vi } from "vitest";
import { listRemoteFiles, REMOTE_PREFIX } from "../../src/lib/remote-listing";
import type { UploaderConfig } from "../../src/lib/types";

const cfg = {
  api: "https://api.example.test/api",
  dandisetId: "000123",
  accessToken: "token",
} as UploaderConfig;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listRemoteFiles", () => {
  it("requests a prefix-filtered listing and maps paths to sizes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { path: "sourcedata/raw/a/one.mp4", size: 10 },
          { path: "sourcedata/raw/two.txt", size: 5 },
        ],
        next: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const listing = await listRemoteFiles(cfg);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`/dandisets/000123/versions/draft/assets/?path=${encodeURIComponent(REMOTE_PREFIX)}`);
    expect(url).toContain("metadata=false");
    expect(listing.get("sourcedata/raw/a/one.mp4")).toBe(10);
    expect(listing.get("sourcedata/raw/two.txt")).toBe(5);
    expect(listing.size).toBe(2);
  });

  it("follows same-host pagination and merges every page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ path: "sourcedata/raw/one.mp4", size: 1 }],
          next: `${cfg.api}/dandisets/000123/versions/draft/assets/?page=2`,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [{ path: "sourcedata/raw/two.mp4", size: 2 }], next: null }));
    vi.stubGlobal("fetch", fetchMock);

    const listing = await listRemoteFiles(cfg);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(listing.size).toBe(2);
  });

  it("stops when the next page points at a foreign host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [{ path: "sourcedata/raw/one.mp4", size: 1 }],
        next: "https://evil.example.com/assets/?page=2",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const listing = await listRemoteFiles(cfg);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listing.size).toBe(1);
  });

  it("skips malformed entries and tolerates an empty page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [{ path: "sourcedata/raw/ok.mp4", size: 3 }, { path: 12 }, { size: 4 }, {}],
        next: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const listing = await listRemoteFiles(cfg);

    expect(Array.from(listing.keys())).toEqual(["sourcedata/raw/ok.mp4"]);
  });

  it("propagates API failures instead of returning an empty listing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(listRemoteFiles(cfg)).rejects.toThrow(/500/);
  });
});
