import type { UploaderConfig } from "./types";
import { apiFetch } from "./api";

// The archive prefix every upload lands under (see queueFileRow); the listing below is scoped to
// it so the diff only ever considers this uploader's own corner of the dataset.
export const REMOTE_PREFIX = "sourcedata/raw/";

// Follows the same pagination shape (and foreign-host guard) as findExistingAsset in
// upload-pipeline.ts, but sized for a full listing rather than a single-path lookup.
const LISTING_PAGE_SIZE = 1000;
const LISTING_MAX_PAGES = 50;

interface ListedAsset {
  path?: string;
  size?: number;
}

/**
 * Lists every asset already uploaded under sourcedata/raw/ in the dataset's draft version, as a
 * map of full archive path ("sourcedata/raw/…") to size in bytes. The `path` query parameter is a
 * prefix filter on the assets endpoint. Throws on network/API failure — callers surface that as a
 * "couldn't check" state rather than mistaking it for an empty dataset.
 */
export async function listRemoteFiles(cfg: UploaderConfig, signal?: AbortSignal): Promise<Map<string, number>> {
  const listing = new Map<string, number>();
  let url: string | null =
    `/dandisets/${cfg.dandisetId}/versions/draft/assets/` +
    `?path=${encodeURIComponent(REMOTE_PREFIX)}&metadata=false&order=path&page_size=${LISTING_PAGE_SIZE}`;
  for (let pages = 0; url && pages < LISTING_MAX_PAGES; pages++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const page: { results?: ListedAsset[]; next?: string | null } = (await apiFetch<{
      results?: ListedAsset[];
      next?: string | null;
    }>(cfg, url))!;
    for (const asset of page.results ?? []) {
      if (typeof asset.path === "string" && typeof asset.size === "number") {
        listing.set(asset.path, asset.size);
      }
    }
    url = page.next ? page.next.replace(cfg.api, "") : null;
    if (url && /^https?:\/\//.test(url)) break; // next page on foreign host — stop
  }
  return listing;
}
