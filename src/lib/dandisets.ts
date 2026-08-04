import type { UploaderConfig } from "./types";
import { apiFetch } from "./api";

export interface IncomingDandiset {
  identifier: string;
  title: string;
  embargoed: boolean;
}

interface DandisetListItem {
  identifier: string;
  embargo_status?: string;
  draft_version?: { name?: string };
  most_recent_published_version?: { name?: string };
}

interface DandisetListResponse {
  results: DandisetListItem[];
}

const INCOMING_PREFIX = "Incoming: ";

/**
 * SHA-256 hashes (hex) of the DANDI usernames for the BBQS/EMBER admins who are trusted to set up
 * an "Incoming: " staging dataset. Any signed-in DANDI user can title one of their own dandisets
 * "Incoming: ..." and would otherwise show up in this app as a valid upload target, so a dataset
 * only counts if one of these admins is *also* a listed owner. Hashed rather than spelled out so
 * the admin roster isn't sitting in plaintext in the shipped JS bundle.
 */
const ADMIN_USERNAME_HASHES = new Set([
  "3a85bd924be07ed2662d5bfda33e0c5c27b3d9715cbfa497ece15a370d0afdbc", // CodyCBakerPhD
  "e18430ab21eac1d509d0cdf03dd586f98abdd96d6f1bfaf76f97b0d5fe8621e0", // rhingo
  "5db33017e09d8b5a2ebdc4449e7341b7dbffffd6267e588c1d22f8e9911cb9af", // neha-thomas477
]);

interface DandisetUser {
  username: string;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Whether one of the fixed BBQS/EMBER admins is a listed owner of the given dandiset. */
async function hasAdminOwner(cfg: UploaderConfig, identifier: string): Promise<boolean> {
  const users = await apiFetch<DandisetUser[]>(cfg, `/dandisets/${identifier}/users/`);
  const hashes = await Promise.all((users ?? []).map((u) => sha256Hex(u.username)));
  return hashes.some((h) => ADMIN_USERNAME_HASHES.has(h));
}

/**
 * Dandisets the signed-in user owns whose title starts with "Incoming: " — the BBQS convention
 * for a lab's staging dataset — and that are also co-owned by a BBQS/EMBER admin, so an arbitrary
 * DANDI user can't self-provision an "Incoming: " dataset to use this tool unsupervised.
 * page_size=1000 is the archive's max page size and comfortably covers any one user's owned
 * dandisets, so further pages are never followed.
 */
export async function listIncomingDandisets(cfg: UploaderConfig): Promise<IncomingDandiset[]> {
  const resp = await apiFetch<DandisetListResponse>(cfg, "/dandisets/?user=me&embargoed=true&page_size=1000");
  const candidates = (resp?.results ?? [])
    .map((d) => ({
      identifier: d.identifier,
      title: d.most_recent_published_version?.name ?? d.draft_version?.name ?? "",
      embargoed: d.embargo_status === "EMBARGOED",
    }))
    .filter((d) => d.title.startsWith(INCOMING_PREFIX));

  // Fail closed: a dandiset whose owner list can't be confirmed is excluded rather than shown.
  const adminOwned = await Promise.all(candidates.map((d) => hasAdminOwner(cfg, d.identifier).catch(() => false)));

  return candidates.filter((_, i) => adminOwned[i]).sort((a, b) => a.title.localeCompare(b.title));
}
