# File management redesign: prototype notes

> **Status: implemented.** The design below shipped in the same PR that carried these
> prototypes. Decisions taken on the open questions at the bottom: the base folder's own name is
> stripped from destination paths (contents land directly under `sourcedata/raw/`), one base
> folder at a time, ignore patterns do not persist yet, already-uploaded files default to
> deselected, hashing starts at "Upload" for the selected files only, and "Changed" detection is
> size-only for now. One refinement over the prototypes: an empty archive listing shows no
> per-row badges at all (badging every row "New" on a fresh dataset is noise). The production
> selection model lives in `src/lib/selection.ts`, the archive listing client in
> `src/lib/remote-listing.ts`, and the UI wiring in `src/main.ts`.

Prototypes for the post-user-testing redesign of file selection. They live in
`stories/prototypes/` and render under the **Prototypes/** section of Storybook
(`npm run storybook`). All of them are story-only: everything is fake data, and the interactive
logic (`selectionTree.ts`) was a throwaway that the production version (a retained model on top
of `src/ui/fileTree.ts`) replaced.

## What changed and why

Three changes, all driven by user feedback and user tests:

1. **Base folders only.** Loose-file drag-and-drop and the "browse files"
   button are removed; the dropzone accepts exactly one thing, a folder.
2. **Include/exclude selection.** After the folder is scanned, the tree
   becomes a checkbox tree: per-file and per-folder toggles (tri-state on
   folders), plus glob-style ignore patterns editable as chips.
3. **Awareness of what is already on EMBER.** Before selection, the app lists
   what already exists under `sourcedata/raw/` in the chosen dataset and folds
   that into the tree: already-uploaded files start deselected, size
   mismatches are flagged, everything else is marked new.

## The prototypes

| Story                     | Shows                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Folder-only dropzone      | Idle, drag-over, and the rejection message when loose files are dropped                                                                   |
| Include-exclude selection | Interactive checkbox tree with editable ignore-pattern chips                                                                              |
| Remote contents check     | The `sourcedata/raw/` listing in flight, a partial-upload diff (Uploaded / Changed / New badges), and the empty-dataset case              |
| Redesigned upload card    | Everything composed: picked-folder summary row, remote banner, selection tree, and an Upload button with a live file count and byte total |

Interaction notes embodied in the prototypes:

- A picked folder collapses the dropzone into a compact summary row with a
  "Change folder" button, making "one base folder at a time" the model
  (versus today's additive multi-drop).
- Folder checkboxes are tri-state: checked, unchecked, or indeterminate when
  a subtree is partially selected. Folder sizes show "selected of total" when
  partial.
- Ignore patterns come in three shapes: `*.tmp` (filename), `scratch/`
  (any folder segment), and `sub-01/ses-*/events.csv` (full path). Ignored
  files stay visible but dimmed, with a neutral "Ignored" badge and a
  disabled checkbox; removing the chip restores their previous checked state.
- Files already on EMBER default to deselected with an "Uploaded" badge;
  re-checking one marks it "will replace". A file whose size differs from the
  archive copy gets a "Changed" badge and stays selected.
- The Upload button carries the live selection: "Upload 8 files (295 GB)",
  disabled at zero.

## Reading `sourcedata/raw/` from EMBER (implementation sketch)

Today the only remote read is `findExistingAsset()`
(`src/lib/upload-pipeline.ts`), an exact-path query used to pick POST vs PUT
per file. For the banner/diff we need a listing instead. Two candidate
endpoints on the dandi-archive API:

- `GET /dandisets/{id}/versions/draft/assets/?path=sourcedata/raw/&metadata=false&order=path&page_size=…`,
  paginated; `path` is a prefix filter, so this returns every uploaded asset
  under `sourcedata/raw/` with its `path` and `size`. Simplest, reuses
  `apiFetch`, and size is enough for the Uploaded/Changed distinction.
- `GET /dandisets/{id}/versions/draft/assets/paths/?path_prefix=…`, the
  folder-browse endpoint the archive web UI uses, returning aggregate
  file counts/sizes per folder. Better if datasets grow so large that a flat
  listing is too slow, at the cost of one request per expanded folder.

The prototype assumes the first (flat listing fetched once after dataset
choice, refreshed via "Re-check"). "Changed" is size-only for now; a
byte-identical replacement of the same length would read as "Uploaded". The
ETag checksum cache (`src/lib/checksum-cache.ts`) could later upgrade this
without re-hashing everything.

For live testing without touching the archive, a new `?test` injection in the
spirit of the existing ones (say `remote_listing=N`) could fabricate the
listing; today no injection fakes archive contents.

## Open questions

1. Should the picked base folder's own name become part of the destination
   path (today's behavior with `webkitdirectory`: `sourcedata/raw/<folder>/…`)
   or should its contents land directly under `sourcedata/raw/`? The
   prototypes assume the latter; the diff against the archive only works
   cleanly if local and remote paths line up.
2. One base folder at a time (prototype's model) or allow adding several base
   folders side by side?
3. Should ignore patterns persist per dataset (localStorage) so repeat upload
   sessions keep their exclusions?
4. Do already-uploaded files default to deselected (prototype's behavior) or
   selected-but-skipped-at-upload-time? Deselected makes the Upload button's
   count honest, but users re-uploading intentionally must re-check them.
5. When should hashing start? Today it starts on drop for everything; with
   selection in the flow it should probably start only for selected files
   (or after "Upload"), which also softens the cost of scanning a big folder
   the user intends to mostly exclude.
6. Is size-only "Changed" detection acceptable for the first iteration?
