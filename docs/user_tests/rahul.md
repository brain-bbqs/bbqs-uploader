# User Test Checklist

|            |        |
| ---------- | ------ |
| **Tester** | Rahul  |
| **Date**   | 9/3/26 |

A basic manual pass through the app before a release or after a significant change. Run through this on the deployed site, signed in with a real EMBER Archive account with access to at least one Dandiset.

## Sign-in and dataset selection

- [x] Loading the page signed out shows the signed-out state and a working sign-in control
- [x] Signing in redirects back to the app in a signed-in state
- With access to:
  - [ ] ~~exactly one Dandiset, it's shown as plain text with a working archive link~~
  - [x] multiple Dandisets, they appear in a dropdown and switching selection updates the page
  - [ ] ~~no accessible Dandisets, the no-datasets-found message appears~~
- [ ] A dataset flagged as containing human subjects data shows the warning banner and gates the dropzone/upload button until "I confirm" is clicked
  - ERROR: no banner showed on first page load; navigated from HEARTH and went to Inman. Showed on refresh... did not attempt to actually upload to existing labs dataset.
- [x] Signing out returns to the signed-out state cleanly

## Uploading files

- [x] Dragging and dropping a folder onto the dropzone stages its files, nested correctly in the include/exclude tree
- [x] Using the folder picker button stages files the same way
- [x] Deselecting (excluding) a file or folder in the tree removes it from what gets uploaded
- [ ] Ignoring a suffix works as expected
  - NOTE: edge case to think about - `.slp.nwb` was not ignored by `*.slp`
- [x] Clicking "Upload" scans staged files, then uploads them, with progress reflected in the UI
- [x] A successful upload's files show up correctly under `sourcedata/raw/` in the actual Dandiset on EMBER Archive
- [x] "Cancel" (single file) and "Cancel all" during scanning/uploading actually stop those operations

  If needed, generate a throwaway 1 GB file to cancel on:

  ```python
  import numpy as np; np.save("cancel_test.npy", np.random.rand(1000**3 // 8))
  ```

- [x] Re-uploading a file that already exists on the archive completes without visible errors in the UI
- [x] Re-uploading a changed file (same path, different content) is reflected correctly (row shows "Changed"/"Replaced")

If needed, generate a different 1 MB file to cancel on:

```python
import numpy as np; np.save("reupload_test.npy", np.random.rand(1000**2 // 8))
```

- [ ] Uploading the large file (multi-GB, multipart) completes successfully (eventually)
  - [ ] progress bars and `.transfer` files accurately reflect upload speed
  - NOTE: ran out of time, didn't try. 30 minute test over all 3 apps might not be able to fit that part in

## Browsing the archive

- [x] "Load from EMBER" opens a read-only browse of the dataset's existing `sourcedata/raw/` contents
- [ ] ~~Browsing an empty dataset shows a "currently empty" / "nothing uploaded yet" banner~~
  - Need to make an empty testing one
- [ ] Staging local files against a dataset with existing content shows the diff (uploaded/changed rows) correctly
  - NOTE: recommends expanding previous upload filetree

## Cross-cutting

- [ ] Reloading the page mid-upload doesn't corrupt local state (localStorage) in a way that breaks the next load
  - Did not have time to try
- [x] The app is usable in both light and dark OS/browser theme
- [x] Basic responsiveness: window resized narrower doesn't break layout or hide controls
- [ ] No unexpected errors in the browser console outside of the documented `409` dedup case
  - NOTE: A couple of extra ones too, shared over Slack [TODO: investigate]
- [x] Can navigate to all hyperlinks in the bottom-left
