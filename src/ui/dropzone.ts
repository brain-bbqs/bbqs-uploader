import type { UploaderElements } from "./elements";
import type { DroppedFile } from "../lib/fileTree";

const IGNORED_NAMES = new Set([
  ".git",
  ".datalad",
  ".git-annex",
  ".noannex",
  // Device-specific / OS-generated files and folders that shouldn't be uploaded.
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
  ".TemporaryItems",
  ".apdisk",
  ".VolumeIcon.icns",
  ".com.apple.timemachine.donotpresent",
  ".AppleDouble",
  ".AppleDB",
  "$RECYCLE.BIN",
  "System Volume Information",
  // Python cache/tooling artifacts, common among the project's many Python-using uploaders.
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".ipynb_checkpoints",
]);
const IGNORED_NAME_PATTERNS = [/^\._/, /^\.Trash-/, /\.pyc$/, /\.pyo$/];

function isIgnoredName(name: string): boolean {
  return IGNORED_NAMES.has(name) || IGNORED_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

interface FileSystemEntryLike {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  isFile: true;
  file(success: (file: File) => void, error?: (err: unknown) => void): void;
}

interface FileSystemDirectoryReaderLike {
  readEntries(success: (entries: FileSystemEntryLike[]) => void, error?: (err: unknown) => void): void;
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  isDirectory: true;
  createReader(): FileSystemDirectoryReaderLike;
}

/** A base folder accepted by the dropzone: its name plus every (non-ignored) file inside it. */
export interface AcceptedFolder {
  folderName: string;
  entries: DroppedFile[];
}

// A blank line (\n\n) renders as <br><br> — see showReject. Splitting the "what went wrong" and
// "what to do instead" halves onto their own lines keeps the fix visible at a glance.
const REJECT_LOOSE_FILES =
  "Individual files can't be uploaded on their own.\n\nDrop the folder that contains them instead.";
const REJECT_UNSUPPORTED_DROP = "This browser can't read dropped folders; use the browse button instead.";
const REJECT_EMPTY_FOLDER = "That folder contains no uploadable files.";

function readAllEntries(reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntryLike[] = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (!entries.length) {
          resolve(all);
          return;
        }
        all.push(...entries);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function walkEntry(entry: FileSystemEntryLike, relativeDir: string, out: DroppedFile[]): Promise<void> {
  if (isIgnoredName(entry.name)) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntryLike).file(resolve, reject));
    out.push({ file, relativePath: relativeDir });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntryLike;
    const children = await readAllEntries(dirEntry.createReader());
    const nextDir = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    for (const child of children) {
      await walkEntry(child, nextDir, out);
    }
  }
}

/**
 * Resolves a drop to the single base folder it carries, or null when it holds no folder at all
 * (loose files only, or a browser without webkitGetAsEntry). The base folder's own name is the
 * first segment of every returned relativePath — its contents land under
 * sourcedata/raw/<folderName>/ — and anything dropped alongside the folder is ignored.
 */
async function collectDroppedFolder(dataTransfer: DataTransfer): Promise<AcceptedFolder | null> {
  const entries = Array.from(dataTransfer.items)
    // The DOM types declare webkitGetAsEntry unconditionally, but older browsers genuinely
    // lack it, and without it a drop can't be told apart from loose files — so it's rejected.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    .map((item) => (item.kind === "file" ? (item.webkitGetAsEntry?.() as FileSystemEntryLike | null) : null))
    .filter((e): e is FileSystemEntryLike => !!e);
  const folder = entries.find((e) => e.isDirectory) as FileSystemDirectoryEntryLike | undefined;
  if (!folder || isIgnoredName(folder.name)) return null;
  const out: DroppedFile[] = [];
  for (const child of await readAllEntries(folder.createReader())) {
    await walkEntry(child, folder.name, out);
  }
  return { folderName: folder.name, entries: out };
}

/**
 * Resolves a webkitdirectory picker's FileList to the picked base folder. webkitRelativePath
 * carries the folder structure as "base/sub/clip.mp4"; the base segment names the folder and is
 * kept as the first segment of every relativePath, matching the drag-and-drop path above.
 */
function folderFromFileList(fileList: FileList): AcceptedFolder {
  const entries: DroppedFile[] = [];
  let folderName = "";
  for (const file of Array.from(fileList)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const segments = rel.split("/").filter(Boolean);
    if (!folderName && segments.length > 1) folderName = segments[0];
    const dirSegments = segments.slice(0, -1);
    if (isIgnoredName(file.name) || segments.slice(0, -1).some((s) => isIgnoredName(s))) continue;
    entries.push({ file, relativePath: dirSegments.join("/") });
  }
  return { folderName, entries };
}

export function initDropzone(els: UploaderElements, onFolder: (folder: AcceptedFolder) => void): void {
  const dz = els.dropzone;

  /**
   * Renders `message` into the reject slot, turning each blank line into a <br><br> gap. The
   * breaks are appended as real elements and the prose as text nodes, so no part of `message`
   * is ever parsed as markup — the messages are static today, but this keeps a future caller
   * from turning a dynamic string (an API error, a filename) into an XSS vector. See SECURITY.md.
   */
  function showReject(message: string): void {
    const el = els.dropzoneReject;
    el.textContent = "";
    message.split("\n\n").forEach((paragraph, i) => {
      if (i) el.append(document.createElement("br"), document.createElement("br"));
      el.append(paragraph);
    });
    el.hidden = false;
  }

  function accept(folder: AcceptedFolder): void {
    if (!folder.entries.length) {
      showReject(REJECT_EMPTY_FOLDER);
      return;
    }
    els.dropzoneReject.hidden = true;
    onFolder(folder);
  }

  // The dropzone accepts exactly one thing — a folder — so clicking anywhere on it opens the
  // folder picker; stopPropagation keeps the browse button's own click (and the synthetic click
  // bubbling back out of the hidden input) from opening a second picker on top.
  dz.addEventListener("click", () => els.folderInput.click());
  els.browseFolderBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    els.folderInput.click();
  });
  els.folderInput.addEventListener("click", (e) => e.stopPropagation());
  els.folderInput.addEventListener("change", () => {
    if (els.folderInput.files?.length) accept(folderFromFileList(els.folderInput.files));
    els.folderInput.value = "";
  });
  ["dragenter", "dragover"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    }),
  );
  ["dragleave", "drop"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
    }),
  );
  dz.addEventListener("drop", (e) => {
    if (!e.dataTransfer) return;
    // DataTransfer items are only readable synchronously during the event; snapshot what the
    // rejection message needs before the async folder walk starts.
    const hadItems = e.dataTransfer.items.length > 0 || e.dataTransfer.files.length > 0;
    const hasEntrySupport = Array.from(e.dataTransfer.items).some(
      (item) => typeof item.webkitGetAsEntry === "function",
    );
    void collectDroppedFolder(e.dataTransfer).then((folder) => {
      if (folder) {
        accept(folder);
      } else if (hadItems) {
        showReject(hasEntrySupport ? REJECT_LOOSE_FILES : REJECT_UNSUPPORTED_DROP);
      }
    });
  });
  // Prevent the browser from navigating away when a drop misses the dropzone.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}
