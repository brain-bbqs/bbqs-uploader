import "./style.css";
import { getElements } from "./ui/elements";
import { initDropzone } from "./ui/dropzone";
import { queueFileRow, uploadFile, type UploadOutcome } from "./ui/processFile";
import { humanSize } from "./lib/format";
import { testConnection } from "./ui/connection";
import { renderFileTree, setExpandDepth } from "./ui/fileTree";
import { createEtagWorker } from "./lib/etag-worker";
import { loadStoredSettings, saveStoredSettings, resolveConfig } from "./lib/settings";
import type { UploaderConfig } from "./lib/types";
import type { DroppedFile } from "./lib/fileTree";
import type { FileRow } from "./ui/fileRow";

declare const __APP_VERSION__: string;

// One hashing worker (a real OS thread) per concurrent file "lane", so hashing N files at once
// actually uses N CPU cores instead of interleaving on the single JS main thread. Workers are
// spawned lazily per lane on first use, not eagerly at page load, so just browsing the app (no
// upload yet) doesn't pay worker startup cost.
const FILE_CONCURRENCY = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8));
const hashWorkers: ReturnType<typeof createEtagWorker>[] = [];
function getHashWorker(lane: number): ReturnType<typeof createEtagWorker> {
  return (hashWorkers[lane] ??= createEtagWorker());
}

const els = getElements();
const activeUploads = new Set<AbortController>();
const pending: { file: File; row: FileRow; path: string }[] = [];

// Batch-scoped progress tracker for the current (or most recently finished) "Upload" click.
let batchTotalBytes = 0;
let batchDoneBytes = 0;
let batchTotalFiles = 0;
const batchCounts: Record<UploadOutcome, number> = { done: 0, skipped: 0, error: 0, cancelled: 0, blocked: 0 };
const lastReportedBytes = new Map<File, number>();

function reportFileBytes(file: File, bytesDone: number): void {
  const prev = lastReportedBytes.get(file) ?? 0;
  batchDoneBytes += bytesDone - prev;
  lastReportedBytes.set(file, bytesDone);
  updateProgressSummary();
}

function updateProgressSummary(): void {
  const pct = batchTotalBytes > 0 ? Math.min(100, Math.round((batchDoneBytes / batchTotalBytes) * 100)) : 0;
  els.progressSummaryFill.style.width = `${pct}%`;
  const finished =
    batchCounts.done + batchCounts.skipped + batchCounts.error + batchCounts.cancelled + batchCounts.blocked;
  const parts: string[] = [];
  if (batchCounts.done) parts.push(`${batchCounts.done} done`);
  if (batchCounts.skipped) parts.push(`${batchCounts.skipped} skipped`);
  if (batchCounts.error) parts.push(`${batchCounts.error} error${batchCounts.error === 1 ? "" : "s"}`);
  if (batchCounts.cancelled) parts.push(`${batchCounts.cancelled} cancelled`);
  if (batchCounts.blocked) parts.push(`${batchCounts.blocked} blocked`);
  const summary = parts.length ? parts.join(", ") : "starting…";
  els.progressSummaryText.textContent =
    `${pct}% (${humanSize(batchDoneBytes)} / ${humanSize(batchTotalBytes)}) — ` +
    `${finished}/${batchTotalFiles} files — ${summary}`;
}

if (els.versionIndicator) {
  els.versionIndicator.textContent = `v${__APP_VERSION__}`;
}

function loadSettings(): boolean {
  const s = loadStoredSettings();
  if (s) {
    if (s.apiKey) els.apiKey.value = s.apiKey;
    if (s.dandisetId) els.dandisetId.value = s.dandisetId;
  }
  return s !== null;
}

function saveSettings(): void {
  saveStoredSettings({
    apiKey: els.apiKey.value.trim(),
    dandisetId: els.dandisetId.value.trim(),
  });
}

function currentConfig(): UploaderConfig {
  return resolveConfig({
    apiKey: els.apiKey.value,
    dandisetId: els.dandisetId.value,
  });
}

function updateUploadBar(): void {
  els.uploadBar.hidden = pending.length === 0;
  els.uploadAllBtn.textContent = `Upload ${pending.length} file${pending.length === 1 ? "" : "s"}`;
}

function addFiles(entries: DroppedFile[]): void {
  const targets = renderFileTree(els.fileList, entries, Number(els.expandDepthInput.value));
  for (const entry of entries) {
    const container = targets.get(entry.file) ?? els.fileList;
    const { row, path } = queueFileRow(container, entry.file, entry.relativePath);
    pending.push({ file: entry.file, row, path });
  }
  els.destRoot.hidden = els.fileList.children.length === 0;
  updateUploadBar();
}

async function runQueue<T>(items: T[], worker: (item: T, lane: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function run(lane: number): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], lane);
    }
  }
  await Promise.all(Array.from({ length: Math.min(FILE_CONCURRENCY, items.length) }, (_, lane) => run(lane)));
}

async function startUpload(): Promise<void> {
  const batch = pending.splice(0, pending.length);
  updateUploadBar();
  els.cancelAllBtn.hidden = false;
  const cfg = currentConfig();

  batchTotalBytes = batch.reduce((sum, b) => sum + b.file.size, 0);
  batchDoneBytes = 0;
  batchTotalFiles = batch.length;
  lastReportedBytes.clear();
  (Object.keys(batchCounts) as UploadOutcome[]).forEach((k) => (batchCounts[k] = 0));
  els.progressSummary.hidden = false;
  updateProgressSummary();

  await runQueue(batch, async ({ file, row, path }, lane) => {
    const outcome = await uploadFile(row, file, path, cfg, activeUploads, getHashWorker(lane).hash, (bytesDone) =>
      reportFileBytes(file, bytesDone),
    );
    batchCounts[outcome]++;
    updateProgressSummary();
  });

  els.cancelAllBtn.hidden = true;
  updateUploadBar();
}

function runConnectionCheck(): void {
  void testConnection(els, currentConfig, saveSettings);
}

const hadStoredSettings = loadSettings();
initDropzone(els, addFiles);
[els.apiKey, els.dandisetId].forEach((el) => el.addEventListener("change", runConnectionCheck));
document.getElementById("config-form")!.addEventListener("submit", (e) => e.preventDefault());
if (hadStoredSettings) runConnectionCheck();
els.apiKeyHelp.addEventListener("click", () => {
  els.apiKeyHelpText.hidden = !els.apiKeyHelpText.hidden;
});
els.expandDepthInput.addEventListener("input", () => {
  const depth = Number(els.expandDepthInput.value);
  els.expandDepthValue.textContent = String(depth);
  setExpandDepth(els.fileList, depth);
});
els.uploadAllBtn.addEventListener("click", () => void startUpload());
els.cancelAllBtn.addEventListener("click", () => {
  for (const controller of activeUploads) controller.abort();
});
window.addEventListener("beforeunload", (e) => {
  if (activeUploads.size > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});
