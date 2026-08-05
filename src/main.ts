import "./style.css";
import { getElements } from "./ui/elements";
import { initDropzone, type AcceptedFolder } from "./ui/dropzone";
import { queueFileRow, uploadFile, type UploadOutcome, type HashJob } from "./ui/processFile";
import { createSelectionModel, type SelectionFile } from "./lib/selection";
import { listRemoteFiles } from "./lib/remote-listing";
import { humanSize, friendlyEta, bytesPerSecToMBps } from "./lib/format";
import {
  uploadTransferReport,
  TRANSFER_REPORT_SCHEMA_VERSION,
  type TransferReport,
  type FileTransferStats,
} from "./lib/transfer-report";
import { renderIdentity } from "./ui/connection";
import { renderFileTree, setRevealCount, yieldToMain, DEFAULT_REVEAL_COUNT, type DirRowEls } from "./ui/fileTree";
import { createHashPool } from "./lib/etag-worker";
import { openChecksumCache, checksumCacheKey } from "./lib/checksum-cache";
import { planParts } from "./lib/etag";
import { runQueue } from "./lib/queue";
import { loadStoredSettings, saveStoredSettings, resolveConfig, saveStoredTheme } from "./lib/settings";
import { startLogin, handleRedirectCallback, ensureFreshToken, revokeToken } from "./lib/oauth";
import { listIncomingDandisets, type IncomingDandiset } from "./lib/dandisets";
import { containsHumanSubjects, fetchDraftMetadata } from "./lib/humanSubjects";
import { generateMockDroppedFiles, mockPhaseDurationMs, simulateProgress } from "./lib/mockUpload";
import type { FilePart, UploaderConfig, OAuthTokenSet } from "./lib/types";
import type { FileRow } from "./ui/fileRow";
import { renderChangelogHtml, countChangelogVersions } from "./lib/changelog";
import changelog from "../CHANGELOG.md?raw";

declare const __APP_VERSION__: string;

// Hashing runs on a pool of FILE_CONCURRENCY generic part-hashing workers (real OS threads), one
// per CPU-core "lane". Every file's parts feed the same pool, so a lone large file fans out
// across all cores instead of serializing on one worker, while the worker count stays bounded no
// matter how many files are in flight. Workers are spawned lazily, not eagerly at page load.
const FILE_CONCURRENCY = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8));
// Part digests persist in IndexedDB across reloads and re-drops, so re-adding an unchanged file
// skips re-hashing it (stores only file names/paths and MD5 digests — see SECURITY.md).
const checksumCache = openChecksumCache();
const hashPool = createHashPool(FILE_CONCURRENCY, checksumCache);

const els = getElements();
const activeUploads = new Set<AbortController>();
const activeHashes = new Set<AbortController>();
// Which of the added files are included for upload (checkboxes, ignore patterns, and the diff
// against what's already on the archive). "Upload" consumes the currently selected files as a
// batch; anything left deselected can still be selected and uploaded in a later batch.
const selection = createSelectionModel();
const rowByFile = new Map<File, FileRow>();
// Each rendered folder row's checkbox + size label, for tri-state/rollup refreshes.
const dirEls = new Map<string, DirRowEls>();
// Files added to the tree this session (drives the reveal slider's range); distinct from
// totalFiles below, which only counts files handed to an upload batch and feeds the progress
// summary now that hashing starts at "Upload" rather than on drop.
let addedFiles = 0;
let uploadBatchActive = false;
// Counts files past their own hash job (i.e. actually transferring bytes right now), as opposed
// to `uploadBatchActive`, which is true for the whole batch from the moment "Upload" is clicked.
// A batch can have plenty of large files still mid-scan while only a couple of small ones have
// started transferring; using the batch-wide flag as the rate tracker's "is anything active"
// signal would treat that lull as real (near-zero) throughput and decay the ETA toward
// nonsense instead of freezing it the way a genuine stall does (see `stopped` in renderPhaseBar).
let activeUploadTransfers = 0;
// Set once at startup by "?test&mock_upload=N" (see readTestMockUploadCount()); while true, every
// file — mock or genuinely dropped — is scanned/uploaded by the simulated timers below instead of
// the real hash pool and network, since this mode exists purely to showcase the UI. Not meant to
// be combined with a real upload.
let mockMode = false;

// "Cancel all" is offered whenever there's background work to stop: an upload batch in progress,
// or files still hashing.
function updateCancelAllVisibility(): void {
  els.cancelAllBtn.hidden = !uploadBatchActive && activeHashes.size === 0;
}

// Hashing starts when "Upload" is clicked, for the selected files only — scanning a large folder
// the user intends to mostly exclude shouldn't cost hours of disk reads up front.
const hashJobs = new Map<File, HashJob>();

// Per-file checksum/upload timing, snapshotted into a transfer-<timestamp>.json report asset
// (see uploadTransferReport) after each "Upload" batch finishes. Persists across multiple Upload
// clicks in the same session, same as the cumulative byte counters below.
const fileStats = new Map<File, FileTransferStats>();
let sessionStartedAt: string | null = null;

// Shared scaffolding for the real and mock hashing paths: the "Scanning" badge, cancel
// bookkeeping, and settle handling around whatever `start` actually runs.
function registerHashJob(
  file: File,
  row: FileRow,
  parts: FilePart[],
  start: (signal: AbortSignal) => Promise<string>,
): HashJob {
  ensureTicker();
  row.setBadge("Scanning", "scan");
  const abort = new AbortController();
  activeHashes.add(abort);
  updateCancelAllVisibility();
  const checksumStarted = performance.now();
  const checksumStartedAtIso = new Date().toISOString();
  const promise = start(abort.signal);
  promise
    .then(() => {
      // Skip bookkeeping for a file resetUploader() already forgot about (Reset clicked mid-scan).
      if (!hashJobs.has(file)) return;
      hashedFiles++;
      reportHashBytes(file, file.size);
      row.hideBadge();
      const stats = fileStats.get(file);
      if (stats) {
        const durationSec = (performance.now() - checksumStarted) / 1000;
        stats.checksum = {
          startedAt: checksumStartedAtIso,
          completedAt: new Date().toISOString(),
          MBps: durationSec > 0 ? bytesPerSecToMBps(file.size / durationSec) : 0,
        };
      }
    })
    .catch((e: unknown) => {
      // Surfaced again (and handled) once uploadFile awaits this same promise; a cancelled scan
      // keeps its badge so the row doesn't silently look untouched. Its bytes are deliberately
      // left uncredited (unlike the success path above): crediting them would jump the summary
      // bar straight to "done" instead of freezing where the cancel actually landed. See
      // renderPhaseBar's `stopped` handling for how the rate/ETA still stop climbing once nothing
      // is left in flight.
      if (e instanceof DOMException && e.name === "AbortError") {
        row.setBadge("Cancelled", "warn");
      } else {
        row.hideBadge();
      }
      // The report's checksum field stays null (its initial value) when not a single chunk was
      // hashed before settling; a partial scan still records the rate it managed up to that point.
      const stats = fileStats.get(file);
      const bytesDone = lastHashBytes.get(file) ?? 0;
      if (stats && bytesDone > 0) {
        const durationSec = (performance.now() - checksumStarted) / 1000;
        stats.checksum = {
          startedAt: checksumStartedAtIso,
          completedAt: new Date().toISOString(),
          MBps: durationSec > 0 ? bytesPerSecToMBps(bytesDone / durationSec) : 0,
        };
      }
    })
    .finally(() => {
      row.setProgress(0);
      activeHashes.delete(abort);
      updateCancelAllVisibility();
    });
  const job: HashJob = { parts, promise };
  hashJobs.set(file, job);
  return job;
}

// Debug-only escape hatch that pins every scan at its just-started state: "?test&freeze_scan"
// hands each dropped file a hash job that never settles (it still rejects on "Cancel all"), so
// the "Scanning" badge, Cancel button, and 0% summary figures hold still indefinitely. The
// Chromatic file-queued snapshot relies on this: a real scan of a tiny file finishes in
// milliseconds, racing the end-of-test capture between the mid-scan and scan-finished states —
// see docs/README.md.
function readTestFreezeScanOverride(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("test") && params.has("freeze_scan");
}
const freezeScan = readTestFreezeScanOverride();

