import { initialsFrom } from "@brain-bbqs/utils";
import { fetchArchiveUser, type ArchiveConfig } from "@brain-bbqs/ember-client";
import type { UploaderElements } from "./elements";

/**
 * Renders the header's "who's signed in" avatar/username as soon as there's an access token,
 * independent of whether a dandiset has been selected yet.
 */
export async function renderIdentity(els: UploaderElements, cfg: ArchiveConfig): Promise<void> {
  try {
    const me = await fetchArchiveUser(cfg);
    if (me) {
      els.oauthUsername.textContent = me.username;
      els.oauthAvatar.textContent = initialsFrom(me.name ?? "");
    }
  } catch {
    /* leave the header as-is; the next connection check retries */
  }
}
