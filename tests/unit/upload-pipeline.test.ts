import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "../../src/lib/upload-pipeline";
import { apiFetch } from "../../src/lib/api";
import { uploadPartWithRetry } from "../../src/lib/s3-upload";
import { ApiError } from "../../src/lib/errors";
import type { Asset, FilePart, UploaderConfig } from "../../src/lib/types";

vi.mock("../../src/lib/api");
vi.mock("../../src/lib/s3-upload");

const apiFetchMock = vi.mocked(apiFetch);
const uploadPartMock = vi.mocked(uploadPartWithRetry);

const cfg: UploaderConfig = {
  api: "https://api.example.org/api",
  web: "https://example.org",
  accessToken: "t",
  dandisetId: "000123",
};

const file = new File([new Uint8Array(10)], "clip.mp4");
const parts: FilePart[] = [{ number: 1, offset: 0, size: 10 }];
const etag = `${"0".repeat(32)}-1`;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadBlob", () => {
  it("initializes, uploads every part, completes on S3, and validates", async () => {
    apiFetchMock.mockImplementation((_cfg, path) => {
      if (path === "/uploads/initialize/") {
        return Promise.resolve({
          upload_id: "u1",
          parts: [{ part_number: 1, size: 10, upload_url: "https://s3.example/p1" }],
        });
      }
      if (path === "/uploads/u1/complete/") {
        return Promise.resolve({ complete_url: "https://s3.example/complete", body: "<xml/>" });
      }
      if (path === "/uploads/u1/validate/") return Promise.resolve({ blob_id: "b1" });
      throw new Error(`unexpected apiFetch path: ${path}`);
    });
    uploadPartMock.mockImplementation((_url, blob, onProgress) => {
      onProgress(blob.size);
      return Promise.resolve("server-etag-1");
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);
    const progress: number[] = [];

    const result = await uploadBlob(cfg, file, etag, parts, (f) => progress.push(f));

    expect(result).toEqual({ blobId: "b1", reused: false });
    expect(progress[progress.length - 1]).toBe(1);
    // The completed parts echo S3's etags back to the completion endpoint.
    const completeCall = apiFetchMock.mock.calls.find(([, path]) => path === "/uploads/u1/complete/")!;
    expect(completeCall[2]).toEqual({
      method: "POST",
      json: { parts: [{ part_number: 1, size: 10, etag: "server-etag-1" }] },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://s3.example/complete", {
      method: "POST",
      body: "<xml/>",
    });
  });

  it("reuses the existing server-side blob when initialize answers 409", async () => {
    apiFetchMock.mockImplementation((_cfg, path) => {
      if (path === "/uploads/initialize/") return Promise.reject(new ApiError("conflict", 409));
      if (path === "/blobs/digest/") return Promise.resolve({ blob_id: "existing-blob" });
      throw new Error(`unexpected apiFetch path: ${path}`);
    });
    const progress: number[] = [];

    const result = await uploadBlob(cfg, file, etag, parts, (f) => progress.push(f));

    expect(result).toEqual({ blobId: "existing-blob", reused: true });
    expect(progress).toEqual([1]);
    expect(uploadPartMock).not.toHaveBeenCalled();
  });

  it("propagates a non-409 initialize failure untouched", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("nope", 403));
    await expect(uploadBlob(cfg, file, etag, parts, () => {})).rejects.toThrow("nope");
    expect(uploadPartMock).not.toHaveBeenCalled();
  });

  it("aborts when the server plans a different number of parts than the client", async () => {
    apiFetchMock.mockResolvedValue({
      upload_id: "u1",
      parts: [
        { part_number: 1, size: 5, upload_url: "https://s3.example/p1" },
        { part_number: 2, size: 5, upload_url: "https://s3.example/p2" },
      ],
    });
    await expect(uploadBlob(cfg, file, etag, parts, () => {})).rejects.toThrow(
      /Server planned 2 parts but this client computed 1/,
    );
  });

  it("aborts when a server part's size disagrees with the client's plan", async () => {
    apiFetchMock.mockResolvedValue({
      upload_id: "u1",
      parts: [{ part_number: 1, size: 7, upload_url: "https://s3.example/p1" }],
    });
    await expect(uploadBlob(cfg, file, etag, parts, () => {})).rejects.toThrow(/Part 1 size mismatch/);
  });

  it("surfaces an S3 CompleteMultipartUpload rejection even under HTTP 200", async () => {
    apiFetchMock.mockImplementation((_cfg, path) => {
      if (path === "/uploads/initialize/") {
        return Promise.resolve({
          upload_id: "u1",
          parts: [{ part_number: 1, size: 10, upload_url: "https://s3.example/p1" }],
        });
      }
      if (path === "/uploads/u1/complete/") {
        return Promise.resolve({ complete_url: "https://s3.example/complete", body: "<xml/>" });
      }
      throw new Error(`unexpected apiFetch path: ${path}`);
    });
    uploadPartMock.mockResolvedValue("server-etag-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<Error><Code>InvalidPart</Code></Error>"),
      }),
    );

    await expect(uploadBlob(cfg, file, etag, parts, () => {})).rejects.toThrow(
      /S3 rejected the CompleteMultipartUpload request/,
    );
  });
});

