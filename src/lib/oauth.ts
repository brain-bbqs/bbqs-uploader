import { createOAuthClient, type OAuthClient } from "@brain-bbqs/ember-client";

// Registered as a public (PKCE, no client secret) OAuth2 application on the EMBER archive. The
// redirect URI itself is computed at runtime from wherever the app is actually being served
// rather than hardcoded, since PR previews and local dev live at different paths than the
// production root; each one still has to be added as a valid redirect URI on the archive side (or
// covered by a wildcard) for sign-in to work from that specific location.
export const OAUTH_CLIENT_ID = "KoQNdyPaJULkfRJXa9YSm6PTC29TLzEz8yZH3vNv";

// sessionStorage key the pending login's PKCE verifier and state wait under between the redirect
// out to the archive and the redirect back. Changing it strands any sign-in in flight across a
// deploy.
export const OAUTH_PKCE_STORAGE_KEY = "bbqs-uploader.oauth-pkce.v1";

export const { startLogin, handleRedirectCallback, ensureFreshToken, revokeToken }: OAuthClient = createOAuthClient({
  clientId: OAUTH_CLIENT_ID,
  storageKey: OAUTH_PKCE_STORAGE_KEY,
});
