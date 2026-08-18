# Changelog

## 1.1.9

#### 🐛 Bug Fix

- The read-only "Load from EMBER" browse no longer lists the dataset's `clip-extractor/` contents, which are tool outputs rather than uploaded material; they are now skipped the same way the app's internal transfer reports already were ([#77](https://github.com/brain-bbqs/bbqs-uploader/pull/77))

## 1.1.8

#### 🐛 Bug Fix

- Fixed the Dataset card's "View on EMBER" button sticking around after signing out mid-session, still pointing at the dataset that was selected before; signing out now clears the dataset selection along with the card's message, matching what a page reload already showed ([#76](https://github.com/brain-bbqs/bbqs-uploader/pull/76))

## 1.1.7

#### 🏠 Internal

- The dataset picker's admin-owner check no longer sends your EMBER sign-in token to the companion admin-check service; that service now answers from its own DANDI credentials, so your token only ever goes to EMBER itself ([#75](https://github.com/brain-bbqs/bbqs-uploader/pull/75))

## 1.1.6

#### 🐛 Bug Fix

- Fixed the dropzone's rejection message ("Individual files can't be uploaded on their own") sitting flush against the left edge instead of centered under the drop prompt ([#74](https://github.com/brain-bbqs/bbqs-uploader/pull/74))
- The same rejection message now splits onto two lines, putting "Drop the folder that contains them instead." on its own line below the explanation ([#74](https://github.com/brain-bbqs/bbqs-uploader/pull/74))

## 1.1.5

#### 🐛 Bug Fix

- Fixed the fixed corner watermark and bottom-left footer links overlapping card content once the window is too narrow to fit them in the margins; they now flow below the page instead of floating on top of it, and the redundant BBQS watermark logo (already shown in the header) is hidden ([#73](https://github.com/brain-bbqs/bbqs-uploader/pull/73))

## 1.1.4

#### 🚀 Enhancement

- Various style and quality of life improvements.

## 1.1.2

#### 🐛 Bug Fix

- "View on EMBER" now opens the dataset's file browser scrolled to where uploads actually land, instead of the dataset root ([#70](https://github.com/brain-bbqs/bbqs-uploader/pull/70))
- Dropped mentions of the internal `sourcedata/raw` archive path from the app's tooltips and labels; it's a behind-the-scenes detail, not something users need to track ([#70](https://github.com/brain-bbqs/bbqs-uploader/pull/70))

## 1.1.1

#### 🚀 Enhancement

- Added "🐛 Report a bug" and "💡 Request a feature" links to the bottom-left footer, pointing to the repo's new GitHub issue templates; the footer now stacks "✨ What's New", "🐛 Report a bug", "💡 Request a feature", and the version/cache-clearing row on their own lines ([#68](https://github.com/brain-bbqs/bbqs-uploader/pull/68))

## 1.1.0

#### 🚀 Enhancement

- Redesigned file selection around base folders: the dropzone now accepts exactly one dataset folder (dropping loose files shows an explanation instead of silently queueing them), the folder's own name is no longer part of the destination path (its contents land directly under `sourcedata/raw/`), and a compact summary row with a "Change folder" button replaces the dropzone once a folder is picked ([#66](https://github.com/brain-bbqs/bbqs-uploader/pull/66))
- Added include/exclude selection over the staged folder: per-file checkboxes, tri-state folder checkboxes with selected-of-total size rollups, Select all/none buttons, a live "N of M files selected" summary, and glob-style ignore patterns editable as chips (`*.tmp` matches filenames, `scratch/` matches any folder segment, patterns containing `/` match the full path); the Upload button now carries the live selection, e.g. "Upload 9 files (247 GB)" ([#66](https://github.com/brain-bbqs/bbqs-uploader/pull/66))
- The app now checks what already exists under `sourcedata/raw/` in the selected dataset and folds it into the tree: already-uploaded files (same path and size) start deselected with an "Uploaded" badge (re-checking one marks it "will replace"), size mismatches are flagged "Changed" and stay selected, and the rest are marked "New"; a banner summarizes the check with a Re-check button, switching datasets re-runs it, folders whose entire contents are already uploaded start collapsed (the reveal slider re-expands them), and a "Compare with EMBER" toggle (on by default) turns the whole check off for classic staging ([#66](https://github.com/brain-bbqs/bbqs-uploader/pull/66))
- File scanning (checksumming) now starts when "Upload" is clicked, for the selected files only, instead of on drop for everything, so staging a large folder that will be mostly excluded no longer reads every byte of it up front ([#66](https://github.com/brain-bbqs/bbqs-uploader/pull/66))
- Split the upload card in two: the folder picker (dropzone, then the picked-folder summary) is its own card, with everything file-selection in a second card below it; a new "Load from EMBER" button in the Dataset card fills that second card with a read-only browse of what the dataset already holds under `sourcedata/raw/`, as a reminder of which base folder to pick ([#66](https://github.com/brain-bbqs/bbqs-uploader/pull/66))

#### 🏠 Internal

- Added component stories for the redesigned selection UI (selection tree, remote contents banner, full upload card), built on the production modules with deterministic fixtures, and design notes in `docs/file-management-redesign.md` ([#66](https://github.com/brain-bbqs/bbqs-uploader/pull/66))
- New unit suites for the selection model and the archive-listing client, integration coverage of the selection tree, the archive diff, and ignore patterns, plus a boot smoke test that runs `src/main.ts` against the real `index.html` markup (raising the coverage ratchet to statements 75, branches 65, functions 74, lines 76) ([#66](https://github.com/brain-bbqs/bbqs-uploader/pull/66))

## 1.0.8

#### 🚀 Enhancement

- Added a human-subjects compliance gate: when the selected dataset's draft description contains the phrase `CONTAINS HUMAN SUBJECTS`, a red warning banner appears below the speed tips requiring the user to confirm their data is de-identified and covered by their institution's IRB approval, with the drag-and-drop area hidden and the upload button disabled until they click "I confirm"; each dataset only needs confirming once per session ([#61](https://github.com/brain-bbqs/bbqs-uploader/pull/61))

#### 🏠 Internal

- Roughly doubled unit test coverage (statements 31% to 64%): new suites for `api.ts` (including all four `diagnoseCors` verdicts), `s3-upload.ts` (retry/backoff, abort, missing-ETag), `upload-pipeline.ts` (409 blob reuse, part mismatches, pagination), `transfer-report.ts`, `errors.ts`, the `etag-worker.ts` hash pool (round-robin, cache hits, stale-record verification, cancellation) and its worker script, plus the `elements`, `fileRow`, `connection`, `dropzone`, and `processFile` UI modules; also covered the previously untested halves of `settings.ts` and `mockUpload.ts` ([#60](https://github.com/brain-bbqs/bbqs-uploader/pull/60))
- Raised the coverage ratchet thresholds to match (statements 60, branches 57, functions 63, lines 60); `src/main.ts` remains the one uncovered file ([#60](https://github.com/brain-bbqs/bbqs-uploader/pull/60))
- Gave the 67 MB out-of-order etag oracle test an explicit 60s timeout so it cannot flake on slow CI containers ([#60](https://github.com/brain-bbqs/bbqs-uploader/pull/60))

## 1.0.6

#### 🏠 Internal

- Widened Vitest coverage to all of `src/` (was `src/lib/` only), added a `json` reporter, and set ratchet thresholds (statements 30, branches 25, functions 34, lines 30) just below current levels so a coverage regression fails locally and in CI before the Codecov upload ([#57](https://github.com/brain-bbqs/bbqs-uploader/pull/57))
- Moved the deterministic gates into their own fail-fast Lint workflow (typecheck, lint, unit tests with coverage, Codecov upload, with the upload now pointing at `coverage/lcov.info` explicitly), leaving the Test workflow with just the Playwright `integration` job, so browser runs never block the coverage upload ([#57](https://github.com/brain-bbqs/bbqs-uploader/pull/57))
- Tightened ESLint to type-aware linting: `recommended-type-checked` over `src/` and `configs/` via `projectService`, plus `no-floating-promises`, `no-misused-promises`, `no-explicit-any`, `no-unnecessary-condition`, `await-thenable`, `complexity` (max 15), and `max-depth` (max 4); fixed the violations this surfaced (unsafe `JSON.parse` typing, promise rejections without `Error` reasons, promise-returning event handlers, unnecessary type assertions/conditions, and three functions refactored below the complexity cap) ([#57](https://github.com/brain-bbqs/bbqs-uploader/pull/57))
- Added ESLint and typescript-eslint as pinned devDependencies with an `npm run lint` script ([#57](https://github.com/brain-bbqs/bbqs-uploader/pull/57))
- Converted the pre-commit `eslint` hook from an isolated mirrors-eslint environment to a local hook that runs the repo's own eslint from `node_modules`, so pre-commit and `npm run lint` share one environment; type-aware rules need the app's dependency types, which an isolated hook environment cannot see (TypeScript ignores `NODE_PATH`), and its run had pushed a wrong auto-fix. pre-commit.ci skips the hook (it cannot run `npm ci`); the `npm run lint` CI step enforces linting ([#57](https://github.com/brain-bbqs/bbqs-uploader/pull/57))
- Added optional Stryker mutation testing (`npm run test:mutation`, config at `configs/stryker.config.json`); not a CI gate since it is slow, and mutation score, not raw coverage, is the real signal of test quality ([#57](https://github.com/brain-bbqs/bbqs-uploader/pull/57))

## 1.0.5

#### 🚀 Enhancement

- Added Google Analytics (`gtag.js`), gated behind a cookie-consent banner shown on first visit; declining or leaving the banner unanswered never loads GA or sets a cookie, and the choice is stored in `localStorage` under `bbqs-uploader.analytics-consent` and re-checked on every page load ([#56](https://github.com/brain-bbqs/bbqs-uploader/pull/56))

## 1.0.4

#### 🐛 Bug Fix

- Fixed the upload progress bar's speed/time-left estimate getting skewed when "Upload" is pressed before every file has finished scanning: a few small files finishing their scan and starting to transfer while larger files are still mid-scan no longer reads as a stall in the rate tracker ([#55](https://github.com/brain-bbqs/bbqs-uploader/pull/55))
- Capped the displayed "time left" estimate at "> 12 hours" instead of showing an ever-growing hour count ([#55](https://github.com/brain-bbqs/bbqs-uploader/pull/55))

## 1.0.3

#### 🚀 Enhancement

- Added transfer speed tracking: each "Upload" batch now posts a timestamped `transfer-<timestamp>.json` report to a hidden `sourcedata/raw/.transfer/` directory, recording per-file checksum and upload throughput (in MB/s) plus a session summary, using the same checksum/upload pipeline as any other asset ([#54](https://github.com/brain-bbqs/bbqs-uploader/pull/54))
- Recorded a null checksum/upload entry in the transfer report for a file cancelled before it processed a single chunk/byte, instead of a misleadingly-omitted field; a cancellation with partial progress still records the rate achieved up to that point ([#54](https://github.com/brain-bbqs/bbqs-uploader/pull/54))
- Added `src/schemas/transfer-report.v1.schema.json`, a JSON Schema documenting the transfer report's shape as an external contract for anything reading these files back out of `sourcedata/raw/.transfer/`. Named "report" rather than "manifest": it's a per-batch performance record, not a listing of what was uploaded (DANDI's own asset listing already covers that) ([#54](https://github.com/brain-bbqs/bbqs-uploader/pull/54))
- Added a `schemaVersion` field to the transfer report schema and every generated instance, and put the schema's own major version in its filename/`$id` (`transfer-report.v1.schema.json`), so a future shape change can be told apart from older reports already sitting in the archive ([#54](https://github.com/brain-bbqs/bbqs-uploader/pull/54))

#### 🐛 Bug Fix

- Skipped uploading the transfer report when "Reset" was clicked mid-upload, instead of posting a stale, empty one from the just-cleared state ([#54](https://github.com/brain-bbqs/bbqs-uploader/pull/54))

## 1.0.2

#### 🚀 Enhancement

- Hid the dropzone card once files are queued, instead of leaving it visible above the file list alongside the progress bars ([#53](https://github.com/brain-bbqs/bbqs-uploader/pull/53))

## 1.0.1

#### 🐛 Bug Fix

- Blocked uploads to a dandiset that is not embargoed, instead of allowing direct uploads to any dandiset the user owns. The dataset picker now tracks each incoming dandiset's embargo status, showing a single error card below the dataset dropdown/name and disabling the "Upload" button (with a "not-allowed" cursor on hover and a greyed-out look) when the selected dandiset isn't embargoed, instead of surfacing the same message on every file row ([#52](https://github.com/brain-bbqs/bbqs-uploader/pull/52))
- Fixed the Dataset card's dropdown/name shrinking to a narrower column whenever the new embargo error card was also visible below it, a side effect of that section's grid using multiple auto-fit columns instead of one ([#52](https://github.com/brain-bbqs/bbqs-uploader/pull/52))

#### 🚀 Enhancement

- Moved the dandiset ID to the front of each dropdown option (e.g. `(000123) Incoming: Lab Name`) instead of trailing the title in parentheses ([#52](https://github.com/brain-bbqs/bbqs-uploader/pull/52))

## 1.0.0

#### 🚀 Enhancement

- Restyled the "View dataset" link in the Dataset card heading as a filled "View on EMBER" button, matching the archive's flame-red accent instead of a plain underlined text link ([#50](https://github.com/brain-bbqs/bbqs-uploader/pull/50))
- Renamed the footer's "Clear scan cache" button to "Clear checksum cache" (and its confirmation text to "Checksum cache cleared"), matching the digest it actually clears ([#50](https://github.com/brain-bbqs/bbqs-uploader/pull/50))
- Normalized the bottom-left footer text (version link, separator dots, "What's New", "Clear checksum cache") to a single font size and bolded it, instead of three slightly different sizes at normal weight ([#50](https://github.com/brain-bbqs/bbqs-uploader/pull/50))

#### 🏠 Internal

- Pointed the PR preview bot's posted links and the live test injection links in `docs/README.md` at the new `upload.brain-bbqs.org` custom domain instead of the old `brain-bbqs.github.io/bbqs-uploader` GitHub Pages URL, now that #49 configured a custom domain for the whole Pages site ([#50](https://github.com/brain-bbqs/bbqs-uploader/pull/50))
- Dropped the `www.` prefix from the custom domain in `public/CNAME`: `www.upload.brain-bbqs.org` doesn't resolve, only the bare `upload.brain-bbqs.org` does ([#50](https://github.com/brain-bbqs/bbqs-uploader/pull/50))

## 0.1.14

#### 🚀 Enhancement

- Added a "Request a consultation from our Tech Support Team to attempt to improve your transfer speeds" link to the speed tips card, opening a prepopulated Q&A discussion post on the [brain-bbqs GitHub Discussions](https://github.com/orgs/brain-bbqs/discussions) page ([#51](https://github.com/brain-bbqs/bbqs-uploader/pull/51))
- Moved the "1,000 Mbps is recommended for contents over 100 GB" note out of the speed tips card title and into its own subtitle line ([#51](https://github.com/brain-bbqs/bbqs-uploader/pull/51))

## 0.1.13

#### 🏠 Internal

- Documented the expected `409 (Conflict)` DevTools console lines from `POST /uploads/initialize/` when re-uploading already-archived content: the 409 is the server dedup fast-path working as intended, the browser itself logs every non-2xx response and pages cannot suppress it, and the previously tried `/blobs/digest/` pre-check stays reverted because it swapped the noise onto every genuinely new upload and was racy (the official dandi-cli dropped the same pre-check in [dandi/dandi-cli#494](https://github.com/dandi/dandi-cli/issues/494)); a server-side fix is tracked upstream in [dandi/dandi-archive#1813](https://github.com/dandi/dandi-archive/issues/1813). Notes added at the 409 handler in `upload-pipeline.ts` and in a new "Expected console noise" section of `docs/README.md`, including how to hide the lines in DevTools while testing ([#48](https://github.com/brain-bbqs/bbqs-uploader/pull/48))

#### 🐛 Bug Fix

- Hid the dropzone (drag-and-drop / browse files / browse folder) until the user is signed in, instead of letting a signed-out visitor drop files that could never actually upload ([#47](https://github.com/brain-bbqs/bbqs-uploader/pull/47))
- Hid the entire upload card (not just the dropzone) for a signed-out visitor with nothing queued, instead of leaving an empty bordered box on the page; it still reappears if a file was queued before a mid-session sign-out, showing the resulting "Blocked" row ([#47](https://github.com/brain-bbqs/bbqs-uploader/pull/47))

## 0.1.11

#### 🐛 Bug Fix

- Hitting "Cancel" no longer leaves the scanning/uploading summary bars' speed and time-left estimates climbing without bound: the rate tracker kept resampling a stalled byte count every tick once a cancelled phase stopped making progress, decaying the smoothed speed toward 0 and sending the "time left" estimate toward infinity. The summary bars now freeze in place (at whatever percentage cancellation actually landed on) instead of continuing to grow the estimate, or (for a cancellation specifically, as opposed to a real per-file error) jumping straight to 100%/"done" ([#45](https://github.com/brain-bbqs/bbqs-uploader/pull/45))

## 0.1.10

#### 🚀 Enhancement

- Added a "Reset" button to the far right of the upload bar that clears the file queue back to the empty state, cancelling any in-progress scanning or uploading first ([#44](https://github.com/brain-bbqs/bbqs-uploader/pull/44))
- Added a "Clear scan cache" button next to the version/What's New links that forgets every cached file scan digest, so the next drop of any file re-scans it from scratch ([#44](https://github.com/brain-bbqs/bbqs-uploader/pull/44))

#### 🐛 Bug Fix

- Fixed a bug where clicking "Reset" while an upload batch was still running left the rest of that batch reading from bookkeeping Reset had already cleared, surfacing a spurious "Cannot read properties of undefined (reading 'promise')" error in the console for files that were mid-queue at the time ([#44](https://github.com/brain-bbqs/bbqs-uploader/pull/44))

## 0.1.9

#### 🚀 Enhancement

- The BBQS logo in the header now links to brain-bbqs.org
- Redesigned the dropped-file tree: directory rows now trace a connector rail down to their children and drop the item-count figure, for a more compact, VS Code explorer-style layout
- The "Scanning" and "Uploading" progress bars now each get their own color (teal and indigo, respectively), mirrored in the bar title, its percentage, and a small lead-in dot, so the two phases are distinguishable at a glance instead of sharing one color at two widths; each row's own badge and mini progress bar now pick up the same coloring while that row is scanning or uploading

## 0.1.8

#### 🐛 Bug Fix

- The "Sign in with EMBER" button no longer flashes on refresh for an already-signed-in visitor; a pre-paint script in `index.html` now hides it before first paint when stored OAuth tokens are found, matching the existing theme-flash fix ([#42](https://github.com/brain-bbqs/bbqs-uploader/pull/42))
- Fixed a layout jump that the button fix above exposed: the theme toggle used to shift sideways once the signed-in avatar popped in after the sign-in button was hidden, since the header's `oauth-row` is right-aligned. The avatar's (still-empty) slot is now reserved before first paint too, alongside the button ([#42](https://github.com/brain-bbqs/bbqs-uploader/pull/42))

## 0.1.6

#### 🐛 Bug Fix

- The "Incoming dataset" dropdown now always ranks its options by ascending integer dandiset id (oldest first), instead of the archive's title order ([#39](https://github.com/brain-bbqs/bbqs-uploader/pull/39))
- Manually picking a different dataset from the "Incoming dataset" dropdown now actually persists across reloads; the dropdown's `change` handler previously only refreshed the OAuth token and "View dataset" link without saving the new selection, so a reload always reverted to whichever dataset was auto-selected the first time the list loaded ([#39](https://github.com/brain-bbqs/bbqs-uploader/pull/39))

## 0.1.5

#### 🐛 Bug Fix

- Device-specific hidden files (`.DS_Store`, `Thumbs.db`, `desktop.ini`, AppleDouble `._*` sidecar files, `$RECYCLE.BIN`, etc.) dropped or selected as part of a folder are now filtered out before upload, instead of only VCS folders like `.git` ([#38](https://github.com/brain-bbqs/bbqs-uploader/pull/38))
- `.noannex` is now also filtered out alongside `.git`, `.datalad`, and `.git-annex` ([#38](https://github.com/brain-bbqs/bbqs-uploader/pull/38))
- Python cache/tooling artifacts (`__pycache__/`, `*.pyc`, `*.pyo`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `.ipynb_checkpoints/`) dropped or selected as part of a folder are now filtered out before upload as well, since many uploaders work in Python environments ([#38](https://github.com/brain-bbqs/bbqs-uploader/pull/38))
- Dropping a folder containing an empty (0-byte) file no longer breaks the batch: planning the upload parts for such a file used to throw synchronously mid-scan, silently aborting the rest of that drop so every subsequent file, and the expand-depth slider, never appeared ([#38](https://github.com/brain-bbqs/bbqs-uploader/pull/38))

## 0.1.4

#### 🏠 Internal

- Pre-production cleanup pass: removed dead code left over from earlier iterations (the unused `VideoProbeResult` type, the never-called `HashPool.terminate()`, the test-only `directEntryCount`/`maxDirectEntries` tree helpers, the unused `ApiError.body` field and `apiFetch` `expectJson` option, and unused CSS rules for `label`s, text inputs, `button.hint`, `.help`, `.sr-only`, and `button:disabled` from the pre-OAuth form era) ([#36](https://github.com/brain-bbqs/bbqs-uploader/pull/36))
- Renamed the `localStorage`/`sessionStorage` keys from the pre-rename `dandi-mp4-uploader.*` prefix to `bbqs-uploader.*`, matching the IndexedDB name; existing visitors are signed out once and lose their stored theme choice ([#36](https://github.com/brain-bbqs/bbqs-uploader/pull/36))
- Linting and formatting now run exclusively through pre-commit in isolated environments: added an eslint hook (`mirrors-eslint`, typescript-eslint recommended, config at `configs/eslint.config.cjs`), and removed the broken `lint` script, the `format`/`format:check` scripts, and the eslint/prettier devDependencies; pre-commit.ci enforces the hooks on PRs ([#36](https://github.com/brain-bbqs/bbqs-uploader/pull/36))
- Deduplicated repeated logic: one shared bounded-concurrency `runQueue` (previously implemented separately in `main.ts` and the part-upload pool), one shared scaffold for real/mock hashing setup, `yieldToMain` defined once, mock-animation helpers moved next to the other mock-upload code, one shared Playwright config base, and shared integration-test helpers for dropping files, seeding the theme, and mocking the upload API ([#36](https://github.com/brain-bbqs/bbqs-uploader/pull/36))
- Bumped the pre-commit prettier hook from 3.1.0 to 3.9.5, extended typecheck to cover the Chromatic and Storybook configs, and ignored `storybook-static/` ([#36](https://github.com/brain-bbqs/bbqs-uploader/pull/36))

## 0.1.2

#### 🚀 Enhancement

- Added a "Recommendations for optimal transfer speed" box below the subtitle (SSD storage, wired Ethernet, Fiber internet, and a link to check baseline upload speed) ([#34](https://github.com/brain-bbqs/bbqs-uploader/pull/34))

## 0.1.1

#### 🚀 Enhancement

- The dropzone prompt now ends with explicit "files" and "folder" browse links: clicking "folder" opens the browser's folder picker (recursive, same as dragging a folder onto the box), while "files" and clicks anywhere else on the box open the plain file picker as before. Folders no longer have to be dragged in to be selected ([#33](https://github.com/brain-bbqs/bbqs-uploader/pull/33))

## 0.0.20

#### 🚀 Enhancement

- Redesigned the summary progress readout from tqdm-style text (`42% (1.4 GB / 3.4 GB) [01:23<02:45, 15 MB/s]`) into labeled stat chips: each phase now shows a headline percentage above a full-width bar, with captioned Scanned/Uploaded, Speed, Time left, and Files figures beneath it, set in the app font (with tabular numerals) instead of monospace ([#30](https://github.com/brain-bbqs/bbqs-uploader/pull/30))
- Time-left estimates now read in plain words ("~3 minutes", "a few seconds") and round more coarsely as they grow, and the Speed figure is smoothed with a ~3s exponential moving average instead of the lifetime average, so both track current throughput without flickering; the Time left chip additionally shows "estimating…" during a phase's first 30 seconds of activity (counted from that phase's own first byte of progress), since instant checksum-cache hits at the start of a scan otherwise skew the early estimate far too low ([#30](https://github.com/brain-bbqs/bbqs-uploader/pull/30))
- The summary bars now carry `role="progressbar"` with live `aria-valuenow`, so overall progress is announced to screen readers ([#30](https://github.com/brain-bbqs/bbqs-uploader/pull/30))

#### 🐛 Bug Fix

- The fixed footer bar at the bottom of the viewport no longer swallows clicks aimed at page content behind its empty middle stretch (such as the upload bar's Upload/Cancel buttons once the file card grows tall enough to reach it); pointer events now pass through everywhere except over the bar's actual links and logo ([#30](https://github.com/brain-bbqs/bbqs-uploader/pull/30))

## 0.0.19

#### 🚀 Enhancement

- Centered the "BBQS Uploader" title in the header, flanked symmetrically by the BBQS logo and the sign-in controls ([#28](https://github.com/brain-bbqs/bbqs-uploader/pull/28))
- Matched the signed-in avatar circle's size to the circular BBQS header logo (both 3rem) ([#28](https://github.com/brain-bbqs/bbqs-uploader/pull/28))
- Restyled the "Scanning"/"Uploading" progress bar titles to match the file-name text at the left of the per-file progress rows (normal case, regular text color) instead of uppercase muted labels ([#28](https://github.com/brain-bbqs/bbqs-uploader/pull/28))
- Moved each phase's "done/total files" count out of the byte-level stats line beside its bar; both the Scanning and Uploading bars now have their own simple bold file counter below and to the right of the bar, in the style of the footer's original count (which the Uploading counter replaces) ([#28](https://github.com/brain-bbqs/bbqs-uploader/pull/28))
- Added a "Show more" button at the bottom of the What's New modal that renders the entire rest of the changelog ([#28](https://github.com/brain-bbqs/bbqs-uploader/pull/28))
- Moved the "View dataset ↗" link from the file-drop card's upload bar into the Dataset card's heading, and dropped the single-dataset view's redundant "View in archive ↗" link pointing at the same page ([#28](https://github.com/brain-bbqs/bbqs-uploader/pull/28))
- Added a light/dark mode toggle next to the sign-in button that overrides the OS preference and persists across visits ([#28](https://github.com/brain-bbqs/bbqs-uploader/pull/28))

## 0.0.18

#### 🐛 Bug Fix

- Files whose destination path already holds an asset are no longer silently skipped on a pure path match (which ignored content, so a changed local file never updated its stale asset); they now upload normally and replace the existing asset, with content dedup left to the server's blob digest check so unchanged bytes are still never re-transferred. Rows finish as "Replaced" (with "content updated" or "matched existing content") instead of "Skipped", and the progress footer counts replaced files ([#27](https://github.com/brain-bbqs/bbqs-uploader/pull/27))

## 0.0.17

#### 🚀 Enhancement

- Added a persistent per-part checksum cache (IndexedDB): part digests are written through as hashing completes, so re-dropping an unchanged file (across page reloads or after a cancelled/interrupted scan) resumes from its already-hashed parts instead of re-hashing from scratch. Files are keyed by relative path + name + size + mtime (the strongest identity a browser exposes); since that is a heuristic, a fully cached file re-hashes one randomly chosen part and compares it against the cached digest before its etag is trusted, discarding the record and re-hashing everything on mismatch. Records are evicted least-recently-used past a ~10MB budget ([#26](https://github.com/brain-bbqs/bbqs-uploader/pull/26))

## 0.0.16

#### 🚀 Enhancement

- Parallelized checksum hashing across the parts of a single large file: the per-file "one worker hashes all of a file's parts sequentially" lanes were replaced by a shared pool of part-hashing workers (one per CPU core, up to 8) fed by a queue of individual parts drained round-robin across all files being hashed, so a lone multi-part file now uses every core instead of one, and a newly dropped file gets serviced as soon as any worker frees up instead of waiting behind another file's remaining parts ([#25](https://github.com/brain-bbqs/bbqs-uploader/pull/25))
- Made checksum hashing cancellable: "Cancel all" now also aborts in-progress and queued hashing (mid-part, at 16MB chunk granularity) and is offered while files are still scanning, with cancelled rows marked "Cancelled" ([#25](https://github.com/brain-bbqs/bbqs-uploader/pull/25))

## 0.0.15

#### 🚀 Enhancement

- Reworked the file tree's slider from a per-folder "auto-expand folders up to N entries" threshold into a continuous "show N files" reveal: at position N exactly N file rows are visible in total across the whole tree, handed out one at a time round-robin across directories in breadth-first order so no single large folder can hog the slots; folder rows are always shown, and every folder still holding hidden files gets a "… N more files" placeholder row instead of being cut off silently ([#24](https://github.com/brain-bbqs/bbqs-uploader/pull/24))
- Restyled the reveal slider as a ruler: minor tick marks every 5% of the track with labeled major ticks at each quarter of the file count (replacing the browser-dependent `<datalist>` dots), and an "N files" value bubble that rides along with the slider thumb instead of a static readout beside it; the track is also wider now (220px, up from 90px) ([#24](https://github.com/brain-bbqs/bbqs-uploader/pull/24))

## 0.0.14

#### 🚀 Enhancement

- Made the signed-in avatar icon about a third larger ([#23](https://github.com/brain-bbqs/bbqs-uploader/pull/23))
- Reworded the upload progress footer count from "X/Y files" to "X/Y files done", and added a separate "done/total files" counter to each of the Scanning and Uploading progress bars individually ([#23](https://github.com/brain-bbqs/bbqs-uploader/pull/23))

#### 🐛 Bug Fix

- Fixed the file tree failing to render and the expand-depth slider becoming unresponsive when dropping a large folder, by yielding to the browser periodically while building the tree/queueing files, coalescing hash-progress UI updates to once per animation frame, and debouncing the slider's full-tree traversal ([#23](https://github.com/brain-bbqs/bbqs-uploader/pull/23))
- Changed the tree's expand slider to judge each folder by its own direct entry count (files and subfolders held directly inside it) rather than its full recursive subtree size; a single dominant aggregator folder no longer acts as an all-or-nothing gate where nothing below it shows until the slider clears it and then everything does at once, since dominant folders typically hold only a handful of direct subfolders even when their full subtree is huge ([#23](https://github.com/brain-bbqs/bbqs-uploader/pull/23))

## 0.0.13

#### 🚀 Enhancement

- Replaced the dropzone's single page icon with three icons (video camera, microscope, paper) to better represent the range of research contents that can be uploaded ([#22](https://github.com/brain-bbqs/bbqs-uploader/pull/22))

## 0.0.12

#### 🚀 Enhancement

- Simplified the "Dataset" and file-drop cards: dropped the numbered "1 ·"/"2 ·" section titles and the "Files" heading, since the cards are self-explanatory ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))
- When the signed-in user has only one incoming dataset, it's now shown as "Uploading directly to EMBER Dandiset `000xyz`, "Incoming: ..."" (the identifier in a code style) with a link out to its archive view, instead of a disabled single-option dropdown ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))
- Removed the connection status dot and its hover text next to the dataset picker, since the picker's own states already communicate sign-in and loading status ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))
- Renamed the app to "BBQS Uploader" with the BBQS logo in the header, and added a subtitle ("Your direct upload link to the EMBER-DANDI Archive") flanked by a doubled-size EMBER logo on both sides ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))
- Reworded the no-datasets-found message to "You have not been added to any direct-upload datasets; please reach out to EMBER/BBQS admins to request this." ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))
- Replaced the dropzone's arrow icon with a page icon, and removed the "or select a folder" link underneath it; folders can still be uploaded by dragging them onto the box ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))
- The dataset picker's status messages (signed out, loading, no datasets, error) are now shown as plain text instead of a disabled dropdown option ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))
- Cropped the BBQS header logo to a circle and made it 25% larger ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))
- Tightened up copy: added periods to the dropzone prompt and the sign-in message ([#20](https://github.com/brain-bbqs/bbqs-uploader/pull/20))

## 0.0.11

#### 🚀 Enhancement

- Replaced pasting a DANDI API key with a "Sign in with EMBER" button, top-right in the header (mirroring the main archive's layout), that authenticates via the archive's OAuth2 (Authorization Code + PKCE) flow ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))
- Replaced the free-text Dandiset ID field with a dropdown that auto-populates with the signed-in user's own dandisets titled "Incoming: ..." (the BBQS convention for a lab's staging dataset), so there's nothing to type or look up ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))
- Colored the "Sign in with EMBER" button in the archive's flame red (matched from the logo mark) instead of the app's generic accent color ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))
- Added a colored initials avatar (e.g. "CB") next to the username once signed in, matching the main archive's own convention, so there's a clearer signal of being signed in than just the button disappearing ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))
- The signed-in header now shows just the avatar; the username and "Sign out" only appear in a hover popover beneath it, matching the main archive's own avatar-menu behavior ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))
- Reworded the avatar popover to match the main archive's own wording ("You are logged in as **{username}**.") and outlined the avatar in flame red instead of filling it, and added a logout icon next to "Sign out" ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))
- Shortened the "Incoming dataset" label to just "Dataset", and the dropdown now greys out (disabled) when there's only one dataset to pick, since there's nothing to choose between ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))

#### 🐛 Bug Fix

- The signed-in username/avatar in the header now appears as soon as sign-in succeeds, instead of being gated behind having an "Incoming: " dataset available to select ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))
- The OAuth redirect URI is now computed from wherever the page is actually being served (production root, a PR preview, local dev) instead of a hardcoded production URL, so sign-in can work from any of those locations once registered on the archive side ([#19](https://github.com/brain-bbqs/bbqs-uploader/pull/19))

## 0.0.10

#### 🚀 Enhancement

- Added a "What's New" link next to the version tag that opens a modal showing the rendered CHANGELOG.md content for the latest 3 versions ([#18](https://github.com/brain-bbqs/bbqs-uploader/pull/18))

## 0.0.9

#### 🚀 Enhancement

- Added recursive folder drag-and-drop (and a "select a folder" click-to-browse alternative), walking the full directory tree and uploading every file, not just `.mp4`s, under `sourcedata/raw/<same relative path>` in the dandiset ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- `.git`, `.datalad`, and `.git-annex` folders (and any files inside them) are automatically skipped when uploading a dropped or selected folder ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- The file list now groups dropped files by folder, collapsing any folder with more than 30 files/subfolders into a single expandable row instead of listing every entry ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Reworded the dropzone copy to "Drop your research contents here" instead of "files or folders" ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Replaced the per-file "Start upload"/"Remove" confirmation and "Replace/Skip" existing-asset prompt with a single "Upload N files" button above the file list; files with a path collision are now skipped automatically instead of prompting ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Simplified each file row to a single compact line (badge, name, size, and a right-aligned progress bar/status) and added a static `sourcedata/raw` heading above the tree, removing the per-file editable archive-path box and idle "Ready to upload." text, though the full destination path is still available as a hover tooltip on each row ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Dropped the "Queued" badge (a file being in the list already implies it's queued) and shrank the file tree's rows, borders, spacing, and badges considerably so a handful of folders no longer fills the whole page ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Added a rotating chevron to each folder row so expanded/collapsed state is visible at a glance, and replaced the folder emoji with a trailing `/` on folder names for a more compact look ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Folder rows now show the total size of their contents (e.g. "9 items · 47 MB"), summed recursively across all nested files, styled a bit lighter than the item count for clarity ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Moved the dandi-etag checksum computation into a pool of Web Workers (one per available CPU core, up to 8), so hashing multiple concurrently-uploading files actually uses multiple CPU cores instead of interleaving on the single JS main thread; workers are spawned lazily on first upload, not at page load ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Added an "Expand depth" slider next to the `sourcedata/raw/` heading; only the first two levels of nesting expand by default (folders with more than 30 entries still start collapsed regardless), and dragging the slider re-expands/collapses the whole tree to any depth on the fly. The slider's range is capped to the actual depth of the dropped tree (no further than the deepest folder) and snaps to tick marks, one per level ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Added a cumulative progress tracker above the file list, visible as soon as files are added: separate "Scanning" and "Uploading" progress bars (tqdm-style, each showing bytes done/total, elapsed<ETA, and throughput, e.g. `62% (620 MB / 1.0 GB) [00:12<00:07, 51.7 MB/s]`, styled in a monospace font with the percentage in accent color) plus a three-column footer (done/error/cancelled counts on the left, skipped in the middle, an `N/M files` counter on the right). It covers everything added this session across multiple "Upload" rounds, not just the most recent batch. Each bar's elapsed/rate timer starts independently (scanning from the first file dropped, uploading only once the first byte actually starts transferring), so early rates aren't skewed by idle time ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Scanning (checksumming) now starts the moment a file is dropped or selected, instead of waiting for the "Upload" click; by the time you hit Upload, most files' checksums are already computed ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Replaced the per-file "view in archive"/"download" links on completion with a single "View dataset ↗" link (next to the Upload button) pointing at the dandiset itself; the per-file download link was removed entirely since a direct asset download link isn't meaningful here ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))
- Moved each file row's status badge to sit next to its progress bar (was on the far left, is now on the right, closer to the path/status text it reflects) ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))

#### 🐛 Bug Fix

- Removed the MP4 structure/decodability check, which ran a probe against a single shared hidden `<video>` element and could get many concurrently-dropped files stuck on "Checking" ([#17](https://github.com/brain-bbqs/bbqs-uploader/pull/17))

## 0.0.8

#### 🐛 Bug Fix

- Tightened the bottom-left version link flush to the page corner and restyled the Center for Open Neuroscience logo as a large, faint watermark in the bottom-right corner, matching the footer treatment on the stamped-checklist site ([#10](https://github.com/brain-bbqs/bbqs-uploader/pull/10))

## 0.0.7

#### 🚀 Enhancement

- Added a short message next to the status dot explaining the problem when the connection check fails, matching what was previously only in the hover tooltip ([#13](https://github.com/brain-bbqs/bbqs-uploader/pull/13))
- Dropped the leftover ".mp4 files" mention from the successful connection message, since the dropzone copy no longer mentions a specific file type ([#13](https://github.com/brain-bbqs/bbqs-uploader/pull/13))

## 0.0.6

#### 🚀 Enhancement

- Replaced the connection status bar with a small status dot next to the Dandiset ID field ([#13](https://github.com/brain-bbqs/bbqs-uploader/pull/13))
- Removed the "Destination folder" connection setting and the DANDI instance selector; the uploader now always connects to the EMBER-DANDI archive ([#13](https://github.com/brain-bbqs/bbqs-uploader/pull/13))

## 0.0.5

#### 🚀 Enhancement

- Updated the drag-and-drop dropzone copy to reference "research files" instead of `.mp4` files, and made the sentence's styling consistent (no partial bolding) ([#13](https://github.com/brain-bbqs/bbqs-uploader/pull/13))
- Removed the "Remember settings in this browser" checkbox; connection settings (including the API key) are now always persisted to `localStorage` ([#13](https://github.com/brain-bbqs/bbqs-uploader/pull/13))
- Replaced the "Save & test connection" button with an automatic connection check that runs whenever a connection field changes, shown via a colored status bar instead of a button/status paragraph ([#13](https://github.com/brain-bbqs/bbqs-uploader/pull/13))

## 0.0.4

#### 🏠 Internal

- Bumped `vitest` from `2.1.9` to `4.1.10` and resolved merge conflicts against `main` ([#11](https://github.com/brain-bbqs/bbqs-uploader/pull/11))
- Pinned the footer version indicator to a static placeholder (via a new `CHROMATIC_STATIC_VERSION` env var) when building Storybook and the Chromatic Playwright snapshots, so routine `package.json` version bumps no longer retrigger unrelated Chromatic diffs ([#11](https://github.com/brain-bbqs/bbqs-uploader/pull/11))
- Set up Codecov: unit tests now run with coverage in CI and upload results via `codecov/codecov-action`, added an `lcov` reporter to the Vitest coverage config, and ignored the local `coverage/` output directory ([#12](https://github.com/brain-bbqs/bbqs-uploader/pull/12))

## 0.0.2

#### 🏠 Internal

- Added `pre-commit` with `prettier`, `codespell`, and REUSE license-compliance hooks; added `configs/prettier.config.cjs`, `format`/`format:check` npm scripts, `LICENSES/MIT.txt`, a root `LICENSE` file, and `REUSE.toml` to bring the repository into REUSE compliance; reformatted the codebase with Prettier ([#4](https://github.com/brain-bbqs/bbqs-uploader/pull/4))
- Moved `.codespellrc` into `configs/` alongside the other tool configs ([#4](https://github.com/brain-bbqs/bbqs-uploader/pull/4))

## 0.0.1

#### 🚀 Enhancement

- Added a fully static, backend-free web app for uploading `.mp4` files to an existing dandiset on the DANDI Archive: drag-and-drop UI, a faithful JS port of the DANDI ETag checksum algorithm, resumable multipart S3 uploads with retry handling, MP4 structure/decodability validation, and GitHub Pages deployment ([#1](https://github.com/brain-bbqs/bbqs-uploader/pull/1))

#### 🏠 Internal

- Added Storybook component documentation and Chromatic visual regression testing, plus corresponding GitHub Actions workflows ([#3](https://github.com/brain-bbqs/bbqs-uploader/pull/3))
- Refactored from a single vanilla-JS `app.js` into a TypeScript + Vite project with a modular `src/lib`/`src/ui` architecture, added Vitest unit tests and Playwright integration tests, and introduced CI workflows for testing and deployment ([#2](https://github.com/brain-bbqs/bbqs-uploader/pull/2))
