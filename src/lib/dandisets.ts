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
 * A small companion service (not part of this repo) that holds the real BBQS/EMBER admin roster
 * server-side and answers only "yes/no" per dandiset, so the roster itself never ships to the
 * browser. See https://github.com/brain-bbqs/bbqs-uploader/pull/65 for context on why this
 * replaced an earlier client-side, hashed-username approach: hashing a small, semi-public
 * username space doesn't actually keep it confidential, only a server-side check does.
 */
const ADMIN_CHECK_BASE_URL = "https://uploader-codycbakerphd.pythonanywhere.com";

interface AdminOwnedResponse {
  adminOwned: boolean;
}

/**
 * Whether a BBQS/EMBER admin is a listed owner of the given dandiset, per the admin-check service.
 *
 * Deliberately unauthenticated: the service resolves ownership with its own DANDI credentials, so
 * the signed-in user's access token never leaves DANDI and this origin. Don't add an `Authorization`
 * header here without re-reading SECURITY.md — forwarding a live token to a host this repo doesn't
 * control is the exact trade this call was rewritten to avoid.
 */
async function hasAdminOwner(identifier: string): Promise<boolean> {
  const resp = await fetch(`${ADMIN_CHECK_BASE_URL}/admin-owned/${identifier}`);
  if (!resp.ok) {
    throw new Error(`GET /admin-owned/${identifier} failed with HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as AdminOwnedResponse;
  return body.adminOwned === true;
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
  const adminOwned = await Promise.all(candidates.map((d) => hasAdminOwner(d.identifier).catch(() => false)));

  return candidates.filter((_, i) => adminOwned[i]).sort((a, b) => a.title.localeCompare(b.title));
}
