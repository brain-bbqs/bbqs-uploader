import type { UploaderConfig } from "./types";
import type { UploadOutcome } from "../ui/processFile";
import { planParts, hashPart, combineDigests } from "./etag";
import { uploadBlob, findExistingAsset, createOrReplaceAsset } from "./upload-pipeline";

// Not run through sanitizePath: that function strips leading dots from path segments (they read
// as accidental "trim this" punctuation on a user-supplied filename), which would turn our
// intentionally-hidden ".transfer" directory into a plain "transfer" one. This path is fully
// under our control, not derived from a dropped file, so it skips that sanitization entirely.
//
// The filename is keyed on the manifest's completion timestamp rather than a fixed name, so each
// "Upload" batch writes its own file instead of every batch overwriting the same
// transfer-manifest.json.
function manifestPath(updatedAt: string): string {
  return `sourcedata/raw/.transfer/transfer-${updatedAt.replace(/[:.]/g, "-")}.json`;
}

export interface FileTransferStats {
  path: string;
  sizeBytes: number;
  checksum?: { startedAt: string; completedAt: string; MBps: number };
  upload?: { startedAt: string; completedAt: string; MBps: number };
  status: UploadOutcome | "pending";
}

export interface TransferManifest {
  dandisetId: string;
  sessionStartedAt: string;
  updatedAt: string;
  summary: {
    totalBytes: number;
    hashMBps: number;
    uploadMBps: number;
    filesTotal: number;
    filesDone: number;
    filesErrored: number;
  };
  files: FileTransferStats[];
}

/**
 * Uploads a JSON snapshot of this session's transfer stats to a timestamped hidden path (one
 * file per "Upload" batch), using the same checksum/multipart-upload pipeline as any other asset
 * — it's just a small in-memory file instead of a dropped one.
 */
export async function uploadTransferManifest(
  cfg: UploaderConfig,
  manifest: TransferManifest,
  signal?: AbortSignal,
): Promise<void> {
  const path = manifestPath(manifest.updatedAt);
  const file = new File([JSON.stringify(manifest, null, 2)], path.split("/").pop()!, {
    type: "application/json",
  });
  const parts = planParts(file.size);
  const partDigests = new Uint8Array(parts.length * 16);
  for (const part of parts) {
    partDigests.set(await hashPart(file, part, () => {}), (part.number - 1) * 16);
  }
  const etag = combineDigests(partDigests, parts.length);

  const existing = await findExistingAsset(cfg, path);
  const { blobId } = await uploadBlob(cfg, file, etag, parts, () => {}, signal);
  await createOrReplaceAsset(cfg, path, blobId, existing?.asset_id ?? null, file.type);
}
