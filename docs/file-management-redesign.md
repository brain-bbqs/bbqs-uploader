# File management redesign

How file selection works since the post-user-testing redesign (PR #66), and why.

## The flow

1. **One base folder.** The dropzone lives in its own card and accepts exactly one dataset
   folder (drag or picker); loose files are rejected with an explanation. The folder's own name
   is kept as the base path segment: its contents land under `sourcedata/raw/<folder>/` (changed
   in PR #78; before that the name was stripped), and a compact summary row
   ("folder, N files, X GB, Change folder") replaces the dropzone once picked. Everything
   file-selection (banner, tree, upload controls) is a second card below it, which also hosts
   the read-only "Load from EMBER" browse of existing archive contents (a button in the Dataset
   card), useful for remembering which base folder to pick before staging anything.
2. **Archive check.** The app lists what already exists under `sourcedata/raw/` in the selected
   dataset's draft (`src/lib/remote-listing.ts`, a paginated prefix query on the assets
   endpoint) and folds it into the tree: same path and size shows "Uploaded" and starts
   deselected (re-checking it means "will replace"), a size mismatch shows "Changed" and stays
   selected, everything else shows "New". Folders whose entire contents are already uploaded
   start collapsed; moving the reveal slider re-expands everything. An empty listing shows no
   badges at all; a failed check degrades to a warning banner and treats everything as new.
   Switching datasets or clicking "Re-check" re-runs it, and the "Compare with EMBER" toggle
   next to the destination path (on by default) turns the check off entirely.
3. **Include/exclude selection.** Per-file checkboxes, tri-state folder checkboxes with
   selected-of-total size rollups, Select all/none, and ignore patterns as chips. Pattern
   shapes: `*.tmp` matches filenames, `scratch/` matches any folder segment, anything containing
   `/` matches the full relative path. The Upload button carries the live selection
   ("Upload 9 files (247 GB)").
4. **Upload.** Hashing starts at "Upload", for the selected files only; the batch leaves the
   selectable pool, and deselected leftovers can be selected and uploaded in a later batch.

## Where things live

- `src/lib/selection.ts` — the retained selection model (checkboxes, patterns, remote diff);
  pure state, unit-tested.
- `src/lib/remote-listing.ts` — the `sourcedata/raw/` listing client.
- `src/main.ts` — all DOM wiring; boot-tested by `tests/unit/main.smoke.test.ts`.
- Stories under **Components/** (Dropzone, Selection tree, Remote contents banner, Upload card)
  exercise the same modules with deterministic fixtures (`stories/fixtures.ts`).
- Live demo without an account: `?test&mock_upload=25&remote_listing=8` (see `docs/README.md`).

## Decisions and deferred ideas

Decided during the redesign: one base folder at a time, already-uploaded files default
deselected, size-only "Changed" detection. The redesign originally stripped the base folder name
from destination paths; that was reversed later (the picked folder's name is now the base path
segment under `sourcedata/raw/`, so the archive diff lines up when the same folder is re-picked
by name).

Deferred: persisting ignore patterns per dataset, multiple base folders side by side, and
checksum-based change detection (the ETag cache in `src/lib/checksum-cache.ts` could catch
same-size content changes without a full re-hash).
