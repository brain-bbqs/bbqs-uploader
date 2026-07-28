// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initDropzone } from "../../src/ui/dropzone";
import type { UploaderElements } from "../../src/ui/elements";
import type { DroppedFile } from "../../src/lib/fileTree";

interface Harness {
  els: UploaderElements;
  dz: HTMLDivElement;
  fileInput: HTMLInputElement;
  folderInput: HTMLInputElement;
  browseFilesBtn: HTMLButtonElement;
  browseFolderBtn: HTMLButtonElement;
  addFiles: ReturnType<typeof vi.fn>;
}

function setup(): Harness {
  const dz = document.createElement("div");
  const fileInput = document.createElement("input");
  const folderInput = document.createElement("input");
  const browseFilesBtn = document.createElement("button");
  const browseFolderBtn = document.createElement("button");
  // Mirror the real layout: the buttons and hidden inputs live inside the dropzone,
  // so their clicks bubble to it.
  dz.append(browseFilesBtn, browseFolderBtn, fileInput, folderInput);
  document.body.appendChild(dz);
  const els = { dropzone: dz, fileInput, folderInput, browseFilesBtn, browseFolderBtn } as unknown as UploaderElements;
  const addFiles = vi.fn();
  initDropzone(els, addFiles);
  return { els, dz, fileInput, folderInput, browseFilesBtn, browseFolderBtn, addFiles };
}

function setInputFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, "files", { value: files, configurable: true });
}

function withRelativePath(file: File, rel: string): File {
  Object.defineProperty(file, "webkitRelativePath", { value: rel, configurable: true });
  return file;
}

function dropEvent(dataTransfer: unknown): Event {
  const e = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: dataTransfer });
  return e;
}

interface FakeFileEntry {
  name: string;
  isFile: true;
  isDirectory: false;
  file(success: (file: File) => void): void;
}

interface FakeDirEntry {
  name: string;
  isFile: false;
  isDirectory: true;
  createReader(): { readEntries(success: (entries: (FakeFileEntry | FakeDirEntry)[]) => void): void };
}

function fileEntry(name: string): FakeFileEntry {
  return { name, isFile: true, isDirectory: false, file: (success) => success(new File(["x"], name)) };
}

function dirEntry(name: string, children: (FakeFileEntry | FakeDirEntry)[]): FakeDirEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      // Real directory readers hand out entries in batches, ending with an empty one.
      const batches = [children, []];
      return { readEntries: (success) => success(batches.shift() ?? []) };
    },
  };
}

function itemsFor(entries: (FakeFileEntry | FakeDirEntry | null)[]): unknown {
  return { items: entries.map((e) => ({ kind: "file", webkitGetAsEntry: () => e })), files: [] };
}

beforeEach(() => {
  document.body.textContent = "";
});

describe("initDropzone browse wiring", () => {
  it("opens the file picker when the dropzone itself is clicked", () => {
    const { dz, fileInput } = setup();
    const click = vi.spyOn(fileInput, "click").mockImplementation(() => {});
    dz.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("opens only the folder picker from the folder button, despite bubbling", () => {
    const { browseFolderBtn, fileInput, folderInput } = setup();
    const fileClick = vi.spyOn(fileInput, "click").mockImplementation(() => {});
    const folderClick = vi.spyOn(folderInput, "click").mockImplementation(() => {});
    browseFolderBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(folderClick).toHaveBeenCalledTimes(1);
    expect(fileClick).not.toHaveBeenCalled();
  });

  it("passes picked flat files to addFiles and resets the input for re-picking", () => {
    const { fileInput, addFiles } = setup();
    const file = new File(["x"], "clip.mp4");
    setInputFiles(fileInput, [file]);
    fileInput.dispatchEvent(new Event("change"));
    expect(addFiles).toHaveBeenCalledWith([{ file, relativePath: "" }]);
    expect(fileInput.value).toBe("");
  });

  it("derives folder structure from webkitRelativePath on folder picks", () => {
    const { folderInput, addFiles } = setup();
    const file = withRelativePath(new File(["x"], "clip.mp4"), "myfolder/sub/clip.mp4");
    setInputFiles(folderInput, [file]);
    folderInput.dispatchEvent(new Event("change"));
    expect(addFiles).toHaveBeenCalledWith([{ file, relativePath: "myfolder/sub" }]);
  });

  it("filters out OS junk files and everything inside ignored folders", () => {
    const { folderInput, addFiles } = setup();
    const keep = withRelativePath(new File(["x"], "clip.mp4"), "data/clip.mp4");
    const junk = withRelativePath(new File(["x"], ".DS_Store"), "data/.DS_Store");
    const cached = withRelativePath(new File(["x"], "mod.pyc"), "data/mod.pyc");
    const inGit = withRelativePath(new File(["x"], "config"), "data/.git/config");
    setInputFiles(folderInput, [keep, junk, cached, inGit]);
    folderInput.dispatchEvent(new Event("change"));
    expect(addFiles).toHaveBeenCalledWith([{ file: keep, relativePath: "data" }]);
  });
});

describe("initDropzone drag & drop", () => {
  it("toggles the dragover styling across the drag lifecycle", () => {
    const { dz } = setup();
    dz.dispatchEvent(new Event("dragenter", { cancelable: true }));
    expect(dz.classList.contains("dragover")).toBe(true);
    dz.dispatchEvent(new Event("dragleave", { cancelable: true }));
    expect(dz.classList.contains("dragover")).toBe(false);
  });

  it("walks dropped directory entries recursively, skipping ignored names", async () => {
    const { dz, addFiles } = setup();
    const tree = dirEntry("session1", [
      fileEntry("clip.mp4"),
      fileEntry(".DS_Store"),
      dirEntry(".git", [fileEntry("config")]),
      dirEntry("sub", [fileEntry("trace.csv")]),
    ]);
    dz.dispatchEvent(dropEvent(itemsFor([tree])));

    await vi.waitFor(() => expect(addFiles).toHaveBeenCalled());
    const entries = addFiles.mock.calls[0][0] as DroppedFile[];
    expect(entries.map((e) => `${e.relativePath}/${e.file.name}`)).toEqual([
      "session1/clip.mp4",
      "session1/sub/trace.csv",
    ]);
  });

  it("falls back to flat dataTransfer.files when entries are unavailable", async () => {
    const { dz, addFiles } = setup();
    const file = new File(["x"], "clip.mp4");
    dz.dispatchEvent(dropEvent({ items: [], files: [file] }));

    await vi.waitFor(() => expect(addFiles).toHaveBeenCalled());
    expect(addFiles).toHaveBeenCalledWith([{ file, relativePath: "" }]);
  });

  it("ignores a drop that yields no files at all", async () => {
    const { dz, addFiles } = setup();
    dz.dispatchEvent(dropEvent({ items: [], files: [] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(addFiles).not.toHaveBeenCalled();
  });
});
