// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, diagnoseCors } from "../../src/lib/api";
import { ApiError } from "../../src/lib/errors";
import type { UploaderConfig } from "../../src/lib/types";

const cfg: UploaderConfig = {
  api: "https://api.example.org/api",
  web: "https://example.org",
  accessToken: "the-token",
  dandisetId: "000123",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe("apiFetch", () => {
  it("GETs with a bearer token and parses the JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { hello: "world" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ hello: string }>(cfg, "/info/");

    expect(result).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.org/api/info/");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer the-token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("POSTs a JSON body with a Content-Type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(cfg, "/uploads/initialize/", { method: "POST", json: { contentSize: 10 } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ contentSize: 10 }));
  });

  it("returns null for a 204 response instead of parsing a body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error("no body")),
      }),
    );
    const result = await apiFetch(cfg, "/oauth/revoke_token/", { method: "POST" });
    expect(result).toBeNull();
  });

  it("throws an ApiError carrying the status and response detail on a non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("no such dandiset"),
      }),
    );

    const err = await apiFetch(cfg, "/dandisets/000123/").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toBe("GET /dandisets/000123/ failed with HTTP 404: no such dandiset");
  });

  it("still throws a useful ApiError when the error body itself is unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error("stream broke")),
      }),
    );

    const err = await apiFetch(cfg, "/info/").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toBe("GET /info/ failed with HTTP 500");
  });

  it("wraps a network-level failure in an ApiError with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const err = await apiFetch(cfg, "/info/").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toMatch(/Network error calling \/info\/.*Failed to fetch/);
  });
});

describe("diagnoseCors", () => {
  // The probes are distinguishable by their request shape: the "simple" probe sends no
  // headers, the preflighted one sends Authorization, and the write probe POSTs.
  function stubProbes(opts: { simple: boolean; preflighted: boolean; post: boolean }): void {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const passes =
          init?.method === "POST" ? opts.post : headers.Authorization ? opts.preflighted : opts.simple;
        if (!passes) return Promise.reject(new TypeError("Failed to fetch"));
        return Promise.resolve({ status: 200 });
      }),
    );
  }

  it("reports a full CORS block when both probes fail", async () => {
    stubProbes({ simple: false, preflighted: false, post: false });
    await expect(diagnoseCors(cfg)).resolves.toMatch(/refuses ALL cross-origin requests/);
  });

  it("reports a preflight-specific failure when only the authorized probe fails", async () => {
    stubProbes({ simple: true, preflighted: false, post: false });
    await expect(diagnoseCors(cfg)).resolves.toMatch(/preflighted \(OPTIONS\).*requests are rejected/s);
  });

  it("blames an /uploads/-specific rule when reads AND other writes pass", async () => {
    stubProbes({ simple: true, preflighted: true, post: true });
    await expect(diagnoseCors(cfg)).resolves.toMatch(/proxy\/WAF rule specific to the \/uploads\/ path/);
  });

  it("points at the write allowlist when reads pass but writes are blocked", async () => {
    stubProbes({ simple: true, preflighted: true, post: false });
    await expect(diagnoseCors(cfg)).resolves.toMatch(/reads work but writes are blocked/);
  });
});
