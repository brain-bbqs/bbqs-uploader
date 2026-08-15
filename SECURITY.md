# Security notes

bbqs-uploader is a fully static, backend-free page (see `package.json`'s
description) — there is no server to hold a session, set an `httpOnly`
cookie, or otherwise keep a credential out of client-side JavaScript. Any
credential used to call the DANDI API (the pasted API key before this PR, the
OAuth access/refresh tokens since) has to live somewhere the browser's JS can
read it back out. That constraint doesn't go away; the sections below are
about managing it deliberately instead of by accident.

## The actual risk is XSS, not "clear text storage" by itself

A token sitting in `localStorage`/`sessionStorage` is only exploitable
remotely if an attacker can first get JavaScript to execute on this origin
(XSS) — at which point they could just make authenticated requests directly,
credential theft is a bonus, not the primary damage. So before treating a
"clear text storage of sensitive information" scanner alert as something to
dismiss or work around, actually check whether that precondition holds:

```
grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML" src/
```

For every hit, confirm any _dynamic_ (user-supplied, API-returned, or
otherwise non-literal) string is assigned via `.textContent` (or an
`element.value` type property) rather than concatenated into the HTML string
itself. A fixed, hardcoded template assigned via `innerHTML` is fine — the
risk is interpolating untrusted data into HTML source, not the property name.
As of this writing, all three `innerHTML` uses in `src/` (`fileRow.ts`,
`fileTree.ts`, the "What's New" modal) follow this pattern: static skeleton
via `innerHTML`, then `.textContent` for anything dynamic (file names,
dandiset titles, usernames). Keep it that way — this is the property that
makes accepting client-side token storage a reasonable call for this app.

Also keep an eye on:

- **Third-party runtime scripts are opt-in only.** `index.html` loads Google
  Analytics' `gtag.js` (see "Google Analytics" below), but only after the
  user explicitly accepts via the consent banner; nothing else loads a CDN
  `<script>` tag. A compromised third-party script is the other realistic way
  a token in storage gets exfiltrated even without a bug in this app's own
  code, so keep the list of scripts that load unconditionally at page load
  empty.
- **Minimal runtime dependencies.** Currently just `spark-md5`. Every added
  runtime dependency is something that could be compromised upstream and ship
  code that reads `localStorage`; don't add one without a reason.

## The admin-owned dandiset check calls a third party, but without our token

`src/lib/dandisets.ts`'s `listIncomingDandisets` calls a companion service
(not part of this repo, currently hosted on PythonAnywhere) to check whether
a BBQS/EMBER admin co-owns an "Incoming: " dandiset, once per candidate
dandiset on every load of the picker.

That call carries **no credentials of ours**, and it must stay that way. The
service reads the dandiset's owner list from DANDI with its own API key and
intersects it with the admin roster it holds server-side, rather than
borrowing the caller's token to do the read. So the request is a bare
unauthenticated `GET` of a public dandiset identifier, and the signed-in
user's OAuth token still only ever goes to DANDI itself.

An earlier version of this check did forward the user's live access token to
that host on every picker load, which put a credential capable of acting as
the signed-in user on a machine this repo doesn't control. Do not reintroduce
that: if the service ever needs to know something it can't resolve with its
own credentials, change the service, not the header. `tests/unit/dandisets.test.ts`
pins the absence of the `Authorization` header on this call.

What the design does concentrate is credential custody on the service side:
alongside the roster, that host now stores a long-lived DANDI API key, which
is more powerful than any single user's token, and the account behind it needs
enough read access to see the owner list of every sanctioned "Incoming: "
dandiset (embargoed ones are invisible to non-owners, so in practice that
means an archive superuser or an account co-owning them). That's a deliberate
trade of many transient user tokens transiting a third party for one stored
credential the admins own and can rotate on their own schedule. Before
pointing this at a different or newly-deployed instance of that service,
confirm it is served over HTTPS, that it does not log its API key, the roster,
or the owner lists it reads, and that the key belongs to an account whose only
job is this check.

The residual leak is small and non-identifying: because the endpoint is
unauthenticated, anyone can ask whether a given dandiset identifier is
BBQS-sanctioned. That reveals nothing about who the admins are (the whole
point of PR #65), grants no access to embargoed content, and is rate-limited
service-side.

This is also not a hard access-control boundary even when working correctly:
real upload authorization is still enforced entirely by DANDI's own dandiset
ownership permissions. The service's `adminOwned` answer only curates what
this app's picker shows; it grants no capability on its own.

## Google Analytics

`index.html` loads GA (`gtag.js`, measurement ID `G-8W96QLN0W8`) gated behind
a cookie-consent banner, copied from the pattern used by
[dandi/usage-page](https://github.com/dandi/usage-page):

- The consent choice (`'accepted'` / `'declined'` / unset) is stored in
  `localStorage` under `bbqs-uploader.analytics-consent` and re-checked on
  every page load.
- Declining (or leaving the banner unanswered) never fetches `gtag.js`, never
  sets `window.dataLayer`/`window.gtag`, and never touches a GA cookie.
  Accepting is the only path that appends the `gtag.js` `<script>` tag.
- This is not sensitive data: the stored value is a UI preference, not a
  credential, so it doesn't fall under the "clear text storage" checklist
  above.

## Handling a "clear text storage" alert on a new credential

1. Run the `innerHTML`/XSS check above. If it turns up a real
   injection point, fix _that_ — it's a bigger problem than where the token
   sits, and no storage choice below fixes it.
2. If it doesn't, decide how much persistence the credential actually needs,
   in order of decreasing exposure:
   - `localStorage` — survives browser restarts. Lowest friction, largest
     exposure window (persists until explicitly cleared or signed out).
   - `sessionStorage` — survives reloads, clears on tab close. Meaningfully
     smaller window than `localStorage`, but scanners (CodeQL included)
     generally flag this the same way — expect to still need step 3.
   - In-memory only (a plain module variable, no Storage API) — cleared on
     any reload/navigation, not just tab close. Removes the flagged sink
     entirely, at the cost of re-authenticating on every page load.
3. If you land on `localStorage` or `sessionStorage`, dismiss the resulting
   alert as an accepted, documented trade-off (link this file) rather than
   trying to "encrypt" the value client-side first — any decryption key
   reachable by this app's own JS is reachable by an attacker's injected JS
   too, so client-side encryption of a client-held secret is not a real
   mitigation, just a false sense of one.

**Precedent:** [PR #16](https://github.com/brain-bbqs/bbqs-uploader/pull/16)
proposed dropping persistence entirely for the pasted API key (in-memory /
re-enter-each-session, option 2's strictest form above) rather than dismissing
its alert. [PR #19](https://github.com/brain-bbqs/bbqs-uploader/pull/19)
replaced that key with OAuth tokens persisted in `localStorage` — decide the
same question for those tokens using the checklist above rather than assuming
the OAuth migration made #16's alert moot; it's the same sink, just renamed.

## OAuth token lifecycle (as of the PR #19 EMBER sign-in flow)

- Access tokens use `django-oauth-toolkit`'s unconfigured default lifetime
  (~10 hours on the EMBER archive, per its settings). `ensureFreshOAuth()` in
  `src/main.ts` refreshes the access token automatically (60s before expiry)
  on every connection check and upload, using the `refresh_token` — so in
  practice a signed-in user isn't prompted to re-authenticate every 10 hours,
  only when the refresh token itself is invalidated, the user explicitly
  signs out (which revokes it via `/oauth/revoke_token/`), or stored settings
  are cleared.