function startFrozenHashing(file: File, row: FileRow): HashJob {
  return registerHashJob(
    file,
    row,
    [],
    (signal) =>
      new Promise<string>((_, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
  );
}

function startHashing(file: File, row: FileRow, relativePath: string): HashJob {
  if (freezeScan) return startFrozenHashing(file, row);
  if (mockMode) return startMockHashing(file, row);
  // planParts() throws synchronously for files it can't plan (e.g. empty files, which DANDI
  // rejects). Since startHashing runs inline inside addFiles()'s per-entry loop, an uncaught
  // throw here would abort that loop partway through a drop, leaving the rest of the batch
  // (and the reveal pass after the loop) never queued. Routing it through registerHashJob
  // instead turns it into an ordinary rejected hash promise, so it surfaces later as a normal
  // "Error" row when uploadFile awaits it, the same as any other hash failure.
  let parts: FilePart[];
  try {
    parts = planParts(file.size);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return registerHashJob(file, row, [], () => Promise.reject(error));
  }
  return registerHashJob(file, row, parts, (signal) =>
    hashPool.hash(
      file,
      parts,
      (f) => {
        row.setProgress(f * 0.999);
        reportHashBytes(file, f * file.size);
      },
      signal,
      checksumCacheKey({ relativePath, name: file.name, size: file.size, lastModified: file.lastModified }),
    ),
  );
}

// Mock counterpart to startHashing(): animates the "Scanning" phase for a fake (or, in mock mode,
// a genuinely dropped) file instead of running it through the real hash pool.
function startMockHashing(file: File, row: FileRow): HashJob {
  return registerHashJob(file, row, [], (signal) =>
    simulateProgress(file.size, mockPhaseDurationMs(file.size), signal, (bytesDone) => {
      row.setProgress(Math.min(0.999, file.size > 0 ? bytesDone / file.size : 1));
      reportHashBytes(file, bytesDone);
    }).then(() => "mock-etag"),
  );
}

// Mock counterpart to uploadFile(): animates the "Uploading" phase instead of hitting the real
// API, always finishing as "Done" unless cancelled — there's no real network to fail against.
async function mockUploadFile(
  row: FileRow,
  file: File,
  hashJob: HashJob,
  onUploadProgress?: (bytesDone: number) => void,
): Promise<UploadOutcome> {
  const abort = new AbortController();
  activeUploads.add(abort);
  try {
    await hashJob.promise;
    row.setProgress(0);
    row.setBadge("Uploading", "upload");
    await simulateProgress(file.size, mockPhaseDurationMs(file.size), abort.signal, (bytesDone) => {
      const fraction = file.size > 0 ? bytesDone / file.size : 1;
      row.setProgress(fraction);
      row.setStatus(`${(fraction * 100).toFixed(0)}%`);
      onUploadProgress?.(bytesDone);
    });
    row.setBadge("Done", "ok");
    row.setStatus("", "ok");
    row.setProgress(1, true);
    onUploadProgress?.(file.size);
    return "done";
  } catch (e) {
    if (abort.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
      // Bytes stay uncredited here, same as the real uploadFile() — see its catch block.
      row.setBadge("Cancelled", "warn");
      return "cancelled";
    }
    onUploadProgress?.(file.size);
    row.setBadge("Error", "err");
    return "error";
  } finally {
    activeUploads.delete(abort);
  }
}

// Cumulative progress tracker covering every file added this session (across all "Upload"
// clicks), so the summary stays meaningful even after multiple rounds of dropping + uploading.
let totalBytes = 0;
let hashDoneBytes = 0;
let uploadDoneBytes = 0;
let hashedFiles = 0;
let totalFiles = 0;
const counts: Record<UploadOutcome, number> = { done: 0, replaced: 0, error: 0, cancelled: 0, blocked: 0 };
const lastHashBytes = new Map<File, number>();
const lastUploadBytes = new Map<File, number>();
let tickerRunning = false;

function ensureTicker(): void {
  if (tickerRunning) return;
  tickerRunning = true;
  window.setInterval(updateProgressSummary, 500);
}

// The "Speed" chips show an exponential moving average over roughly the last RATE_WINDOW_SEC of
// samples rather than the lifetime average: the lifetime figure keeps misreporting for minutes
// after a stall or a burst, while raw per-update deltas flicker. Samples closer together than
// RATE_SAMPLE_MIN_SEC are folded into the next one, so the rAF-coalesced bursts of worker
// messages don't feed near-zero dt into the average.
const RATE_WINDOW_SEC = 3;
const RATE_SAMPLE_MIN_SEC = 0.25;

// A phase's first ETA_WARMUP_SEC of activity shows "estimating…" instead of a time-left figure:
// checksum-cache hits complete whole files instantly at the start of a scan, and those bursts
// make the early estimate wildly optimistic (seconds shown for work that takes minutes). The
// clock starts at the phase's own first byte of progress, not when the summary appears, so the
// upload phase idling before "Upload" is clicked doesn't burn its warm-up on inactivity.
const ETA_WARMUP_SEC = 30;

interface RateTracker {
  lastSampleTime: number | null;
  lastSampleBytes: number;
  bytesPerSec: number;
  firstProgressTime: number | null;
}

const hashRate: RateTracker = { lastSampleTime: null, lastSampleBytes: 0, bytesPerSec: 0, firstProgressTime: null };
const uploadRate: RateTracker = { lastSampleTime: null, lastSampleBytes: 0, bytesPerSec: 0, firstProgressTime: null };

function sampleRate(tracker: RateTracker, doneBytes: number): number {
  const now = performance.now();
  if (tracker.lastSampleTime === null) {
    tracker.lastSampleTime = now;
    tracker.lastSampleBytes = doneBytes;
    return tracker.bytesPerSec;
  }
  const dt = (now - tracker.lastSampleTime) / 1000;
  if (dt < RATE_SAMPLE_MIN_SEC) return tracker.bytesPerSec;
  const instantaneous = (doneBytes - tracker.lastSampleBytes) / dt;
  const alpha = 1 - Math.exp(-dt / RATE_WINDOW_SEC);
  tracker.bytesPerSec += alpha * (instantaneous - tracker.bytesPerSec);
  tracker.lastSampleTime = now;
  tracker.lastSampleBytes = doneBytes;
  return tracker.bytesPerSec;
}

// Hash/upload progress arrives in a flood of worker messages (one per 16MB chunk, across up to
// 8 pool workers). Coalescing them into at most one DOM update per animation frame keeps the
// main thread from being swamped by redundant layout-invalidating writes.
let progressUpdateScheduled = false;
function scheduleProgressUpdate(): void {
  if (progressUpdateScheduled) return;
  progressUpdateScheduled = true;
  requestAnimationFrame(() => {
    progressUpdateScheduled = false;
    updateProgressSummary();
  });
}

function reportHashBytes(file: File, bytesDone: number): void {
  // A late progress tick from a scan resetUploader() already forgot about would otherwise
  // re-seed lastHashBytes and skew the next batch's totals.
  if (!hashJobs.has(file)) return;
  const prev = lastHashBytes.get(file) ?? 0;
  hashDoneBytes += bytesDone - prev;
  lastHashBytes.set(file, bytesDone);
  scheduleProgressUpdate();
}

function reportUploadBytes(file: File, bytesDone: number): void {
  if (!hashJobs.has(file)) return;
  const prev = lastUploadBytes.get(file) ?? 0;
  uploadDoneBytes += bytesDone - prev;
  lastUploadBytes.set(file, bytesDone);
  scheduleProgressUpdate();
}

interface PhaseChipEls {
  fill: HTMLDivElement;
  pct: HTMLSpanElement;
  done: HTMLSpanElement;
  rate: HTMLSpanElement;
  eta: HTMLSpanElement;
  files: HTMLSpanElement;
}

// Chip values pair a primary figure with a quieter suffix ("1.4 GB" + "of 3.4 GB"), composed
// from text nodes rather than markup strings.
function setChipValue(el: HTMLSpanElement, main: string, sub: string): void {
  const subSpan = document.createElement("span");
  subSpan.className = "progress-chip-sub";
  subSpan.textContent = ` ${sub}`;
  el.replaceChildren(document.createTextNode(main), subSpan);
}

function renderPhaseBar(
  chipEls: PhaseChipEls,
  tracker: RateTracker,
  phaseDoneBytes: number,
  phaseDoneFiles: number,
  phaseActive: boolean,
): void {
  const pct = totalBytes > 0 ? Math.min(100, Math.round((phaseDoneBytes / totalBytes) * 100)) : 0;
  chipEls.fill.style.width = `${pct}%`;
  chipEls.fill.parentElement?.setAttribute("aria-valuenow", String(pct));

  const finished = totalBytes > 0 && phaseDoneBytes >= totalBytes;
  // Cancelling stops every in-flight hash/upload without finishing the phase's bytes, so
  // `finished` alone can't be trusted to know when to stop moving the needle: once nothing is
  // left active, freeze right there instead of letting the rate tracker keep resampling an
  // unmoving byte count, which decays the smoothed rate toward 0 and sends the ETA toward
  // infinity. `stopped` only fires once real progress had actually started, so a phase that
  // simply hasn't begun yet (upload before "Upload" is clicked) still reads as "—", not frozen.
  const stopped = !finished && !phaseActive && tracker.firstProgressTime !== null;
  let rate: number;
  if (finished || stopped) {
    rate = tracker.bytesPerSec;
    tracker.lastSampleTime = null;
  } else {
    rate = sampleRate(tracker, phaseDoneBytes);
  }
  const remaining = Math.max(0, totalBytes - phaseDoneBytes);

  if (phaseDoneBytes > 0 && tracker.firstProgressTime === null) {
    tracker.firstProgressTime = performance.now();
  }
  const warmingUp =
    tracker.firstProgressTime === null || (performance.now() - tracker.firstProgressTime) / 1000 < ETA_WARMUP_SEC;

  chipEls.pct.textContent = `${pct}%`;
  setChipValue(chipEls.done, humanSize(phaseDoneBytes), `of ${humanSize(totalBytes)}`);
  chipEls.rate.textContent = rate > 0 ? `${humanSize(rate)}/s` : "—";
  chipEls.eta.textContent = etaText(finished, stopped, warmingUp, rate, remaining);
  setChipValue(chipEls.files, String(phaseDoneFiles), `of ${totalFiles}`);
}

function etaText(finished: boolean, stopped: boolean, warmingUp: boolean, rate: number, remaining: number): string {
  if (finished) return "done";
  if (stopped || rate <= 0) return "—";
  if (warmingUp) return "estimating…";
  return friendlyEta(remaining / rate);
}

function updateProgressSummary(): void {
  const finished = counts.done + counts.replaced + counts.error + counts.cancelled + counts.blocked;
  renderPhaseBar(
    {
      fill: els.progressHashFill,
      pct: els.progressHashPct,
      done: els.progressHashDone,
      rate: els.progressHashRate,
      eta: els.progressHashEta,
      files: els.progressHashFiles,
    },
    hashRate,
    hashDoneBytes,
    hashedFiles,
    activeHashes.size > 0,
  );
  renderPhaseBar(
    {
      fill: els.progressUploadFill,
      pct: els.progressUploadPct,
      done: els.progressUploadDone,
      rate: els.progressUploadRate,
      eta: els.progressUploadEta,
      files: els.progressUploadFiles,
    },
    uploadRate,
    uploadDoneBytes,
    finished,
    activeUploadTransfers > 0,
  );

  const leftParts: string[] = [];
  if (counts.done) leftParts.push(`${counts.done} done`);
  if (counts.error) leftParts.push(`${counts.error} error${counts.error === 1 ? "" : "s"}`);
  if (counts.cancelled) leftParts.push(`${counts.cancelled} cancelled`);
  if (counts.blocked) leftParts.push(`${counts.blocked} blocked`);
  els.progressFooterLeft.textContent = leftParts.join(", ");
  els.progressFooterMid.textContent = counts.replaced ? `${counts.replaced} replaced` : "";
}

// The slider's ruler is drawn at fixed percentages of the track — a tick per possible value
// would mean one element per dropped file, the same kind of unbounded DOM growth this file's
// other perf fixes avoid. Minor ticks land every 5%, with a labeled major tick per quarter.
const EXPAND_MINOR_TICKS = 20;
const EXPAND_LABEL_STOPS = 4;

function updateExpandDepthRange(): void {
  els.expandDepthInput.max = String(addedFiles);
  const ruler: HTMLSpanElement[] = [];
  for (let i = 0; i <= EXPAND_MINOR_TICKS; i++) {
    const tick = document.createElement("span");
    tick.className = i % (EXPAND_MINOR_TICKS / EXPAND_LABEL_STOPS) === 0 ? "tick major" : "tick";
    tick.style.left = `${(i / EXPAND_MINOR_TICKS) * 100}%`;
    ruler.push(tick);
  }
  // Deduped so a small drop doesn't repeat the same rounded number; each label sits at the track
  // position its value actually maps to.
  const values = new Set(
    Array.from({ length: EXPAND_LABEL_STOPS + 1 }, (_, i) => Math.round((i * addedFiles) / EXPAND_LABEL_STOPS)),
  );
  for (const v of values) {
    const label = document.createElement("span");
    label.className = "tick-label";
    label.style.left = addedFiles > 0 ? `${(v / addedFiles) * 100}%` : "0%";
    label.textContent = String(v);
    ruler.push(label);
  }
  els.expandDepthTicks.replaceChildren(...ruler);
  updateExpandBubble();
}

// Keeps the "N files" bubble riding centered over the slider thumb (the 8px inset is half the
// native thumb's width) and its number in sync with the input's value.
function updateExpandBubble(): void {
  const value = Number(els.expandDepthInput.value);
  const max = Number(els.expandDepthInput.max);
  els.expandDepthValue.textContent = String(value);
  const fraction = max > 0 ? value / max : 0;
  els.expandDepthBubble.style.left = `calc(8px + (100% - 16px) * ${fraction})`;
}

els.versionIndicator.textContent = `v${__APP_VERSION__}`;

// The modal opens on the latest few versions; "Show more" swaps in the entire changelog for
// anyone curious enough to keep reading.
const WHATS_NEW_RECENT_VERSIONS = 3;
els.whatsNewContent.innerHTML = renderChangelogHtml(changelog, WHATS_NEW_RECENT_VERSIONS);
els.whatsNewShowMore.hidden = countChangelogVersions(changelog) <= WHATS_NEW_RECENT_VERSIONS;
els.whatsNewShowMore.addEventListener("click", () => {
  els.whatsNewContent.innerHTML = renderChangelogHtml(changelog, Infinity);
  els.whatsNewShowMore.hidden = true;
});
els.whatsNewButton.addEventListener("click", () => els.whatsNewModal.showModal());
els.whatsNewClose.addEventListener("click", () => els.whatsNewModal.close());
els.whatsNewModal.addEventListener("click", (e) => {
  if (e.target === els.whatsNewModal) els.whatsNewModal.close();
});

// The inline script in index.html already applied any stored theme override before first paint,
// so the toggle only has to flip and persist it. With nothing stored, data-theme is unset and the
// OS preference is in effect, so the first click flips away from whatever is currently showing.
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
els.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme ?? (prefersDark.matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  saveStoredTheme(next);
});

let oauthTokens: OAuthTokenSet | null = null;
// The dandiset id restored from a previous session, applied once the dropdown is populated with
// the signed-in user's incoming datasets (a <select> can't hold a value before its options exist).
let storedDandisetId = "";
// The dandiset picker's current option list, kept around so currentConfig() can look up the
// selected dandiset's embargo status without a second API round-trip.
let currentDatasets: IncomingDandiset[] = [];
// Whether the currently selected dataset's draft description carries the human-subjects marker
// phrase, and the dandiset ids the user already confirmed this session, so flipping between
// datasets in the dropdown doesn't demand re-confirming one already confirmed. The counter
// guards the metadata fetch so a slow response can't apply to a newer selection.
let humanSubjectsRequired = false;
const confirmedHumanSubjects = new Set<string>();
let humanSubjectsRefreshSeq = 0;

// Debug-only escape hatch for previewing the signed-out UI regardless of the real sign-in state:
// "?test&signed_out" forces every auth-dependent render to behave as if oauthTokens were null,
// without ever touching it (or localStorage) — see docs/README.md.
function readTestSignedOutOverride(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("test") && params.has("signed_out");
}
const forceSignedOut = readTestSignedOutOverride();

function loadSettings(): void {
  const s = loadStoredSettings();
  if (s) {
    if (s.dandisetId) storedDandisetId = s.dandisetId;
    if (s.oauth) oauthTokens = s.oauth;
  }
}

function saveSettings(): void {
  saveStoredSettings({
    dandisetId: els.dandisetId.value.trim(),
    oauth: oauthTokens ?? undefined,
  });
}

function currentConfig(): UploaderConfig {
  const selected = currentDatasets.find((d) => d.identifier === els.dandisetId.value);
  return resolveConfig({
    dandisetId: els.dandisetId.value,
    oauthAccessToken: forceSignedOut ? undefined : oauthTokens?.accessToken,
    embargoed: selected?.embargoed,
  });
}

function isSignedIn(): boolean {
  return !forceSignedOut && !!oauthTokens;
}

// True while the file list shows the read-only "Load from EMBER" browse of existing archive
// contents rather than a staged local folder. Staging a folder (or Reset) leaves browse mode.
let remoteBrowseActive = false;

// The folder card (dropzone / picked-folder summary) is only worth showing while signed in with
// the selected dataset's human-subjects warning (if any) confirmed; the one exception is a
// staged folder, which survives a mid-session sign-out or a switch to an unconfirmed dataset.
// The files card (tree, selection, progress) only appears once it has content to show: a staged
// folder or the read-only archive browse.
function updateCardsVisibility(): void {
  const staged = selection.files().length > 0;
  els.folderCard.hidden = (!isSignedIn() || humanSubjectsUnconfirmed()) && !staged;
  els.filesCard.hidden = !staged && !remoteBrowseActive;
  updateLoadRemoteBtn();
}

// The dropzone is only useful before a folder has been staged; after that its card spot belongs
// to the picked-folder summary row. It's also withheld while the selected dataset's
// human-subjects warning awaits its "I confirm", so nothing can even be staged before the
// warning is acknowledged.
function updateDropzoneVisibility(): void {
  els.dropzone.hidden = !isSignedIn() || selection.files().length > 0 || humanSubjectsUnconfirmed();
}

// "Load from EMBER" browses existing archive contents before a folder is picked; once one is
// staged the diff view already tells that story, so the button retires.
function updateLoadRemoteBtn(): void {
  const staged = selection.files().length > 0;
  const canReal = isSignedIn() && !!currentConfig().dandisetId;
  const canTest = readTestRemoteListingCount() !== null && !!els.dandisetId.value;
  els.loadRemoteBtn.hidden = staged || (!canReal && !canTest);
}

function renderAuthUI(): void {
  const signedIn = isSignedIn();
  els.oauthSigninBtn.hidden = signedIn;
  els.oauthSignedIn.hidden = !signedIn;
  updateDropzoneVisibility();
  updateCardsVisibility();
  // Once the real auth state is known, this element-level hidden state is authoritative; the
  // pre-paint script's stand-in attribute (see index.html) is no longer needed.
  delete document.documentElement.dataset.signedIn;
}

// Refreshes the OAuth access token first if it's near expiry, so the config used for the request
// that follows always carries a live token instead of one that's about to be rejected.
async function ensureFreshOAuth(): Promise<void> {
  if (!oauthTokens) return;
  const fresh = await ensureFreshToken(oauthTokens).catch(() => oauthTokens!);
  if (fresh !== oauthTokens) {
    oauthTokens = fresh;
    saveSettings();
  }
}

// The dataset picker has three mutually exclusive views: a plain-text status message (signed
// out, loading, no datasets, error), plain text naming the one dataset there's nothing to choose
// between, or a dropdown when there's an actual choice to make.
function showDandisetView(view: "message" | "single" | "dropdown"): void {
  els.dandisetMessage.hidden = view !== "message";
  els.dandisetSingle.hidden = view !== "single";
  els.dandisetId.hidden = view !== "dropdown";
  updateUploadGate();
}

// True while the selected dataset holds human-subjects data the user hasn't confirmed
// de-identification/IRB coverage for yet.
function humanSubjectsUnconfirmed(): boolean {
  return humanSubjectsRequired && !confirmedHumanSubjects.has(els.dandisetId.value);
}

// True while the selected dataset must not be uploaded to: either it isn't embargoed, or its
// human-subjects warning hasn't been confirmed yet.
function uploadBlocked(): boolean {
  return currentConfig().embargoed === false || humanSubjectsUnconfirmed();
}

// Shows a single error card in the Dataset section (rather than repeating the same message on
// every file row) when the currently selected dandiset is not embargoed, and disables the upload
// button while any gate (embargo, unconfirmed human-subjects data) blocks the batch from even
// being started.
function updateUploadGate(): void {
  els.dandisetEmbargoError.hidden = currentConfig().embargoed !== false;
  els.uploadAllBtn.disabled = uploadBlocked();
}

// Reflects the human-subjects state onto the warning banner (below the speed tips): hidden for
// ordinary datasets, the full scary warning with its "I confirm" button for an unconfirmed
// human-subjects dataset, or a slimmed "confirmed" notice once confirmed this session.
function renderHumanSubjectsBanner(): void {
  const confirmed = confirmedHumanSubjects.has(els.dandisetId.value);
  els.humanSubjectsBanner.hidden = !humanSubjectsRequired || !els.dandisetId.value;
  els.humanSubjectsUnconfirmed.hidden = confirmed;
  els.humanSubjectsConfirmed.hidden = !confirmed;
  updateUploadGate();
  updateDropzoneVisibility();
  updateCardsVisibility();
}

// Debug-only companion to "?test&num_datasets=N": adding "&human_subjects" marks every fake
// dataset as containing human-subjects data, so the warning banner and its confirm flow can be
// previewed without a real flagged dandiset — see docs/README.md.
function readTestHumanSubjectsOverride(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has("test") && params.has("human_subjects");
}

// Re-resolves whether the newly selected dataset needs the human-subjects gate by fetching its
// draft metadata and looking for the marker phrase in the description. While the fetch is in
// flight the banner is hidden and the gate open; if the fetch fails the gate deliberately stays
// open too (the marker is a best-effort convention, and blocking every upload on a transient
// metadata hiccup would be worse), with a console warning left behind.
async function refreshHumanSubjectsGate(): Promise<void> {
  const seq = ++humanSubjectsRefreshSeq;
  humanSubjectsRequired = false;
  renderHumanSubjectsBanner();
  // Fake "?test&num_datasets=N" datasets have no real draft to fetch. Detected via the select's
  // raw value: resolveConfig() deliberately blanks their negative identifiers out of
  // currentConfig(), so cfg.dandisetId can never carry the "-" marker.
  if (els.dandisetId.value.startsWith("-")) {
    if (readTestHumanSubjectsOverride()) {
      humanSubjectsRequired = true;
      renderHumanSubjectsBanner();
    }
    return;
  }
  const cfg = currentConfig();
  if (!cfg.dandisetId || !isSignedIn()) return;
  try {
    const metadata = await fetchDraftMetadata(cfg);
    if (seq !== humanSubjectsRefreshSeq) return;
    humanSubjectsRequired = containsHumanSubjects(metadata);
  } catch (e) {
    if (seq !== humanSubjectsRefreshSeq) return;
    console.warn("Could not check the selected dataset's metadata for human-subjects data:", e);
  }
  renderHumanSubjectsBanner();
}

function setDandisetPlaceholder(text: string): void {
  els.dandisetMessage.textContent = text;
  showDandisetView("message");
}

// With only one incoming dataset there's nothing to choose between, so show its name as plain
// text instead of a single-option dropdown (the card heading's "View on EMBER" button covers the
// way out to the archive).
function showDandisetSingle(dataset: IncomingDandiset): void {
  showDandisetView("single");
  const idCode = document.createElement("code");
  idCode.textContent = dataset.identifier;
  els.dandisetSingleText.replaceChildren("Uploading directly to EMBER Dandiset ", idCode, `, "${dataset.title}"`);
}

// Populates the dandiset picker (dropdown or single-dataset text) from a resolved list of
// datasets, shared by the real signed-in fetch and the "?test&num_datasets=N" debug override.
function applyDatasetList(datasets: IncomingDandiset[]): void {
  currentDatasets = datasets;
  if (!datasets.length) {
    setDandisetPlaceholder(
      "You have not been added to any direct-upload datasets; please reach out to EMBER/BBQS admins to request this.",
    );
    return;
  }
  // Dropdown mode (more than one dataset) always ranks options by ascending integer id, oldest
  // dandiset first, regardless of the order the archive returned them in.
  const ordered =
    datasets.length > 1 ? [...datasets].sort((a, b) => Number(a.identifier) - Number(b.identifier)) : datasets;
  els.dandisetId.replaceChildren(
    ...ordered.map((d) => {
      const opt = document.createElement("option");
      opt.value = d.identifier;
      opt.textContent = `(${d.identifier}) ${d.title}`;
      return opt;
    }),
  );
  const match = ordered.find((d) => d.identifier === storedDandisetId);
  const selected = match ?? ordered[0];
  // The select stays populated even when hidden (single-dataset view) so currentConfig() keeps
  // reading a real dandiset id from it.
  els.dandisetId.value = selected.identifier;
  if (datasets.length === 1) {
    showDandisetSingle(selected);
  } else {
    showDandisetView("dropdown");
  }
}

// Debug-only escape hatch for previewing the dataset picker's various states without a real
// account: e.g. "?test&num_datasets=2" fills in that many fake datasets, and "?test&num_datasets=0"
// previews the no-datasets-found state. Adding "&embargoed=false" previews the upload-blocked
// state instead of the (default) normal embargoed one. Bypasses sign-in entirely, so it also
// works for a signed-out visitor. "?test" alone (no num_datasets) is a no-op, so the override
// only ever kicks in when explicitly parameterized.
function readTestDatasetOverride(): IncomingDandiset[] | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("num_datasets");
  if (!params.has("test") || raw === null) return null;
  const count = Math.max(0, Number(raw) || 0);
  const embargoed = params.get("embargoed") !== "false";
  // Negative identifiers (e.g. "-000001") so a fake dataset is never mistaken for a real one.
  return Array.from({ length: count }, (_, i) => ({
    identifier: `-${String(i + 1).padStart(6, "0")}`,
    title: `Incoming: Test dataset ${i + 1}`,
    embargoed,
  }));
}

