# User Test Checklist

A basic manual pass through the app before a release or after a significant change. Run through this on the deployed site (or `npm run dev`) in a real browser, signed in with a real EMBER Archive account with access to at least one dandiset.

Where noted, a `?test` URL (see [docs/README.md](./README.md)) can preview a state without needing real data or a real upload; prefer the real flow when practical and fall back to `?test` for states that are hard to reproduce (e.g. no datasets, human subjects warning, embargoed vs. not).

## Sign-in and dataset selection

- [ ] Loading the page signed out shows the signed-out state and a working sign-in control
- [ ] Signing in redirects back to the app in a signed-in state
- [ ] With access to exactly one dandiset, it's shown as plain text with a working archive link
- [ ] With access to multiple dandisets, they appear in a dropdown and switching selection updates the page
- [ ] With no accessible dandisets, the no-datasets-found message appears
- [ ] A non-embargoed dataset shows the expected error card and disables uploading
- [ ] A dataset flagged as containing human subjects data shows the warning banner and gates the dropzone/upload button until "I confirm" is clicked
- [ ] Signing out returns to the signed-out state cleanly

## Uploading files

- [ ] Dragging and dropping a folder onto the dropzone stages its files, nested correctly in the include/exclude tree
- [ ] Using the file/folder picker button stages files the same way
- [ ] Deselecting (excluding) a file or folder in the tree removes it from what gets uploaded
- [ ] Clicking "Upload" scans staged files, then uploads them, with progress reflected in the UI
- [ ] A successful upload's files show up correctly under `sourcedata/raw/` in the actual dandiset on EMBER Archive
- [ ] "Cancel" (single file) and "Cancel all" during scanning/uploading actually stop those operations
- [ ] Re-uploading a file that already exists on the archive completes without visible errors in the UI (a `409` in the DevTools console is expected, see docs/README.md)
- [ ] Re-uploading a changed file (same path, different content) is reflected correctly (row shows "Changed"/"Replaced")
- [ ] Uploading a large file (multi-GB, multipart) completes successfully

## Browsing the archive

- [ ] "Load from EMBER" opens a read-only browse of the dataset's existing `sourcedata/raw/` contents
- [ ] Browsing an empty dataset shows a "currently empty" / "nothing uploaded yet" banner
- [ ] Staging local files against a dataset with existing content shows the diff (uploaded/changed rows) correctly

## Cross-cutting

- [ ] Reloading the page mid-upload doesn't corrupt local state (localStorage) in a way that breaks the next load
- [ ] The app is usable in both light and dark OS/browser theme
- [ ] Basic responsiveness: window resized narrower doesn't break layout or hide controls
- [ ] No unexpected errors in the browser console outside of the documented `409` dedup case
- [ ] Spot-check in a second browser (e.g. Chrome and Firefox/Safari)
