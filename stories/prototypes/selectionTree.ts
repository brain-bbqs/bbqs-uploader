// The interactive core of the file-management redesign prototypes: a checkbox tree over a picked
// base folder, with tri-state folder checkboxes, glob-style ignore patterns, and optional
// awareness of what already exists under sourcedata/raw/ on the archive. Deliberately built as a
// story-only module (full re-render on every change, no chunked yielding) -- if the design lands,
// the production version grows out of src/ui/fileTree.ts with a retained model instead.
import { buildTree, type DroppedFile, type TreeNode } from "../../src/lib/fileTree";
import { humanSize } from "../../src/lib/format";

export type RemoteState = "uploaded" | "changed" | null;

export interface SelectionSummary {
  selectedFiles: number;
  selectedBytes: number;
  totalFiles: number;
  totalBytes: number;
  ignoredFiles: number;
  skippedUploaded: number;
}

export interface SelectionTreeOptions {
  entries: DroppedFile[];
  /** Starting ignore patterns, e.g. ["*.tmp", "scratch/"]. */
  patterns?: string[];
  /** Show the chip editor so patterns can be added/removed live. */
  editablePatterns?: boolean;
  /** Map of path (relative to sourcedata/raw/) to size for files already on the archive. */
  remote?: Map<string, number>;
  /** Paths to start unchecked, on top of the automatic deselect of already-uploaded files. */
  initiallyExcluded?: string[];
  /** Called after every selection change (and once on build). */
  onSummary?: (summary: SelectionSummary) => void;
}

export interface SelectionTree {
  el: HTMLElement;
  getSummary(): SelectionSummary;
}

interface FileState {
  entry: DroppedFile;
  /** Path relative to the picked folder (and to sourcedata/raw/ on the archive side). */
  path: string;
  remote: RemoteState;
  /** The pattern currently excluding this file, or null. Recomputed when patterns change. */
  ignoredBy: string | null;
  /** The user's own include choice; only meaningful while no pattern overrides it. */
  checked: boolean;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}

// First pattern that excludes the file, or null. Three pattern shapes:
// - "name.ext" / "*.tmp"  -- matched against the filename alone
// - "scratch/"            -- matched against every folder segment of the file's path
// - "sub-01/ses-*/x.csv"  -- containing "/": matched against the full relative path
export function matchIgnorePattern(patterns: string[], relativePath: string, name: string): string | null {
  for (const pattern of patterns) {
    if (pattern.endsWith("/")) {
      const re = globToRegExp(pattern.slice(0, -1));
      if (
        relativePath
          .split("/")
          .filter(Boolean)
          .some((seg) => re.test(seg))
      )
        return pattern;
    } else if (pattern.includes("/")) {
      const full = [relativePath, name].filter(Boolean).join("/");
      if (globToRegExp(pattern).test(full)) return pattern;
    } else if (globToRegExp(pattern).test(name)) {
      return pattern;
    }
  }
  return null;
}