// Populates the "Incoming dataset" dropdown from the signed-in user's owned dandisets, since
// there's no longer a free-text Dandiset ID field to type into.
async function refreshDandisetOptions(): Promise<void> {
  if (forceSignedOut) {
    setDandisetPlaceholder("Please sign in to see your incoming datasets.");
    updateViewDatasetLink();
    void refreshHumanSubjectsGate();
    return;
  }
  const testDatasets = readTestDatasetOverride();
  if (testDatasets) {
    // Only the dataset list is faked; sign-in state (and thus the header avatar) still reflects
    // whatever the browser is really signed in as, if anything.
    if (oauthTokens) {
      await ensureFreshOAuth();
      void renderIdentity(els, currentConfig());
    }
    applyDatasetList(testDatasets);
    updateViewDatasetLink();
    void refreshHumanSubjectsGate();
    return;
  }
  if (!oauthTokens) {
    setDandisetPlaceholder("Please sign in to see your incoming datasets.");
    updateViewDatasetLink();
    void refreshHumanSubjectsGate();
    return;
  }
  await ensureFreshOAuth();
  void renderIdentity(els, currentConfig());
  setDandisetPlaceholder("Loading your incoming datasets…");
  try {
    const datasets = await listIncomingDandisets(currentConfig());
    applyDatasetList(datasets);
  } catch {
    setDandisetPlaceholder("Could not load your datasets");
  }
  saveSettings();
  updateViewDatasetLink();
  void refreshHumanSubjectsGate();
}

