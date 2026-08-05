// The retained include/exclude model behind the file tree's checkboxes: which files are selected
// for upload, which are excluded by an ignore pattern, and how each compares to what the archive
// already holds. Pure state + queries; all DOM wiring lives in main.ts.

export type RemoteState = "uploaded" | "changed" | null;

export interface SelectionFile {
  file: File;
  /** Forward-slash folder path inside the picked base folder (no filename, empty at the root). */
  relativePath: string;
  /** Full sanitized archive path, e.g. "sourcedata/raw/sub-01/clip.mp4". */
  path: string;
  /** The user's include choice; overridden (not erased) while an ignore pattern matches. */
  checked: boolean;
  /** The pattern currently excluding this file, or null. */
  ignoredBy: string | null;
  /** How this file compares to the archive copy at the same path, once the listing is known. */
  remote: RemoteState;
  /** True once handed to an upload batch; consumed files leave the selectable pool for good. */
  consumed: boolean;
}

export interface SelectionSummary {
  selectedFiles: number;
  selectedBytes: number;
  totalFiles: number;
  totalBytes: number;
}

export interface DirAggregate {
  /** Files under this folder still open to selection (not ignored, not already uploaded-batch). */
  selectable: number;
  selected: number;
  selectableBytes: number;
  selectedBytes: number;
  /** Every file under this folder, selectable or not, and their total bytes. */
  files: number;
  allBytes: number;
  /** How many of those files the archive already holds unchanged (remote === "uploaded"). */
  uploaded: number;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}

// First pattern that excludes the file, or null. Three pattern shapes:
// - "name.ext" / "*.tmp"   -- matched against the filename alone
// - "scratch/"             -- matched against every folder segment of the file's path
// - "sub-01/ses-*/ev.csv"  -- containing "/": matched against the full relative path
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

/** Every ancestor folder path of a file's relativePath, outermost first ("a", "a/b", "a/b/c"). */
export function ancestorDirPaths(relativePath: string): string[] {
  const segments = relativePath.split("/").filter(Boolean);
  const paths: string[] = [];
  let prefix = "";
  for (const seg of segments) {
    prefix = prefix ? `${prefix}/${seg}` : seg;
    paths.push(prefix);
  }
  return paths;
}

export interface SelectionModel {
  add(file: File, relativePath: string, path: string): SelectionFile;
  get(file: File): SelectionFile | undefined;
  files(): SelectionFile[];
  /**
   * Whether a non-empty remote listing has been applied. An empty listing (nothing uploaded yet)
   * deliberately reads as false: with no diff to communicate, badging every row "New" is noise.
   */
  hasRemote(): boolean;
  patterns(): string[];
  /** Selection state of one file changed by the user; a no-op on ignored/consumed files. */
  setChecked(file: File, checked: boolean): void;
  /** Applies `checked` to every selectable file under `dirPath` ("" = every file). */
  setSubtreeChecked(dirPath: string, checked: boolean): SelectionFile[];
  /** Replaces the ignore patterns and recomputes every file's ignoredBy. */
  setPatterns(patterns: string[]): void;
  /**
   * Applies the archive listing (full path -> size). Same-size matches become "uploaded" and are
   * deselected (unless already consumed); size mismatches become "changed" and stay selected.
   */
  applyRemote(listing: Map<string, number>): void;
  /**
   * Forgets any applied listing: re-selects files that sat deselected as already-uploaded and
   * clears every remote mark, returning the tree to its no-diff appearance.
   */
  clearRemote(): void;
  summary(): SelectionSummary;
  /** Per-folder selected/selectable rollups for tri-state checkboxes and size labels. */
  dirAggregates(): Map<string, DirAggregate>;
  /** Hands the currently selected files to an upload batch and marks them consumed. */
  consumeSelected(): SelectionFile[];
  clear(): void;
}