export function buildSelectionTree(opts: SelectionTreeOptions): SelectionTree {
  const patterns = [...(opts.patterns ?? [])];
  const initiallyExcluded = new Set(opts.initiallyExcluded ?? []);
  const hasRemote = opts.remote !== undefined;

  const files: FileState[] = opts.entries.map((entry) => {
    const path = [entry.relativePath, entry.file.name].filter(Boolean).join("/");
    const remoteSize = opts.remote?.get(path);
    const remote: RemoteState =
      remoteSize === undefined ? null : remoteSize === entry.file.size ? "uploaded" : "changed";
    return {
      entry,
      path,
      remote,
      ignoredBy: null,
      checked: remote !== "uploaded" && !initiallyExcluded.has(path),
    };
  });
  const byPath = new Map(files.map((f) => [f.path, f]));
  const collapsed = new Set<string>();

  const isIncluded = (f: FileState): boolean => f.ignoredBy === null && f.checked;

  function applyPatterns(): void {
    for (const f of files) {
      f.ignoredBy = matchIgnorePattern(patterns, f.entry.relativePath, f.entry.file.name);
    }
  }

  function getSummary(): SelectionSummary {
    const included = files.filter(isIncluded);
    return {
      selectedFiles: included.length,
      selectedBytes: included.reduce((sum, f) => sum + f.entry.file.size, 0),
      totalFiles: files.length,
      totalBytes: files.reduce((sum, f) => sum + f.entry.file.size, 0),
      ignoredFiles: files.filter((f) => f.ignoredBy !== null).length,
      skippedUploaded: files.filter((f) => f.remote === "uploaded" && !isIncluded(f)).length,
    };
  }

  const root = document.createElement("div");

  const toolbar = document.createElement("div");
  toolbar.className = "proto-select-toolbar";
  toolbar.innerHTML = `
    <span><strong data-role="sel-files"></strong> selected, <strong data-role="sel-bytes"></strong> <span data-role="of-bytes"></span></span>
    <span class="proto-toolbar-actions">
      <button type="button" class="proto-mini-btn" data-role="select-all">Select all</button>
      <button type="button" class="proto-mini-btn" data-role="select-none">Select none</button>
    </span>
  `;
  root.appendChild(toolbar);

  const chipRow = document.createElement("div");
  chipRow.className = "proto-chip-row";
  root.appendChild(chipRow);

  const list = document.createElement("ul");
  list.className = "proto-file-list";
  root.appendChild(list);

  function renderChips(): void {
    chipRow.replaceChildren();
    chipRow.hidden = patterns.length === 0 && !opts.editablePatterns;
    const label = document.createElement("span");
    label.textContent = "Ignoring:";
    chipRow.appendChild(label);
    for (const pattern of patterns) {
      const chip = document.createElement("span");
      chip.className = "proto-chip";
      const text = document.createElement("span");
      text.textContent = pattern;
      chip.appendChild(text);
      if (opts.editablePatterns) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "✕";
        remove.setAttribute("aria-label", `Stop ignoring ${pattern}`);
        remove.addEventListener("click", () => {
          patterns.splice(patterns.indexOf(pattern), 1);
          applyPatterns();
          update();
        });
        chip.appendChild(remove);
      }
      chipRow.appendChild(chip);
    }
    if (opts.editablePatterns) {
      const input = document.createElement("input");
      input.className = "proto-pattern-input";
      input.placeholder = "Add pattern, e.g. *.tmp or scratch/";
      input.setAttribute("aria-label", "Add ignore pattern");
      const add = (): void => {
        const value = input.value.trim();
        if (!value || patterns.includes(value)) return;
        patterns.push(value);
        applyPatterns();
        update();
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") add();
      });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "proto-mini-btn";
      button.textContent = "Add";
      button.addEventListener("click", add);
      chipRow.appendChild(input);
      chipRow.appendChild(button);
    }
  }

  function collectFiles(node: TreeNode, into: FileState[] = []): FileState[] {
    for (const entry of node.files) {
      const path = [entry.relativePath, entry.file.name].filter(Boolean).join("/");
      const state = byPath.get(path);
      if (state) into.push(state);
    }
    for (const child of node.dirs.values()) collectFiles(child, into);
    return into;
  }

  function renderFileRow(f: FileState): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "file-item";
    li.innerHTML = `
      <input type="checkbox" class="proto-check" />
      <span class="file-name"></span>
      <span class="file-size"></span>
      <span class="file-status"></span>
      <span class="badge" hidden></span>
    `;
    const checkbox = li.querySelector<HTMLInputElement>(".proto-check")!;
    const badge = li.querySelector<HTMLSpanElement>(".badge")!;
    const status = li.querySelector<HTMLSpanElement>(".file-status")!;
    li.querySelector(".file-name")!.textContent = f.entry.file.name;
    li.querySelector(".file-size")!.textContent = humanSize(f.entry.file.size);
    li.title = `sourcedata/raw/${f.path}`;

    const setBadge = (text: string, kind: string): void => {
      badge.hidden = false;
      badge.textContent = text;
      badge.className = `badge ${kind}`;
    };

    if (f.ignoredBy !== null) {
      li.classList.add("proto-off", "proto-ignored");
      li.title = `Matches ignore pattern "${f.ignoredBy}"`;
      checkbox.checked = false;
      checkbox.disabled = true;
      checkbox.title = "Excluded by an ignore pattern; remove the pattern to select it";
      setBadge("Ignored", "proto-badge-mute");
      return li;
    }

    checkbox.checked = f.checked;
    checkbox.setAttribute("aria-label", `Include ${f.entry.file.name}`);
    if (!f.checked) li.classList.add("proto-off");
    if (f.remote === "uploaded") {
      setBadge("Uploaded", "ok");
      if (f.checked) {
        status.textContent = "will replace";
        status.classList.add("warn");
      } else {
        status.textContent = "already on EMBER";
      }
    } else if (f.remote === "changed") {
      setBadge("Changed", "warn");
      li.title += " (size differs from the copy on EMBER)";
      if (f.checked) {
        status.textContent = "will replace";
        status.classList.add("warn");
      }
    } else if (hasRemote) {
      setBadge("New", "upload");
    }
    checkbox.addEventListener("change", () => {
      f.checked = checkbox.checked;
      update();
    });
    return li;
  }

  function renderDirRow(node: TreeNode): HTMLLIElement {
    const descendants = collectFiles(node);
    const selectable = descendants.filter((f) => f.ignoredBy === null);
    const included = selectable.filter((f) => f.checked);
    const includedBytes = included.reduce((sum, f) => sum + f.entry.file.size, 0);
    const selectableBytes = selectable.reduce((sum, f) => sum + f.entry.file.size, 0);

    const li = document.createElement("li");
    li.className = "dir-item";
    li.innerHTML = `
      <div class="proto-dir-row">
        <input type="checkbox" class="proto-check" />
        <button type="button" class="dir-toggle">
          <span class="dir-chevron" aria-hidden="true">▸</span>
          <span class="dir-name"></span>
          <span class="dir-size"></span>
        </button>
      </div>
      <ul class="dir-children"></ul>
    `;
    li.querySelector(".dir-name")!.textContent = `${node.name}/`;
    li.querySelector(".dir-size")!.textContent =
      included.length === selectable.length
        ? humanSize(selectableBytes)
        : `${humanSize(includedBytes)} of ${humanSize(selectableBytes)}`;

    const checkbox = li.querySelector<HTMLInputElement>(".proto-check")!;
    checkbox.checked = selectable.length > 0 && included.length === selectable.length;
    checkbox.indeterminate = included.length > 0 && included.length < selectable.length;
    checkbox.disabled = selectable.length === 0;
    checkbox.setAttribute("aria-label", `Include everything in ${node.path}/`);
    checkbox.addEventListener("change", () => {
      for (const f of selectable) f.checked = checkbox.checked;
      update();
    });

    const toggle = li.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const children = li.querySelector<HTMLUListElement>(".dir-children")!;
    const applyCollapsed = (): void => {
      const isCollapsed = collapsed.has(node.path);
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
      children.hidden = isCollapsed;
    };
    toggle.addEventListener("click", () => {
      if (collapsed.has(node.path)) collapsed.delete(node.path);
      else collapsed.add(node.path);
      applyCollapsed();
    });
    applyCollapsed();

    renderNode(node, children);
    return li;
  }

  function renderNode(node: TreeNode, container: HTMLUListElement): void {
    for (const entry of node.files) {
      const path = [entry.relativePath, entry.file.name].filter(Boolean).join("/");
      const state = byPath.get(path);
      if (state) container.appendChild(renderFileRow(state));
    }
    for (const child of node.dirs.values()) {
      container.appendChild(renderDirRow(child));
    }
  }

  function update(): void {
    const summary = getSummary();
    toolbar.querySelector('[data-role="sel-files"]')!.textContent =
      `${summary.selectedFiles} of ${summary.totalFiles} files`;
    toolbar.querySelector('[data-role="sel-bytes"]')!.textContent = humanSize(summary.selectedBytes);
    toolbar.querySelector('[data-role="of-bytes"]')!.textContent = `of ${humanSize(summary.totalBytes)}`;
    renderChips();
    list.replaceChildren();
    renderNode(buildTree(opts.entries), list);
    opts.onSummary?.(summary);
  }

  toolbar.querySelector('[data-role="select-all"]')!.addEventListener("click", () => {
    for (const f of files) if (f.ignoredBy === null) f.checked = true;
    update();
  });
  toolbar.querySelector('[data-role="select-none"]')!.addEventListener("click", () => {
    for (const f of files) f.checked = false;
    update();
  });

  applyPatterns();
  update();
  return { el: root, getSummary };
}