function updateViewDatasetLink(): void {
  const cfg = currentConfig();
  if (cfg.dandisetId) {
    els.viewDatasetLink.href = `${cfg.web}/dandiset/${cfg.dandisetId}/draft/files`;
    els.viewDatasetLink.hidden = false;
  } else {
    els.viewDatasetLink.hidden = true;
  }
  updateLoadRemoteBtn();
}

function updateUploadBar(): void {
  const s = selection.summary();
  // Keyed off staged files, not the rendered list: the read-only archive browse fills the list
  // with rows nothing can be done to.
  els.uploadBar.hidden = selection.files().length === 0;
  els.uploadAllBtn.hidden = s.selectedFiles === 0;
  els.uploadAllBtn.textContent = `Upload ${s.selectedFiles} file${s.selectedFiles === 1 ? "" : "s"} (${humanSize(s.selectedBytes)})`;
}

// Reflects one file's selection state onto its row: checkbox, dimming, and the badge/status pair
// describing how it compares to the archive. Consumed rows are left alone — from the moment a
// file joins an upload batch, the scanning/uploading pipeline owns its badge and status.
function applyRowAppearance(f: SelectionFile): void {
  const row = rowByFile.get(f.file);
  if (!row?.checkbox) return;
  if (f.consumed) {
    row.checkbox.disabled = true;
    row.el.classList.remove("deselected", "ignored");
    return;
  }
  if (f.ignoredBy !== null) {
    row.el.classList.add("deselected", "ignored");
    row.checkbox.checked = false;
    row.checkbox.disabled = true;
    row.checkbox.title = `Excluded by ignore pattern "${f.ignoredBy}"`;
    row.setBadge("Ignored", "mute");
    row.setStatus("");
    return;
  }
  row.checkbox.disabled = false;
  row.checkbox.title = "";
  row.checkbox.checked = f.checked;
  row.el.classList.toggle("deselected", !f.checked);
  row.el.classList.remove("ignored");
  if (f.remote === "uploaded") {
    row.setBadge("Uploaded", "ok");
    row.setStatus(f.checked ? "will replace" : "already on EMBER", f.checked ? "warn" : "");
  } else if (f.remote === "changed") {
    row.setBadge("Changed", "warn");
    row.setStatus(f.checked ? "will replace" : "differs on EMBER", f.checked ? "warn" : "");
  } else if (selection.hasRemote()) {
    row.setBadge("New", "upload");
    row.setStatus("");
  } else {
    row.hideBadge();
    row.setStatus("");
  }
}

