// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initDropzone, type AcceptedFolder } from "../../src/ui/dropzone";
import type { UploaderElements } from "../../src/ui/elements";

interface Harness {
  els: UploaderElements;
  dz: HTMLDivElement;
  reject: HTMLParagraphElement;
  folderInput: HTMLInputElement;
  browseFolderBtn: HTMLButtonElement;
  onFolder: ReturnType<typeof vi.fn>;
}

function setup(): Harness {
  const dz = document.createElement("div");
  const reject = document.createElement("p");
  reject.hidden = true;
  const folderInput = document.createElement("input");
  const browseFolderBtn = document.createElement("button");
  // Mirror the real layout: the button, message, and hidden input live inside the dropzone,
  // so their clicks bubble to it.
  dz.append(browseFolderBtn, reject, folderInput);
  document.body.appendChild(dz);
  const els = { dropzone: dz, dropzoneReject: reject, folderInput, browseFolderBtn } as unknown as UploaderElements;
  const onFolder = vi.fn();
  initDropzone(els, onFolder);
  return { els, dz, reject, folderInput, browseFolderBtn, onFolder };
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

function acceptedFolder(mock: ReturnType<typeof vi.fn>): AcceptedFolder {
  return mock.mock.calls[0][0] as AcceptedFolder;
}

beforeEach(() => {
  document.body.textContent = "";
});

describe("initDropzone browse wiring", () => {
  it("opens the folder picker when the dropzone itself is clicked", () => {
    const { dz, folderInput } = setup();
    const click = vi.spyOn(folderInput, "click").mockImplementation(() => {});
    dz.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("opens the folder picker exactly once from the browse button, despite bubbling", () => {
    const { browseFolderBtn, folderInput } = setup();
    const folderClick = vi.spyOn(folderInput, "click").mockImplementation(() => {});
    browseFolderBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(folderClick).toHaveBeenCalledTimes(1);
  });

  it("strips the base folder segment from webkitRelativePath on folder picks", () => {
    const { folderInput, onFolder } = setup();
    const top = withRelativePath(new File(["x"], "notes.txt"), "myfolder/notes.txt");
    const nested = withRelativePath(new File(["x"], "clip.mp4"), "myfolder/sub/clip.mp4");
    setInputFiles(folderInput, [top, nested]);
    folderInput.dispatchEvent(new Event("change"));
    expect(acceptedFolder(onFolder)).toEqual({
      folderName: "myfolder",
      entries: [
        { file: top, relativePath: "" },
        { file: nested, relativePath: "sub" },
      ],
    });
    expect(folderInput.value).toBe("");
  });

  it("filters out OS junk files and everything inside ignored folders", () => {
    const { folderInput, onFolder } = setup();
    const keep = withRelativePath(new File(["x"], "clip.mp4"), "base/data/clip.mp4");
    const junk = withRelativePath(new File(["x"], ".DS_Store"), "base/data/.DS_Store");
    const cached = withRelativePath(new File(["x"], "mod.pyc"), "base/data/mod.pyc");
    const inGit = withRelativePath(new File(["x"], "config"), "base/data/.git/config");
    setInputFiles(folderInput, [keep, junk, cached, inGit]);
    folderInput.dispatchEvent(new Event("change"));
    expect(acceptedFolder(onFolder).entries).toEqual([{ file: keep, relativePath: "data" }]);
  });

  it("rejects a picked folder whose every file is filtered out", () => {
    const { folderInput, reject, onFolder } = setup();
    const junk = withRelativePath(new File(["x"], ".DS_Store"), "base/.DS_Store");
    setInputFiles(folderInput, [junk]);
    folderInput.dispatchEvent(new Event("change"));
    expect(onFolder).not.toHaveBeenCalled();
    expect(reject.hidden).toBe(false);
    expect(reject.textContent).toContain("no uploadable files");
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

  it("walks a dropped folder recursively, stripping its own name and skipping ignored names", async () => {
    const { dz, onFolder } = setup();
    const tree = dirEntry("session1", [
      fileEntry("clip.mp4"),
      fileEntry(".DS_Store"),
      dirEntry(".git", [fileEntry("config")]),
      dirEntry("sub", [fileEntry("trace.csv")]),
    ]);
    dz.dispatchEvent(dropEvent(itemsFor([tree])));

    await vi.waitFor(() => expect(onFolder).toHaveBeenCalled());
    const folder = acceptedFolder(onFolder);
    expect(folder.folderName).toBe("session1");
    expect(folder.entries.map((e) => [e.relativePath, e.file.name].filter(Boolean).join("/"))).toEqual([
      "clip.mp4",
      "sub/trace.csv",
    ]);
  });

  it("accepts only the first folder when several things are dropped together", async () => {
    const { dz, onFolder } = setup();
    const first = dirEntry("one", [fileEntry("a.txt")]);
    const second = dirEntry("two", [fileEntry("b.txt")]);
    dz.dispatchEvent(dropEvent(itemsFor([fileEntry("loose.txt"), first, second])));

    await vi.waitFor(() => expect(onFolder).toHaveBeenCalled());
    expect(acceptedFolder(onFolder).folderName).toBe("one");
    expect(acceptedFolder(onFolder).entries.map((e) => e.file.name)).toEqual(["a.txt"]);
  });

  it("rejects a drop of loose files with an explanation instead of queueing them", async () => {
    const { dz, reject, onFolder } = setup();
    dz.dispatchEvent(dropEvent(itemsFor([fileEntry("clip.mp4"), fileEntry("notes.txt")])));

    await vi.waitFor(() => expect(reject.hidden).toBe(false));
    expect(onFolder).not.toHaveBeenCalled();
    expect(reject.textContent).toContain("Drop the folder that contains them");
  });

  it("clears the rejection message once a folder is accepted", async () => {
    const { dz, reject, onFolder } = setup();
    dz.dispatchEvent(dropEvent(itemsFor([fileEntry("clip.mp4")])));
    await vi.waitFor(() => expect(reject.hidden).toBe(false));

    dz.dispatchEvent(dropEvent(itemsFor([dirEntry("session1", [fileEntry("a.txt")])])));
    await vi.waitFor(() => expect(onFolder).toHaveBeenCalled());
    expect(reject.hidden).toBe(true);
  });

  it("rejects drops in browsers without webkitGetAsEntry support", async () => {
    const { dz, reject, onFolder } = setup();
    const file = new File(["x"], "clip.mp4");
    dz.dispatchEvent(dropEvent({ items: [{ kind: "file" }], files: [file] }));

    await vi.waitFor(() => expect(reject.hidden).toBe(false));
    expect(onFolder).not.toHaveBeenCalled();
    expect(reject.textContent).toContain("browse button");
  });

  it("ignores a drop that yields no items at all", async () => {
    const { dz, reject, onFolder } = setup();
    dz.dispatchEvent(dropEvent({ items: [], files: [] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onFolder).not.toHaveBeenCalled();
    expect(reject.hidden).toBe(true);
  });
});