describe("findExistingAsset", () => {
  const asset = (path: string): Asset => ({ asset_id: `id-${path}`, path });

  it("returns the asset whose path matches exactly", async () => {
    apiFetchMock.mockResolvedValue({
      results: [asset("sourcedata/raw/other.mp4"), asset("sourcedata/raw/clip.mp4")],
      next: null,
    });

    const hit = await findExistingAsset(cfg, "sourcedata/raw/clip.mp4");
    expect(hit).toEqual(asset("sourcedata/raw/clip.mp4"));
    const [, url] = apiFetchMock.mock.calls[0];
    expect(url).toContain("/dandisets/000123/versions/draft/assets/");
    expect(url).toContain(`path=${encodeURIComponent("sourcedata/raw/clip.mp4")}`);
  });

  it("follows same-host pagination until the path is found", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        results: [asset("a")],
        next: `${cfg.api}/dandisets/000123/versions/draft/assets/?page=2`,
      })
      .mockResolvedValueOnce({ results: [asset("b")], next: null });

    const hit = await findExistingAsset(cfg, "b");
    expect(hit).toEqual(asset("b"));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock.mock.calls[1][1]).toBe("/dandisets/000123/versions/draft/assets/?page=2");
  });

  it("stops (returns null) when pagination points at a foreign host", async () => {
    apiFetchMock.mockResolvedValue({
      results: [asset("a")],
      next: "https://evil.example.org/assets/?page=2",
    });

    expect(await findExistingAsset(cfg, "b")).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when no page contains the path", async () => {
    apiFetchMock.mockResolvedValue({ results: [], next: null });
    expect(await findExistingAsset(cfg, "missing")).toBeNull();
  });
});

describe("createOrReplaceAsset", () => {
  it("PUTs to the existing asset when replacing", async () => {
    apiFetchMock.mockResolvedValue({ asset_id: "a1", path: "p" });

    await createOrReplaceAsset(cfg, "p", "blob-1", "a1", "video/mp4");

    expect(apiFetchMock).toHaveBeenCalledWith(cfg, "/dandisets/000123/versions/draft/assets/a1/", {
      method: "PUT",
      json: { blob_id: "blob-1", metadata: { path: "p", encodingFormat: "video/mp4" } },
    });
  });

  it("POSTs a new asset (without encodingFormat when unknown) when none exists", async () => {
    apiFetchMock.mockResolvedValue({ asset_id: "a2", path: "p" });

    await createOrReplaceAsset(cfg, "p", "blob-1", null);

    expect(apiFetchMock).toHaveBeenCalledWith(cfg, "/dandisets/000123/versions/draft/assets/", {
      method: "POST",
      json: { blob_id: "blob-1", metadata: { path: "p" } },
    });
  });
});
