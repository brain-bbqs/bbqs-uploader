import type { UploaderConfig } from "./types";
import { apiFetch } from "./api";

/**
 * The BBQS convention for flagging a staging dataset as holding human-subjects data: admins put
 * this exact phrase (case-sensitive) somewhere in the draft's description.
 */
export const HUMAN_SUBJECTS_PHRASE = "CONTAINS HUMAN SUBJECTS";

/** A dandischema EthicsApproval entry; `identifier` carries the IRB approval number. */
export interface EthicsApproval {
  schemaKey: "EthicsApproval";
  identifier?: string;
  [key: string]: unknown;
}

/**
 * The slice of a draft version's metadata this app reads/writes. Every other field is carried
 * through untouched (the index signature), so updating `ethicsApproval` round-trips the rest of
 * the document instead of dropping it.
 */
export interface DraftVersionMetadata {
  name?: string;
  description?: string;
  ethicsApproval?: EthicsApproval[];
  [key: string]: unknown;
}

export function containsHumanSubjects(metadata: DraftVersionMetadata | null): boolean {
  return metadata?.description?.includes(HUMAN_SUBJECTS_PHRASE) ?? false;
}

/** The first non-blank IRB approval number already recorded in the metadata, or "" if none. */
export function existingIrbNumber(metadata: DraftVersionMetadata | null): string {
  for (const approval of metadata?.ethicsApproval ?? []) {
    const irb = approval.identifier?.trim();
    if (irb) return irb;
  }
  return "";
}

export async function fetchDraftMetadata(cfg: UploaderConfig): Promise<DraftVersionMetadata | null> {
  return apiFetch<DraftVersionMetadata>(cfg, `/dandisets/${cfg.dandisetId}/versions/draft/`);
}

/**
 * Records an IRB approval number in the draft's metadata as an EthicsApproval entry. A number
 * that's already recorded is left alone (no API call); a new one is appended rather than
 * overwriting any existing entries, which may have been curated by someone else. Returns the
 * metadata as it now stands on the server.
 */
export async function saveIrbNumber(
  cfg: UploaderConfig,
  metadata: DraftVersionMetadata,
  irbNumber: string,
): Promise<DraftVersionMetadata> {
  const irb = irbNumber.trim();
  const approvals = metadata.ethicsApproval ?? [];
  if (approvals.some((a) => a.identifier?.trim() === irb)) return metadata;
  const updated: DraftVersionMetadata = {
    ...metadata,
    ethicsApproval: [...approvals, { schemaKey: "EthicsApproval", identifier: irb }],
  };
  await apiFetch(cfg, `/dandisets/${cfg.dandisetId}/versions/draft/`, {
    method: "PUT",
    json: { name: updated.name ?? "", metadata: updated },
  });
  return updated;
}
