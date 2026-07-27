import { describe, expect, it } from "vitest";
import schema from "../../src/schemas/transfer-manifest.schema.json";
import {
  TRANSFER_MANIFEST_SCHEMA_VERSION,
  type TransferManifest,
  type FileTransferStats,
} from "../../src/lib/transfer-manifest";

// Not a full JSON Schema validator (the project has no ajv/etc. dependency for that); this just
// keeps the schema's key lists from silently drifting out of sync with the TS interfaces it
// documents, by walking a real sample object's keys against the schema's `properties`.
function expectKeysMatch(sample: object, def: { required?: string[]; properties: Record<string, unknown> }): void {
  const sampleKeys = Object.keys(sample).sort();
  expect(sampleKeys).toEqual(Object.keys(def.properties).sort());
  expect(sampleKeys).toEqual([...(def.required ?? [])].sort());
}

const fileStats: FileTransferStats = {
  path: "sourcedata/raw/sub-01/sub-01_ephys.dat",
  sizeBytes: 5_368_709_120,
  checksum: { startedAt: "2026-07-27T18:00:00.000Z", completedAt: "2026-07-27T18:00:59.000Z", MBps: 91 },
  upload: null,
  status: "cancelled",
};

const manifest: TransferManifest = {
  schemaVersion: TRANSFER_MANIFEST_SCHEMA_VERSION,
  dandisetId: "000123",
  sessionStartedAt: "2026-07-27T18:00:00.000Z",
  updatedAt: "2026-07-27T18:04:12.000Z",
  summary: {
    totalBytes: 5_368_709_120,
    hashMBps: 91,
    uploadMBps: 0,
    filesTotal: 1,
    filesDone: 0,
    filesErrored: 0,
  },
  files: [fileStats],
};

describe("transfer-manifest.schema.json", () => {
  it("declares the same top-level keys as TransferManifest", () => {
    expectKeysMatch(manifest, schema as { required?: string[]; properties: Record<string, unknown> });
  });

  it("declares the same keys as TransferManifest['summary']", () => {
    expectKeysMatch(
      manifest.summary,
      schema.properties.summary as { required?: string[]; properties: Record<string, unknown> },
    );
  });

  it("declares the same keys as FileTransferStats", () => {
    expectKeysMatch(
      fileStats,
      schema.$defs.fileTransferStats as { required?: string[]; properties: Record<string, unknown> },
    );
  });

  it("declares the same keys as a non-null checksum/upload phase entry", () => {
    expectKeysMatch(
      fileStats.checksum!,
      schema.$defs.phaseStats as { required?: string[]; properties: Record<string, unknown> },
    );
  });

  it("pins schemaVersion to the same value the schema declares", () => {
    expect(TRANSFER_MANIFEST_SCHEMA_VERSION).toBe(schema.properties.schemaVersion.const);
  });

  it("enumerates every real status value", () => {
    const outcomes: FileTransferStats["status"][] = ["pending", "blocked", "cancelled", "error", "replaced", "done"];
    expect(schema.$defs.fileTransferStats.properties.status.enum.sort()).toEqual([...outcomes].sort());
  });
});
