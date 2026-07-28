import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadTransferReport, TRANSFER_REPORT_SCHEMA_VERSION } from "../../src/lib/transfer-report";
import type { TransferReport } from "../../src/lib/transfer-report";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "../../src/lib/upload-pipeline";
import type { UploaderConfig } from "../../src/lib/types";

vi.mock("../../src/lib/upload-pipeline");

const uploadBlobMock = vi.mocked(uploadBlob);
const findExistingAssetMock = vi.mocked(findExistingAsset);
const createOrReplaceAssetMock = vi.mocked(createOrReplaceAsset);

const cfg: UploaderConfig = {
  api: "https://api.example.org/api",
  web: "https://example.org",
  accessToken: "t",
  dandisetId: "000123",
};

function makeReport(): TransferReport {
  return {
    schemaVersion: TRANSFER_REPORT_SCHEMA_VERSION,
    dandisetId: "000123",
    sessionStartedAt: "2026-01-02T03:00:00.000Z",
    updatedAt: "2026-01-02T03:04:05.678Z",
    summary: { totalBytes: 10, hashMBps: 1, uploadMBps: 2, filesTotal: 1, filesDone: 1, filesErrored: 0 },
    files: [
      {
        path: "sourcedata/raw/clip.mp4",
        sizeBytes: 10,
        checksum: { startedAt: "2026-01-02T03:01:00.000Z", completedAt: "2026-01-02T03:02:00.000Z", MBps: 1 },
        upload: { startedAt: "2026-01-02T03:02:00.000Z", completedAt: "2026-01-02T03:03:00.000Z", MBps: 2 },
        status: "done",
      },
    ],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  uploadBlobMock.mockResolvedValue({ blobId: "blob-1", reused: false });
  findExistingAssetMock.mockResolvedValue(null);
  createOrReplaceAssetMock.mockResolvedValue({ asset_id: "a1", path: "p" });
});

describe("uploadTransferReport", () => {
  it("uploads the report JSON to a hidden path keyed on the completion timestamp", async () => {
    await uploadTransferReport(cfg, makeReport());

    const expectedPath = "sourcedata/raw/.transfer/transfer-2026-01-02T03-04-05-678Z.json";
    expect(findExistingAssetMock).toHaveBeenCalledWith(cfg, expectedPath);
    expect(createOrReplaceAssetMock).toHaveBeenCalledWith(cfg, expectedPath, "blob-1", null, "application/json");

    // The uploaded file is the pretty-printed report itself, named after the path's last segment.
    const [, file, etag, parts] = uploadBlobMock.mock.calls[0];
    expect(file.name).toBe("transfer-2026-01-02T03-04-05-678Z.json");
    expect(file.type).toBe("application/json");
    expect(JSON.parse(await file.text())).toEqual(makeReport());
    expect(parts).toHaveLength(1);
    expect(etag).toMatch(/^[0-9a-f]{32}-1$/);
  });

  it("replaces an existing report asset at the same path instead of duplicating it", async () => {
    findExistingAssetMock.mockResolvedValue({
      asset_id: "existing-asset",
      path: "sourcedata/raw/.transfer/transfer-2026-01-02T03-04-05-678Z.json",
    });

    await uploadTransferReport(cfg, makeReport());

    expect(createOrReplaceAssetMock).toHaveBeenCalledWith(
      cfg,
      expect.any(String),
      "blob-1",
      "existing-asset",
      "application/json",
    );
  });

  it("threads the abort signal through to the blob upload", async () => {
    const controller = new AbortController();
    await uploadTransferReport(cfg, makeReport(), controller.signal);
    expect(uploadBlobMock.mock.calls[0][5]).toBe(controller.signal);
  });
});