// Refreshes everything derived from the selection: folder tri-states and size rollups, the
// summary line, and the Upload button's live count.
function refreshSelectionUI(): void {
  const aggregates = selection.dirAggregates();
  for (const [dirPath, dir] of dirEls) {
    const agg = aggregates.get(dirPath);
    if (!agg) continue;
    dir.checkbox.checked = agg.selectable > 0 && agg.selected === agg.selectable;
    dir.checkbox.indeterminate = agg.selected > 0 && agg.selected < agg.selectable;
    dir.checkbox.disabled = agg.selectable === 0;
    dir.sizeEl.textContent =
      agg.selectable === 0
        ? humanSize(agg.allBytes)
        : agg.selected === agg.selectable
          ? humanSize(agg.selectableBytes)
          : `${humanSize(agg.selectedBytes)} of ${humanSize(agg.selectableBytes)}`;
  }
  const s = selection.summary();
  const filesStrong = document.createElement("strong");
  filesStrong.textContent = `${s.selectedFiles} of ${s.totalFiles} file${s.totalFiles === 1 ? "" : "s"}`;
  const bytesStrong = document.createElement("strong");
  bytesStrong.textContent = humanSize(s.selectedBytes);
  els.selectionSummary.replaceChildren(filesStrong, " selected, ", bytesStrong, ` of ${humanSize(s.totalBytes)}`);
  updateUploadBar();
  updateUploadGate();
}

function refreshAllRows(): void {
  for (const f of selection.files()) applyRowAppearance(f);
}

function renderIgnoreChips(): void {
  els.ignoreChips.replaceChildren(
    ...selection.patterns().map((pattern) => {
      const chip = document.createElement("span");
      chip.className = "ignore-chip";
      const text = document.createElement("span");
      text.textContent = pattern;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", `Stop ignoring ${pattern}`);
      remove.addEventListener("click", () => {
        setIgnorePatterns(selection.patterns().filter((p) => p !== pattern));
      });
      chip.append(text, remove);
      return chip;
    }),
  );
}

