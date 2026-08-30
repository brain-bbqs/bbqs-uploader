// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueFileRow, uploadFile } from "../../src/ui/processFile";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "../../src/lib/upload-pipeline";
import { diagnoseCors } from "../../src/lib/api";
import { ApiError } from "../../src/lib/errors";
import type { UploaderConfig } from "../../src/lib/types";
import type { HashJob } from "../../src/ui/processFile";

vi.mock("../../src/lib/upload-pipeline");
vi.mock("../../src/lib/api");

const uploadBlobMock = vi.mocked(uploadBlob);
const findExistingAssetMock = vi.mocked(findExistingAsset);
const createOrReplaceAssetMock = vi.mocked(createOrReplaceAsset);
const diagnoseCorsMock = vi.mocked(diagnoseCors);

const cfg: UploaderConfig = {
  api: "https://api.example.org/api",
  web: "https://example.org",
  accessToken: "t",
  dandisetId: "000123",
};

const file = new File([new Uint8Array(10)], "clip.mp4", { type: "video/mp4" });
const etag = `${"0".repeat(32)}-1`;

function makeRowAndPath(relativePath = "session1"): ReturnType<typeof queueFileRow> {
  const list = document.createElement("ul");
  document.body.appendChild(list);
  return queueFileRow(list, file, relativePath);
}

function hashJob(): HashJob {
  return { parts: [{ number: 1, offset: 0, size: 10 }], promise: Promise.resolve(etag) };
}

function statusOf(row: ReturnType<typeof queueFileRow>["row"]): string {
  return row.el.querySelector('[data-role="status"]')!.textContent!;
}

function badgeOf(row: ReturnType<typeof queueFileRow>["row"]): string {
  return row.el.querySelector('[data-role="badge"]')!.textContent!;
}

beforeEach(() => {
  vi.resetAllMocks();
  document.body.textContent = "";
  findExistingAssetMock.mockResolvedValue(null);
  uploadBlobMock.mockResolvedValue({ blobId: "b1", reused: false });
  createOrReplaceAssetMock.mockResolvedValue({ asset_id: "a1", path: "p" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("queueFileRow", () => {
  it("computes a sanitized sourcedata/raw destination path and unique row ids", () => {
    const first = makeRowAndPath("session1");
    const second = makeRowAndPath("session1");
    expect(first.path).toBe("sourcedata/raw/session1/clip.mp4");
    expect(first.row.el.id).not.toBe(second.row.el.id);
  });

  it("drops empty path segments from the relative path", () => {
    const { path } = makeRowAndPath("a//b/");
    expect(path).toBe("sourcedata/raw/a/b/clip.mp4");
  });
});

describe("uploadFile", () => {
  it("blocks (without uploading) when the config is unusable, crediting the bytes", async () => {
    const { row, path } = makeRowAndPath();
    const credited: number[] = [];

    const outcome = await uploadFile(row, file, path, { ...cfg, accessToken: "" }, new Set(), hashJob(), (b) =>
      credited.push(b),
    );

    expect(outcome).toBe("blocked");
    expect(badgeOf(row)).toBe("Blocked");
    expect(statusOf(row)).toContain("Not signed in.");
    expect(credited).toEqual([file.size]);
    expect(uploadBlobMock).not.toHaveBeenCalled();
  });

  it("uploads a new file end to end and reports Done", async () => {
    uploadBlobMock.mockImplementation((_cfg, f, _etag, _parts, onProgress) => {
      onProgress(0.5);
      onProgress(1);
      void f;
      return Promise.resolve({ blobId: "b1", reused: false });
    });
    const { row, path } = makeRowAndPath();
    const credited: number[] = [];

    const outcome = await uploadFile(row, file, path, cfg, new Set(), hashJob(), (b) => credited.push(b));

    expect(outcome).toBe("done");
    expect(badgeOf(row)).toBe("Done");
    expect(createOrReplaceAssetMock).toHaveBeenCalledWith(cfg, path, "b1", null, "video/mp4");
    expect(credited[credited.length - 1]).toBe(file.size);
  });

  it("replaces an existing asset at the same path and says whether content matched", async () => {
    findExistingAssetMock.mockResolvedValue({ asset_id: "old-asset", path: "p" });
    uploadBlobMock.mockResolvedValue({ blobId: "b1", reused: true });
    const { row, path } = makeRowAndPath();

    const outcome = await uploadFile(row, file, path, cfg, new Set(), hashJob());

    expect(outcome).toBe("replaced");
    expect(badgeOf(row)).toBe("Replaced");
    expect(statusOf(row)).toBe("matched existing content");
    expect(createOrReplaceAssetMock).toHaveBeenCalledWith(cfg, path, "b1", "old-asset", "video/mp4");
  });

  it("says the content was updated when a replacement actually re-transferred bytes", async () => {
    findExistingAssetMock.mockResolvedValue({ asset_id: "old-asset", path: "p" });
    uploadBlobMock.mockResolvedValue({ blobId: "b2", reused: false });
    const { row, path } = makeRowAndPath();

    const outcome = await uploadFile(row, file, path, cfg, new Set(), hashJob());

    expect(outcome).toBe("replaced");
    expect(statusOf(row)).toBe("content updated");
  });

  it("registers a typeless file without an encodingFormat", async () => {
    const untyped = new File([new Uint8Array(10)], "clip.bin");
    const list = document.createElement("ul");
    document.body.appendChild(list);
    const { row, path } = queueFileRow(list, untyped, "session1");

    const outcome = await uploadFile(row, untyped, path, cfg, new Set(), hashJob());

    expect(outcome).toBe("done");
    expect(createOrReplaceAssetMock).toHaveBeenCalledWith(cfg, path, "b1", null, undefined);
  });

  it("reports a cancellation when the hash was aborted before this upload started", async () => {
    const { row, path } = makeRowAndPath();
    const job: HashJob = {
      parts: [{ number: 1, offset: 0, size: 10 }],
      promise: Promise.reject(new DOMException("Upload cancelled.", "AbortError")),
    };
    const credited: number[] = [];

    const outcome = await uploadFile(row, file, path, cfg, new Set(), job, (b) => credited.push(b));

    expect(outcome).toBe("cancelled");
    expect(badgeOf(row)).toBe("Cancelled");
    // Cancelled bytes stay uncredited so the summary bar freezes where the cancel landed.
    expect(credited).toEqual([]);
  });

  it("reports an error with a friendly message and clears its abort controller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    uploadBlobMock.mockRejectedValue(new ApiError("upload exploded", 403));
    const { row, path } = makeRowAndPath();
    const active = new Set<AbortController>();

    const outcome = await uploadFile(row, file, path, cfg, active, hashJob());

    expect(outcome).toBe("error");
    expect(badgeOf(row)).toBe("Error");
    expect(statusOf(row)).toBe("Permission denied: your account cannot edit this dandiset.");
    expect(active.size).toBe(0);
    expect(diagnoseCorsMock).not.toHaveBeenCalled();
  });

  it("appends a CORS diagnosis when the failure looks like a network/CORS error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    uploadBlobMock.mockRejectedValue(new ApiError("Network error calling /uploads/initialize/", 0));
    diagnoseCorsMock.mockResolvedValue("CORS diagnosis: reads work but writes are blocked.");
    const { row, path } = makeRowAndPath();

    const outcome = await uploadFile(row, file, path, cfg, new Set(), hashJob());

    expect(outcome).toBe("error");
    expect(statusOf(row)).toBe(
      "Network error calling /uploads/initialize/ CORS diagnosis: reads work but writes are blocked.",
    );
  });
});
