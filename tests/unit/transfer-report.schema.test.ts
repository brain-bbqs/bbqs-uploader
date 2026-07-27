import { describe, expect, it } from "vitest";
import schema from "../../src/schemas/transfer-report.v1.schema.json";
import {
  TRANSFER_REPORT_SCHEMA_VERSION,
  type TransferReport,
  type FileTransferStats,
} from "../../src/lib/transfer-report";

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

const report: TransferReport = {
  schemaVersion: TRANSFER_REPORT_SCHEMA_VERSION,
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

describe("transfer-report.v1.schema.json", () => {
  it("declares the same top-level keys as TransferReport", () => {
    expectKeysMatch(report, schema as { required?: string[]; properties: Record<string, unknown> });
  });

  it("declares the same keys as TransferReport['summary']", () => {
    expectKeysMatch(
      report.summary,
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
    expect(TRANSFER_REPORT_SCHEMA_VERSION).toBe(schema.properties.schemaVersion.const);
  });

  it("enumerates every real status value", () => {
    const outcomes: FileTransferStats["status"][] = ["pending", "blocked", "cancelled", "error", "replaced", "done"];
    expect(schema.$defs.fileTransferStats.properties.status.enum.sort()).toEqual([...outcomes].sort());
  });
});