function setIgnorePatterns(patterns: string[]): void {
  selection.setPatterns(patterns);
  renderIgnoreChips();
  refreshAllRows();
  refreshSelectionUI();
}

function addIgnorePatternFromInput(): void {
  const value = els.ignorePatternInput.value.trim();
  if (!value || selection.patterns().includes(value)) return;
  els.ignorePatternInput.value = "";
  setIgnorePatterns([...selection.patterns(), value]);
}

// ---- "Already on EMBER" check -------------------------------------------------------------
// Fetched once files are staged (and re-fetched on dataset switch or "Re-check"): what already
// exists under sourcedata/raw/ in the selected dataset's draft, folded into the tree as
// Uploaded/Changed/New badges, with already-uploaded files deselected.

let remoteCheckSeq = 0;

type RemoteBannerState =
  | { kind: "checking" }
  | { kind: "checked"; files: number; bytes: number }
  | { kind: "browse"; files: number; bytes: number }
  | { kind: "failed" };

function renderRemoteBanner(state: RemoteBannerState | null): void {
  els.remoteBanner.hidden = state === null;
  if (!state) return;
  els.remoteBanner.classList.toggle("checked", state.kind === "checked" || state.kind === "browse");
  els.remoteBanner.classList.toggle("failed", state.kind === "failed");
  els.remoteRecheckBtn.hidden = state.kind === "checking";
  if (state.kind === "checking") {
    els.remoteBannerIcon.className = "remote-banner-spinner";
    els.remoteBannerIcon.textContent = "";
    els.remoteBannerTitle.textContent = "Checking EMBER…";
    els.remoteBannerBody.innerHTML = "Listing what is already under <code>sourcedata/raw/</code> in this dataset.";
  } else if (state.kind === "failed") {
    els.remoteBannerIcon.className = "";
    els.remoteBannerIcon.textContent = "⚠️";
    els.remoteBannerTitle.textContent = "Couldn't check what's already on EMBER";
    els.remoteBannerBody.textContent = "Everything below is treated as new; re-check to try again.";
  } else if (state.files === 0) {
    els.remoteBannerIcon.className = "";
    els.remoteBannerIcon.textContent = "☁️";
    els.remoteBannerTitle.textContent = "Nothing uploaded yet";
    els.remoteBannerBody.innerHTML =
      state.kind === "browse"
        ? "<code>sourcedata/raw/</code> is empty in this dataset; pick a base folder to stage its first upload."
        : "<code>sourcedata/raw/</code> is empty in this dataset, so everything is new.";
  } else if (state.kind === "browse") {
    els.remoteBannerIcon.className = "";
    els.remoteBannerIcon.textContent = "☁️";
    els.remoteBannerTitle.textContent = `On EMBER: ${state.files} file${state.files === 1 ? "" : "s"} (${humanSize(state.bytes)})`;
    els.remoteBannerBody.innerHTML =
      "Everything this dataset already holds under <code>sourcedata/raw/</code>; pick the matching base folder to stage new uploads.";
  } else {
    els.remoteBannerIcon.className = "";
    els.remoteBannerIcon.textContent = "☁️";
    els.remoteBannerTitle.textContent = `Already on EMBER: ${state.files} file${state.files === 1 ? "" : "s"} (${humanSize(state.bytes)})`;
    els.remoteBannerBody.innerHTML =
      "Matching files under <code>sourcedata/raw/</code> are deselected below; re-check one to replace its uploaded copy.";
  }
}

// Debug-only escape hatch for previewing the "already on EMBER" diff without a real dataset:
// "?test&remote_listing=N" fabricates a listing that marks the first N staged files (by path) as
// already uploaded, with the first of them reporting a different size so one row shows
// "Changed" — see docs/README.md.
function readTestRemoteListingCount(): number | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("remote_listing");
  if (!params.has("test") || raw === null) return null;
  const count = Math.floor(Number(raw) || 0);
  return count >= 0 ? count : null;
}

// Whether this staged folder already had its fully-uploaded subfolders auto-collapsed; only the
// first applied listing collapses (a later Re-check must not undo the user's own expanding).
let autoCollapsedUploaded = false;

function applyRemoteListing(listing: Map<string, number>): void {
  selection.applyRemote(listing);
  refreshAllRows();
  refreshSelectionUI();
  // Folders the archive already holds in full are the ones there's nothing left to decide
  // about, so they start collapsed; the reveal slider (see its input listener) re-expands
  // everything on demand.
  if (!autoCollapsedUploaded) {
    autoCollapsedUploaded = true;
    const aggregates = selection.dirAggregates();
    for (const [dirPath, dir] of dirEls) {
      const agg = aggregates.get(dirPath);
      if (agg && agg.files > 0 && agg.uploaded === agg.files) dir.setExpanded(false);
    }
  }
  let bytes = 0;
  for (const size of listing.values()) bytes += size;
  renderRemoteBanner({ kind: "checked", files: listing.size, bytes });
}

async function refreshRemoteListing(): Promise<void> {
  if (selection.files().length === 0) return;
  // The "Compare with EMBER" toggle turns the whole archive check off (classic staging).
  if (!els.remoteCheckToggle.checked) {
    renderRemoteBanner(null);
    return;
  }
  const seq = ++remoteCheckSeq;
  const testCount = readTestRemoteListingCount();
  if (testCount !== null) {
    const paths = selection
      .files()
      .map((f) => ({ path: f.path, size: f.file.size }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, testCount);
    applyRemoteListing(new Map(paths.map((p, i) => [p.path, i === 0 ? p.size + 1 : p.size])));
    return;
  }
  const cfg = currentConfig();
  if (!isSignedIn() || !cfg.dandisetId) {
    renderRemoteBanner(null);
    return;
  }
  renderRemoteBanner({ kind: "checking" });
  try {
    await ensureFreshOAuth();
    const listing = await listRemoteFiles(currentConfig());
    if (seq !== remoteCheckSeq) return;
    applyRemoteListing(listing);
  } catch (e) {
    if (seq !== remoteCheckSeq) return;
    console.warn("Could not list the dataset's existing sourcedata/raw/ contents:", e);
    renderRemoteBanner({ kind: "failed" });
  }
}

// ---- "Load from EMBER" browse ------------------------------------------------------------
// A read-only rendering of what the dataset already holds under sourcedata/raw/, shown in the
// files card before any folder is picked, to inform/remind which base folder to select. Rows
// carry no checkboxes and nothing is uploadable; staging a folder (or Reset) replaces it.

function clearRemoteBrowse(): void {
  if (!remoteBrowseActive) return;
  remoteBrowseActive = false;
  els.fileList.replaceChildren();
  els.fileList.classList.remove("browse");
  els.destRoot.classList.remove("browse");
  els.destRoot.hidden = true;
  dirEls.clear();
  addedFiles = 0;
  renderRemoteBanner(null);
}

async function renderRemoteBrowse(listing: Map<string, number>): Promise<void> {
  clearRemoteBrowse();
  remoteBrowseActive = true;
  els.fileList.classList.add("browse");
  els.destRoot.classList.add("browse");
  const entries: { file: File; relativePath: string }[] = Array.from(listing, ([fullPath, size]) => {
    const rel = fullPath.startsWith("sourcedata/raw/") ? fullPath.slice("sourcedata/raw/".length) : fullPath;
    const segments = rel.split("/").filter(Boolean);
    const name = segments.pop() ?? rel;
    // Placeholder File objects (no content, shadowed size) — the tree renderer and rows only
    // ever read name/size, the same trick the mock-upload injection uses.
    const file = new File([], name);
    Object.defineProperty(file, "size", { value: size, configurable: true });
    return { file, relativePath: segments.join("/") };
  });
  addedFiles = entries.length;
  updateExpandDepthRange();
  els.expandDepthInput.value = String(Math.min(DEFAULT_REVEAL_COUNT, addedFiles));
  updateExpandBubble();
  const rendered = await renderFileTree(els.fileList, entries);
  for (const [dirPath, dir] of rendered.dirs) dirEls.set(dirPath, dir);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const container = rendered.targets.get(entry.file) ?? els.fileList;
    const { row } = queueFileRow(container, entry.file, entry.relativePath, false);
    row.el.hidden = true;
    if ((i + 1) % ADD_FILES_CHUNK_SIZE === 0) await yieldToMain();
  }
  setRevealCount(els.fileList, Number(els.expandDepthInput.value));
  let bytes = 0;
  for (const size of listing.values()) bytes += size;
  renderRemoteBanner({ kind: "browse", files: listing.size, bytes });
  els.destRoot.hidden = false;
  updateCardsVisibility();
  updateUploadBar();
}

