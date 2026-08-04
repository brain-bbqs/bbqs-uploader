# Live Testing

## Live test injections

`npm test` runs unit tests, `npm run test:integration` runs Playwright. Paste one of these into the address bar:

| URL                                     | What it should look like                                                | Try it                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `?test&num_datasets=0`                  | No-datasets-found message                                               | [Open](https://upload.brain-bbqs.org/?test&num_datasets=0)                  |
| `?test&num_datasets=1`                  | Single dataset, shown as plain text with an archive link                | [Open](https://upload.brain-bbqs.org/?test&num_datasets=1)                  |
| `?test&num_datasets=2`                  | Dropdown with 2 fake datasets                                           | [Open](https://upload.brain-bbqs.org/?test&num_datasets=2)                  |
| `?test&num_datasets=0&embargoed=false`  | Same no-datasets-found message; `embargoed` is ignored with no dataset  | [Open](https://upload.brain-bbqs.org/?test&num_datasets=0&embargoed=false)  |
| `?test&num_datasets=1&embargoed=false`  | Single dataset that isn't embargoed: error card, upload button disabled | [Open](https://upload.brain-bbqs.org/?test&num_datasets=1&embargoed=false)  |
| `?test&num_datasets=2&embargoed=false`  | Dropdown of 2 fake datasets, neither embargoed: same error card/disable | [Open](https://upload.brain-bbqs.org/?test&num_datasets=2&embargoed=false)  |
| `?test&num_datasets=1&human_subjects`   | Single dataset flagged as human subjects: warning banner, upload gated  | [Open](https://upload.brain-bbqs.org/?test&num_datasets=1&human_subjects)   |
| `?test&mock_upload=25`                  | A nested batch of 25 fake files, scanning then uploading                | [Open](https://upload.brain-bbqs.org/?test&mock_upload=25)                  |
| `?test&mock_upload=25&remote_listing=8` | Same, with 8 files faked as already on the archive (one "Changed")      | [Open](https://upload.brain-bbqs.org/?test&mock_upload=25&remote_listing=8) |
| `?test&signed_out`                      | The page as a signed-out visitor sees it, regardless of your real state | [Open](https://upload.brain-bbqs.org/?test&signed_out)                      |
| `?test&freeze_scan`                     | Every staged file hangs mid-scan once "Upload" is clicked               | [Open](https://upload.brain-bbqs.org/?test&freeze_scan)                     |

`?test` alone (without one of the above) is a no-op that never changes anything by itself.

Fake datasets use negative identifiers (e.g. `-000001`) so they're never mistaken for real ones.
Sign-in state is untouched and nothing is written to `localStorage`, so all of the above are safe to try at any time, whether or not you're actually signed in.

`num_datasets` fakes are embargoed (uploadable) by default; add `&embargoed=false` to preview the blocked state instead, on either `num_datasets=1` (single dataset text) or `num_datasets=2`+ (dropdown).

Adding `&human_subjects` to any `num_datasets` injection marks every fake dataset as containing human-subjects data (in real usage: the draft's description containing the exact phrase `CONTAINS HUMAN SUBJECTS`), so the red warning banner appears below the speed tips, and the dropzone stays hidden and the upload button disabled until "I confirm" is clicked.

`mock_upload=N` stages `N` fake files (10 MB-100 GB each) nested randomly across folders, ready for the include/exclude tree; clicking "Upload" animates the Scanning bar and then the Uploading bar.
No bytes are read, hashed, or sent anywhere.
While it's active, every file (including a genuinely dropped one) runs through the same simulated timers, so don't combine this with a real upload.

`remote_listing=N` fabricates the "already on EMBER" check instead of asking the archive: the first `N` staged files (by path) are reported as already uploaded, with the first of them at a different size so one row shows "Changed" (and stays selected for replacement) while the rest show "Uploaded" (and start deselected). `remote_listing=0` previews the nothing-uploaded-yet banner. It needs staged files to act on, so combine it with `mock_upload=N` (or a genuinely picked folder).

`signed_out` forces every auth-dependent render (the header's sign-in control, the Dataset card, upload blocking) to behave as if signed out, without ever touching `oauthTokens` or `localStorage`, so it also works while genuinely signed in.

`freeze_scan` gives every staged file a scan that never finishes once "Upload" is clicked (scanning starts at "Upload", not on drop): the "Scanning" badge, Cancel button, and 0% summary figures hold still indefinitely (a real scan of a small file finishes in milliseconds, too fast to look at or screenshot). "Cancel all" still cancels the frozen scans. The Chromatic file-queued snapshot uses this to capture the mid-scan state deterministically.

## Expected console noise when re-uploading

Re-uploading content the archive already has (routine when re-testing with the same assets) prints lines like this in the DevTools console:

```
POST https://api-dandi.emberarchive.org/api/uploads/initialize/ 409 (Conflict)
```

Nothing is wrong. The 409 is the server's dedup fast-path working as intended: a blob with the same digest already exists, so the uploader reuses it (the row reads "Replaced / matched existing content") and re-transfers zero bytes. The app catches and handles the response without logging anything itself; the console line comes from the browser, which reports every non-2xx network response and gives pages no way to suppress that (a proposal to add one, [whatwg/fetch#1815](https://github.com/whatwg/fetch/issues/1815), was declined). It also fires in real usage, not just testing: re-dropping a folder after a partial failure or closing the tab mid-batch recovers through this exact path.

Please don't "fix" the noise with a `POST /blobs/digest/` existence pre-check. That was tried and reverted: it trades the 409 (only on re-uploads) for a logged 404 on every genuinely new upload (the common case), and the check-then-initialize sequence is racy. The official dandi-cli dropped the identical pre-check for the same reason ([dandi/dandi-cli#494](https://github.com/dandi/dandi-cli/issues/494)) and instead treats the 409 as its success path. The only real fix is server-side (returning a non-4xx for the dedup case), tracked upstream in [dandi/dandi-archive#1813](https://github.com/dandi/dandi-archive/issues/1813).

To hide the lines while testing: in Chrome, tick "Hide network" in the Console panel's settings (gear icon), or use a negative filter like `-url:emberarchive.org`; in Firefox, 4xx network lines are controlled by the "Errors" filter button, and the filter box supports negation (e.g. `-409`).
