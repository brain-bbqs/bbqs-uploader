# User Test Checklist

A basic manual pass through the app before a release or after a significant change. Run through this on the deployed site, signed in with a real EMBER Archive account with access to at least one Dandiset.

## Sign-in and dataset selection

- [ ] Loading the page signed out shows the signed-out state and a working sign-in control
- [ ] Signing in redirects back to the app in a signed-in state
- With access to:
  - [ ] exactly one Dandiset, it's shown as plain text with a working archive link
  - [ ] multiple Dandisets, they appear in a dropdown and switching selection updates the page
  - [ ] no accessible Dandisets, the no-datasets-found message appears
- [ ] A dataset flagged as containing human subjects data shows the warning banner and gates the dropzone/upload button until "I confirm" is clicked
- [ ] Signing out returns to the signed-out state cleanly

## Uploading files

- [ ] Dragging and dropping a folder onto the dropzone stages its files, nested correctly in the include/exclude tree
- [ ] Using the file/folder picker button stages files the same way
- [ ] Deselecting (excluding) a file or folder in the tree removes it from what gets uploaded
- [ ] Clicking "Upload" scans staged files, then uploads them, with progress reflected in the UI
- [ ] A successful upload's files show up correctly under `sourcedata/raw/` in the actual Dandiset on EMBER Archive
- [ ] "Cancel" (single file) and "Cancel all" during scanning/uploading actually stop those operations

  Generate a throwaway 1 GB file to cancel on:

  ```python
  import numpy as np; np.save("cancel_test.npy", np.random.rand(1024**3 // 8))
  ```
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