async function loadRemoteBrowse(): Promise<void> {
  if (selection.files().length > 0) return; // a staged folder's diff already tells this story
  const seq = ++remoteCheckSeq;
  const testCount = readTestRemoteListingCount();
  if (testCount !== null) {
    // Debug-only companion path: fabricate the archive contents from mock files, so the browse
    // can be previewed without a real dataset — see docs/README.md.
    const listing = new Map(
      generateMockDroppedFiles(testCount).map((e) => [
        ["sourcedata/raw", e.relativePath, e.file.name].filter(Boolean).join("/"),
        e.file.size,
      ]),
    );
    await renderRemoteBrowse(listing);
    return;
  }
  const cfg = currentConfig();
  if (!isSignedIn() || !cfg.dandisetId) return;
  remoteBrowseActive = true; // the checking banner needs the files card on screen
  updateCardsVisibility();
  renderRemoteBanner({ kind: "checking" });
  try {
    await ensureFreshOAuth();
    const listing = await listRemoteFiles(currentConfig());
    if (seq !== remoteCheckSeq) return;
    await renderRemoteBrowse(listing);
  } catch (e) {
    if (seq !== remoteCheckSeq) return;
    console.warn("Could not list the dataset's existing sourcedata/raw/ contents:", e);
    renderRemoteBanner({ kind: "failed" });
  }
}

// How many files to queue (create a row + register selection state) per animation frame. Doing
// this for an entire large folder in one synchronous loop would block the browser from painting
// until it's done, on top of the tree render itself.
const ADD_FILES_CHUNK_SIZE = 200;

async function addFiles(folder: AcceptedFolder): Promise<void> {
  // A staged folder replaces the read-only archive browse, if one is showing.
  clearRemoteBrowse();
  const entries = folder.entries;
  const isFirstBatch = addedFiles === 0;
  addedFiles += entries.length;
  updateExpandDepthRange();
  if (isFirstBatch) {
    els.expandDepthInput.value = String(Math.min(DEFAULT_REVEAL_COUNT, addedFiles));
    updateExpandBubble();
  }

  const rendered = await renderFileTree(els.fileList, entries, (dirPath, checked) => {
    for (const f of selection.setSubtreeChecked(dirPath, checked)) applyRowAppearance(f);
    refreshSelectionUI();
  });
  for (const [dirPath, dir] of rendered.dirs) dirEls.set(dirPath, dir);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const container = rendered.targets.get(entry.file) ?? els.fileList;
    const { row, path } = queueFileRow(container, entry.file, entry.relativePath, true);
    // Rows start hidden; the reveal pass below decides which ones the slider's budget covers.
    row.el.hidden = true;
    rowByFile.set(entry.file, row);
    const selected = selection.add(entry.file, entry.relativePath, path);
    row.checkbox?.addEventListener("change", () => {
      selection.setChecked(entry.file, row.checkbox!.checked);
      applyRowAppearance(selected);
      refreshSelectionUI();
    });
    applyRowAppearance(selected);
    if ((i + 1) % ADD_FILES_CHUNK_SIZE === 0) await yieldToMain();
  }
  setRevealCount(els.fileList, Number(els.expandDepthInput.value));

  const totalStagedBytes = selection.summary().totalBytes;
  els.folderSummaryName.textContent = folder.folderName || "Selected folder";
  els.folderSummaryStats.textContent = `${addedFiles} file${addedFiles === 1 ? "" : "s"}, ${humanSize(totalStagedBytes)}`;
  els.folderSummary.hidden = els.fileList.children.length === 0;
  els.destRoot.hidden = els.fileList.children.length === 0;
  els.selectionBar.hidden = els.fileList.children.length === 0;
  renderIgnoreChips();
  updateDropzoneVisibility();
  updateCardsVisibility();
  refreshSelectionUI();
  void refreshRemoteListing();
}

async function startUpload(): Promise<void> {
  // The upload button is disabled while any gate blocks the batch (see updateUploadGate), so
  // this only matters if startUpload is somehow triggered anyway.
  if (uploadBlocked()) return;
  await ensureFreshOAuth();
  const selectedBatch = selection.consumeSelected();
  if (!selectedBatch.length) return;
  if (sessionStartedAt === null) sessionStartedAt = new Date().toISOString();
  // Captured now because a Reset clicked mid-batch nulls the module-level field; the report at
  // the end of this batch should still carry the value this batch actually started with.
  const batchSessionStartedAt = sessionStartedAt;
  const batch: { file: File; row: FileRow; path: string }[] = [];
  for (const f of selectedBatch) {
    const row = rowByFile.get(f.file);
    if (!row) continue;
    applyRowAppearance(f);
    row.setStatus("");
    fileStats.set(f.file, {
      path: f.path,
      sizeBytes: f.file.size,
      checksum: null,
      upload: null,
      status: "pending",
    });
    totalFiles++;
    totalBytes += f.file.size;
    // Hashing for the whole batch starts here, up front: the hash pool bounds concurrency
    // itself, and the per-file upload queue below awaits each file's own job.
    startHashing(f.file, row, f.relativePath);
    batch.push({ file: f.file, row, path: f.path });
  }
  els.progressSummary.hidden = false;
  refreshSelectionUI();
  uploadBatchActive = true;
  updateCancelAllVisibility();
  updateProgressSummary();
  const cfg = currentConfig();

  await runQueue(batch, FILE_CONCURRENCY, async ({ file, row, path }) => {
    // A Reset clicked mid-batch drops every file's hash job out from under this still-running
    // queue; treat a file resetUploader() already forgot about as a no-op rather than crashing.
    const job = hashJobs.get(file);
    if (!job) return;
    // Wait out this file's own scan before counting it toward the upload phase's "active"
    // signal — until then it isn't moving any bytes yet, regardless of how many other files in
    // the batch already are. The hash job itself is unaffected by awaiting it again once settled.
    await job.promise.catch(() => {});
    activeUploadTransfers++;
    const uploadStarted = performance.now();
    const uploadStartedAtIso = new Date().toISOString();
    let outcome: UploadOutcome;
    try {
      outcome = mockMode
        ? await mockUploadFile(row, file, job, (bytesDone) => reportUploadBytes(file, bytesDone))
        : await uploadFile(row, file, path, cfg, activeUploads, job, (bytesDone) => reportUploadBytes(file, bytesDone));
    } finally {
      activeUploadTransfers--;
    }
    counts[outcome]++;
    const stats = fileStats.get(file);
    if (stats) {
      stats.status = outcome;
      if (outcome === "done" || outcome === "replaced") {
        const durationSec = (performance.now() - uploadStarted) / 1000;
        stats.upload = {
          startedAt: uploadStartedAtIso,
          completedAt: new Date().toISOString(),
          MBps: durationSec > 0 ? bytesPerSecToMBps(file.size / durationSec) : 0,
        };
      } else if (outcome === "cancelled") {
        // "blocked" and "error" both force-credit the progress bar to 100% (see uploadFile), so
        // lastUploadBytes can't distinguish real transfer from that forced credit for them — only
        // "cancelled" leaves it uncredited and therefore trustworthy. Stays null (its initial
        // value) when not a single byte made it out before the cancel.
        const bytesDone = lastUploadBytes.get(file) ?? 0;
        if (bytesDone > 0) {
          const durationSec = (performance.now() - uploadStarted) / 1000;
          stats.upload = {
            startedAt: uploadStartedAtIso,
            completedAt: new Date().toISOString(),
            MBps: durationSec > 0 ? bytesPerSecToMBps(bytesDone / durationSec) : 0,
          };
        }
      }
    }
    updateProgressSummary();
  });

  uploadBatchActive = false;
  updateCancelAllVisibility();
  updateUploadBar();

  // Mock mode has no real API to post to; skip it the same way the rest of the mock path never
  // touches the network. Also skip a batch that got Reset out from under this still-running
  // upload: resetUploader() clears fileStats (among everything else this function reads), so an
  // empty files array here means there's nothing real left to report, not a batch of zero files.
  const files = Array.from(fileStats.values());
  if (!mockMode && files.length > 0) {
    const report: TransferReport = {
      schemaVersion: TRANSFER_REPORT_SCHEMA_VERSION,
      dandisetId: cfg.dandisetId,
      sessionStartedAt: batchSessionStartedAt,
      updatedAt: new Date().toISOString(),
      summary: {
        totalBytes,
        hashMBps: bytesPerSecToMBps(hashRate.bytesPerSec),
        uploadMBps: bytesPerSecToMBps(uploadRate.bytesPerSec),
        filesTotal: totalFiles,
        filesDone: counts.done + counts.replaced,
        filesErrored: counts.error,
      },
      files,
    };
    try {
      await uploadTransferReport(cfg, report);
    } catch (e) {
      console.warn("Failed to upload transfer report:", e);
    }
  }
}