export function createSelectionModel(): SelectionModel {
  const byFile = new Map<File, SelectionFile>();
  let ignorePatterns: string[] = [];
  let remoteApplied = false;

  const isSelectable = (f: SelectionFile): boolean => !f.consumed && f.ignoredBy === null;
  const isSelected = (f: SelectionFile): boolean => isSelectable(f) && f.checked;

  function applyPatternsTo(f: SelectionFile): void {
    f.ignoredBy = matchIgnorePattern(ignorePatterns, f.relativePath, f.file.name);
  }

  return {
    add(file, relativePath, path) {
      const entry: SelectionFile = {
        file,
        relativePath,
        path,
        checked: true,
        ignoredBy: null,
        remote: null,
        consumed: false,
      };
      applyPatternsTo(entry);
      byFile.set(file, entry);
      return entry;
    },
    get(file) {
      return byFile.get(file);
    },
    files() {
      return Array.from(byFile.values());
    },
    hasRemote() {
      return remoteApplied;
    },
    patterns() {
      return [...ignorePatterns];
    },
    setChecked(file, checked) {
      const f = byFile.get(file);
      if (f && isSelectable(f)) f.checked = checked;
    },
    setSubtreeChecked(dirPath, checked) {
      const changed: SelectionFile[] = [];
      for (const f of byFile.values()) {
        if (!isSelectable(f)) continue;
        const inSubtree = dirPath === "" || f.relativePath === dirPath || f.relativePath.startsWith(`${dirPath}/`);
        if (inSubtree && f.checked !== checked) {
          f.checked = checked;
          changed.push(f);
        }
      }
      return changed;
    },
    setPatterns(patterns) {
      ignorePatterns = [...patterns];
      for (const f of byFile.values()) applyPatternsTo(f);
    },
    applyRemote(listing) {
      remoteApplied = listing.size > 0;
      for (const f of byFile.values()) {
        const remoteSize = listing.get(f.path);
        f.remote = remoteSize === undefined ? null : remoteSize === f.file.size ? "uploaded" : "changed";
        if (f.remote === "uploaded" && !f.consumed) f.checked = false;
      }
    },
    clearRemote() {
      remoteApplied = false;
      for (const f of byFile.values()) {
        if (f.remote === "uploaded" && !f.consumed) f.checked = true;
        f.remote = null;
      }
    },
    summary() {
      let selectedFiles = 0;
      let selectedBytes = 0;
      let totalFiles = 0;
      let totalBytes = 0;
      for (const f of byFile.values()) {
        if (f.consumed) continue;
        totalFiles++;
        totalBytes += f.file.size;
        if (isSelected(f)) {
          selectedFiles++;
          selectedBytes += f.file.size;
        }
      }
      return { selectedFiles, selectedBytes, totalFiles, totalBytes };
    },
    dirAggregates() {
      const aggregates = new Map<string, DirAggregate>();
      for (const f of byFile.values()) {
        for (const dirPath of ancestorDirPaths(f.relativePath)) {
          let agg = aggregates.get(dirPath);
          if (!agg) {
            agg = {
              selectable: 0,
              selected: 0,
              selectableBytes: 0,
              selectedBytes: 0,
              files: 0,
              allBytes: 0,
              uploaded: 0,
            };
            aggregates.set(dirPath, agg);
          }
          agg.files++;
          agg.allBytes += f.file.size;
          if (f.remote === "uploaded") agg.uploaded++;
          if (isSelectable(f)) {
            agg.selectable++;
            agg.selectableBytes += f.file.size;
            if (f.checked) {
              agg.selected++;
              agg.selectedBytes += f.file.size;
            }
          }
        }
      }
      return aggregates;
    },
    consumeSelected() {
      const batch: SelectionFile[] = [];
      for (const f of byFile.values()) {
        if (isSelected(f)) {
          f.consumed = true;
          batch.push(f);
        }
      }
      return batch;
    },
    clear() {
      byFile.clear();
      ignorePatterns = [];
      remoteApplied = false;
    },
  };
}
