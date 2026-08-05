// Story-side assembly of the production selection UI: the real selection model
// (src/lib/selection.ts), the real tree renderer and file rows (src/ui/fileTree.ts, fileRow.ts),
// and the production CSS classes, wired together the same way src/main.ts does. Only the glue is
// duplicated here — main.ts's wiring is bound to the page-level element registry and can't be
// imported piecemeal.
import { createSelectionModel, type SelectionFile, type SelectionSummary } from "../src/lib/selection";
import { renderFileTree, type DirRowEls } from "../src/ui/fileTree";
import { createFileRow, type FileRow } from "../src/ui/fileRow";
import { humanSize } from "../src/lib/format";
import type { DroppedFile } from "../src/lib/fileTree";

export interface SelectionCardOptions {
  entries: DroppedFile[];
  /** Starting ignore patterns, e.g. ["*.tmp", "*.log"]. */
  patterns?: string[];
  /** Archive listing keyed by full path ("sourcedata/raw/…"); omit for a no-diff tree. */
  remote?: Map<string, number>;
  /** Called after every selection change (and once on build), e.g. to drive an Upload button. */
  onSummary?: (summary: SelectionSummary) => void;
}

let storyFileCounter = 0;

/** Builds the toolbar + chip editor + checkbox tree for a staged folder. */
export function buildSelectionTree(opts: SelectionCardOptions): HTMLElement {
  const selection = createSelectionModel();
  const rowByFile = new Map<File, FileRow>();
  const dirEls = new Map<string, DirRowEls>();

  const root = document.createElement("div");
  root.innerHTML = `
    <div class="select-toolbar">
      <span class="select-toolbar-summary" data-role="summary"></span>
      <span class="select-toolbar-actions">
        <button type="button" class="mini-btn" data-role="select-all">Select all</button>
        <button type="button" class="mini-btn" data-role="select-none">Select none</button>
      </span>
    </div>
    <div class="ignore-chip-row">
      <span>Ignoring:</span>
      <span data-role="chips" style="display: contents"></span>
      <input class="ignore-pattern-input" placeholder="Add pattern, e.g. *.tmp or scratch/" aria-label="Add ignore pattern" />
      <button type="button" class="mini-btn" data-role="add-pattern">Add</button>
    </div>
    <ul id="file-list"></ul>
  `;
  const summaryEl = root.querySelector<HTMLSpanElement>('[data-role="summary"]')!;
  const chipsEl = root.querySelector<HTMLSpanElement>('[data-role="chips"]')!;
  const patternInput = root.querySelector<HTMLInputElement>(".ignore-pattern-input")!;
  const list = root.querySelector<HTMLUListElement>("#file-list")!;

  function applyRowAppearance(f: SelectionFile): void {
    const row = rowByFile.get(f.file);
    if (!row?.checkbox) return;
    if (f.ignoredBy !== null) {
      row.el.classList.add("deselected", "ignored");
      row.checkbox.checked = false;
      row.checkbox.disabled = true;
      row.setBadge("Ignored", "mute");
      row.setStatus("");
      return;
    }
    row.checkbox.disabled = false;
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

  function refresh(): void {
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
    summaryEl.replaceChildren(filesStrong, " selected, ", bytesStrong, ` of ${humanSize(s.totalBytes)}`);
    renderChips();
    opts.onSummary?.(s);
  }

  function refreshAllRows(): void {
    for (const f of selection.files()) applyRowAppearance(f);
  }

  function renderChips(): void {
    chipsEl.replaceChildren(
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
          selection.setPatterns(selection.patterns().filter((p) => p !== pattern));
          refreshAllRows();
          refresh();
        });
        chip.append(text, remove);
        return chip;
      }),
    );
  }

  root.querySelector('[data-role="select-all"]')!.addEventListener("click", () => {
    for (const f of selection.setSubtreeChecked("", true)) applyRowAppearance(f);
    refresh();
  });
  root.querySelector('[data-role="select-none"]')!.addEventListener("click", () => {
    for (const f of selection.setSubtreeChecked("", false)) applyRowAppearance(f);
    refresh();
  });
  const addPattern = (): void => {
    const value = patternInput.value.trim();
    if (!value || selection.patterns().includes(value)) return;
    patternInput.value = "";
    selection.setPatterns([...selection.patterns(), value]);
    refreshAllRows();
    refresh();
  };
  root.querySelector('[data-role="add-pattern"]')!.addEventListener("click", addPattern);
  patternInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPattern();
  });

  // The tree render is async only for very large batches (it yields between chunks); fixture-
  // sized batches complete before the story is painted.
  void (async () => {
    const rendered = await renderFileTree(list, opts.entries, (dirPath, checked) => {
      for (const f of selection.setSubtreeChecked(dirPath, checked)) applyRowAppearance(f);
      refresh();
    });
    for (const [dirPath, dir] of rendered.dirs) dirEls.set(dirPath, dir);
    for (const entry of opts.entries) {
      const container = rendered.targets.get(entry.file) ?? list;
      const path = ["sourcedata/raw", entry.relativePath, entry.file.name].filter(Boolean).join("/");
      const row = createFileRow(container, entry.file, `story-file-${storyFileCounter++}`, path, true);
      rowByFile.set(entry.file, row);
      const selected = selection.add(entry.file, entry.relativePath, path);
      row.checkbox?.addEventListener("change", () => {
        selection.setChecked(entry.file, row.checkbox!.checked);
        applyRowAppearance(selected);
        refresh();
      });
    }
    selection.setPatterns(opts.patterns ?? []);
    if (opts.remote) selection.applyRemote(opts.remote);
    refreshAllRows();
    refresh();
  })();

  return root;
}

export type RemoteBannerState =
  { kind: "checking" } | { kind: "checked"; files: number; bytes: number } | { kind: "failed" };

/** The "already on EMBER" banner in a given state, using the production markup and classes. */
export function buildRemoteBanner(state: RemoteBannerState): HTMLDivElement {
  const banner = document.createElement("div");
  banner.className = "remote-banner";
  banner.innerHTML = `
    <span data-role="icon" aria-hidden="true"></span>
    <div>
      <div class="remote-banner-title"></div>
      <div class="remote-banner-body"></div>
    </div>
    <button type="button">Re-check</button>
  `;
  const icon = banner.querySelector<HTMLSpanElement>('[data-role="icon"]')!;
  const title = banner.querySelector<HTMLDivElement>(".remote-banner-title")!;
  const body = banner.querySelector<HTMLDivElement>(".remote-banner-body")!;
  if (state.kind === "checking") {
    banner.querySelector("button")!.hidden = true;
    icon.className = "remote-banner-spinner";
    title.textContent = "Checking EMBER…";
    body.innerHTML = "Listing what is already under <code>sourcedata/raw/</code> in this dataset.";
  } else if (state.kind === "failed") {
    banner.classList.add("failed");
    icon.textContent = "⚠️";
    title.textContent = "Couldn't check what's already on EMBER";
    body.textContent = "Everything below is treated as new; re-check to try again.";
  } else if (state.files === 0) {
    banner.classList.add("checked");
    icon.textContent = "☁️";
    title.textContent = "Nothing uploaded yet";
    body.innerHTML = "<code>sourcedata/raw/</code> is empty in this dataset, so everything is new.";
  } else {
    banner.classList.add("checked");
    icon.textContent = "☁️";
    title.textContent = `Already on EMBER: ${state.files} file${state.files === 1 ? "" : "s"} (${humanSize(state.bytes)})`;
    body.textContent = "Existing files are deselected below; re-select to replace the previous upload.";
  }
  return banner;
}