// Clears the uploader back to its just-loaded, no-files state: cancels any in-flight scanning or
// uploading, drops the queued/hashed file bookkeeping, and hides the panels that only make sense
// once files are present.
function resetUploader(): void {
  for (const controller of activeHashes) controller.abort();
  for (const controller of activeUploads) controller.abort();
  clearRemoteBrowse();
  hashJobs.clear();
  lastHashBytes.clear();
  lastUploadBytes.clear();
  fileStats.clear();
  selection.clear();
  rowByFile.clear();
  dirEls.clear();
  autoCollapsedUploaded = false;
  remoteCheckSeq++; // discard any in-flight listing so it can't apply to the next folder
  sessionStartedAt = null;
  els.fileList.replaceChildren();
  els.folderSummary.hidden = true;
  els.selectionBar.hidden = true;
  els.remoteCheckToggle.checked = true;
  els.ignorePatternInput.value = "";
  renderIgnoreChips();
  renderRemoteBanner(null);
  els.dropzoneReject.hidden = true;

  addedFiles = 0;
  totalFiles = 0;
  totalBytes = 0;
  hashDoneBytes = 0;
  uploadDoneBytes = 0;
  hashedFiles = 0;
  counts.done = 0;
  counts.replaced = 0;
  counts.error = 0;
  counts.cancelled = 0;
  counts.blocked = 0;

  for (const tracker of [hashRate, uploadRate]) {
    tracker.lastSampleTime = null;
    tracker.lastSampleBytes = 0;
    tracker.bytesPerSec = 0;
    tracker.firstProgressTime = null;
  }

  uploadBatchActive = false;
  activeUploadTransfers = 0;
  els.destRoot.hidden = true;
  els.progressSummary.hidden = true;
  els.expandDepthInput.value = "0";
  updateExpandDepthRange();
  updateDropzoneVisibility();
  updateCardsVisibility();
  updateCancelAllVisibility();
  updateUploadBar();
  updateProgressSummary();
}

function runConnectionCheck(): void {
  saveSettings();
  void (async () => {
    await ensureFreshOAuth();
    updateViewDatasetLink();
  })();
}

// Debug-only escape hatch that previews the scanning/uploading UI against a fake nested batch of
// files, without touching the network or reading real bytes: "?test&mock_upload=25" queues 25
// fake files. Returns null (a no-op) unless explicitly parameterized with a positive integer —
// see docs/README.md.
function readTestMockUploadCount(): number | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("mock_upload");
  if (!params.has("test") || raw === null) return null;
  const count = Math.floor(Number(raw) || 0);
  return count > 0 ? count : null;
}

const callbackTokens = await handleRedirectCallback().catch((e) => {
  console.warn("OAuth sign-in callback failed:", e);
  return null;
});
loadSettings();
if (callbackTokens) {
  oauthTokens = callbackTokens;
  saveSettings();
}
renderAuthUI();
initDropzone(els, (folder) => {
  void addFiles(folder);
});
const mockUploadCount = readTestMockUploadCount();
if (mockUploadCount !== null) {
  mockMode = true;
  void addFiles({ folderName: "mock-dataset", entries: generateMockDroppedFiles(mockUploadCount) });
}
els.dandisetId.addEventListener("change", () => {
  updateUploadGate();
  void refreshHumanSubjectsGate();
  runConnectionCheck();
  // A different dataset holds different contents; the staged tree's diff (or the read-only
  // archive browse) must follow it.
  if (remoteBrowseActive) void loadRemoteBrowse();
  else void refreshRemoteListing();
});
els.changeFolderBtn.addEventListener("click", () => {
  resetUploader();
  els.folderInput.click();
});
els.loadRemoteBtn.addEventListener("click", () => void loadRemoteBrowse());
els.remoteRecheckBtn.addEventListener("click", () => {
  if (selection.files().length === 0) void loadRemoteBrowse();
  else void refreshRemoteListing();
});
els.remoteCheckToggle.addEventListener("change", () => {
  if (els.remoteCheckToggle.checked) {
    void refreshRemoteListing();
    return;
  }
  // Off = classic staging: cancel any in-flight check, forget the diff (re-selecting files that
  // sat deselected as already-uploaded), and re-expand anything the diff auto-collapsed.
  remoteCheckSeq++;
  selection.clearRemote();
  for (const dir of dirEls.values()) dir.setExpanded(true);
  refreshAllRows();
  refreshSelectionUI();
  renderRemoteBanner(null);
});
els.selectAllBtn.addEventListener("click", () => {
  for (const f of selection.setSubtreeChecked("", true)) applyRowAppearance(f);
  refreshSelectionUI();
});
els.selectNoneBtn.addEventListener("click", () => {
  for (const f of selection.setSubtreeChecked("", false)) applyRowAppearance(f);
  refreshSelectionUI();
});
els.ignorePatternAddBtn.addEventListener("click", addIgnorePatternFromInput);
els.ignorePatternInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addIgnorePatternFromInput();
  }
});
els.humanSubjectsConfirmBtn.addEventListener("click", () => {
  confirmedHumanSubjects.add(els.dandisetId.value);
  renderHumanSubjectsBanner();
});
els.configForm.addEventListener("submit", (e) => e.preventDefault());
els.oauthSigninBtn.addEventListener("click", () => void startLogin());
els.oauthSignoutBtn.addEventListener("click", () => {
  const tokens = oauthTokens;
  oauthTokens = null;
  saveSettings();
  renderAuthUI();
  if (tokens) void revokeToken(tokens);
  void refreshDandisetOptions();
});
void refreshDandisetOptions();
// A range input fires "input" continuously while dragging (many events per second).
// setRevealCount() walks every file row in the tree, so coalescing to at most once per
// animation frame keeps a drag from becoming an unresponsive flood of full-tree traversals.
let expandDepthUpdateScheduled = false;
els.expandDepthInput.addEventListener("input", () => {
  updateExpandBubble();
  if (expandDepthUpdateScheduled) return;
  expandDepthUpdateScheduled = true;
  requestAnimationFrame(() => {
    expandDepthUpdateScheduled = false;
    // The slider means "show me this many files", so it overrides any collapsed folders —
    // including the automatically collapsed already-on-EMBER ones — or its count would lie.
    for (const dir of dirEls.values()) dir.setExpanded(true);
    setRevealCount(els.fileList, Number(els.expandDepthInput.value));
  });
});
els.uploadAllBtn.addEventListener("click", () => void startUpload());
els.cancelAllBtn.addEventListener("click", () => {
  for (const controller of activeHashes) controller.abort();
  for (const controller of activeUploads) controller.abort();
});
els.resetAllBtn.addEventListener("click", resetUploader);
els.clearScanCacheBtn.addEventListener("click", () => {
  void checksumCache.clear();
  const original = els.clearScanCacheBtn.textContent;
  els.clearScanCacheBtn.disabled = true;
  els.clearScanCacheBtn.textContent = "Checksum cache cleared";
  window.setTimeout(() => {
    els.clearScanCacheBtn.disabled = false;
    els.clearScanCacheBtn.textContent = original;
  }, 1500);
});
window.addEventListener("beforeunload", (e) => {
  if (activeUploads.size > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});
