import type { UploaderConfig } from "./types";
import { apiFetch } from "./api";

export interface IncomingDandiset {
  identifier: string;
  title: string;
}

interface DandisetListItem {
  identifier: string;
  draft_version?: { name?: string };
  most_recent_published_version?: { name?: string };
}

interface DandisetListResponse {
  results: DandisetListItem[];
}

const INCOMING_PREFIX = "Incoming: ";

/**
 * Dandisets the signed-in user owns whose title starts with "Incoming: " — the BBQS convention
 * for a lab's staging dataset. page_size=1000 is the archive's max page size and comfortably
 * covers any one user's owned dandisets, so further pages are never followed.
 */
export async function listIncomingDandisets(cfg: UploaderConfig): Promise<IncomingDandiset[]> {
  const resp = await apiFetch<DandisetListResponse>(cfg, "/dandisets/?user=me&embargoed=true&page_size=1000");
  return (resp?.results ?? [])
    .map((d) => ({
      identifier: d.identifier,
      title: d.most_recent_published_version?.name ?? d.draft_version?.name ?? "",
    }))
    .filter((d) => d.title.startsWith(INCOMING_PREFIX))
    .sort((a, b) => a.title.localeCompare(b.title));
}
