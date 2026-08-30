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

  it("keeps the base folder segment from webkitRelativePath on folder picks", () => {
    const { folderInput, onFolder } = setup();
    const top = withRelativePath(new File(["x"], "notes.txt"), "myfolder/notes.txt");
    const nested = withRelativePath(new File(["x"], "clip.mp4"), "myfolder/sub/clip.mp4");
    setInputFiles(folderInput, [top, nested]);
    folderInput.dispatchEvent(new Event("change"));
    expect(acceptedFolder(onFolder)).toEqual({
      folderName: "myfolder",
      entries: [
        { file: top, relativePath: "myfolder" },
        { file: nested, relativePath: "myfolder/sub" },
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
    expect(acceptedFolder(onFolder).entries).toEqual([{ file: keep, relativePath: "base/data" }]);
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

  it("does nothing on a change event that carries no files", () => {
    const { folderInput, reject, onFolder } = setup();
    setInputFiles(folderInput, []);
    folderInput.dispatchEvent(new Event("change"));
    expect(onFolder).not.toHaveBeenCalled();
    expect(reject.hidden).toBe(true);
  });

  it("keeps a click on the hidden input itself from bubbling into another picker open", () => {
    const { folderInput } = setup();
    const click = vi.spyOn(folderInput, "click").mockImplementation(() => {});
    // The input's own (synthetic) click bubbles up through the dropzone; stopPropagation must
    // keep the dropzone's click handler from opening a second picker on top.
    folderInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(click).not.toHaveBeenCalled();
  });

  it("accepts files without any webkitRelativePath as a nameless base folder", () => {
    const { folderInput, onFolder } = setup();
    // A genuine File has webkitRelativePath === "" unless the picker filled it in.
    const loose = new File(["x"], "clip.mp4");
    setInputFiles(folderInput, [loose]);
    folderInput.dispatchEvent(new Event("change"));
    expect(acceptedFolder(onFolder)).toEqual({ folderName: "", entries: [{ file: loose, relativePath: "" }] });
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

  it("walks a dropped folder recursively, keeping its own name as the base and skipping ignored names", async () => {
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
      "session1/clip.mp4",
      "session1/sub/trace.csv",
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

    // The two halves sit on their own lines, separated by a <br><br> gap...
    expect(reject.querySelectorAll("br")).toHaveLength(2);
    expect(reject.childNodes[0].textContent).toBe("Individual files can't be uploaded on their own.");
    expect(reject.childNodes[3].textContent).toBe("Drop the folder that contains them instead.");
    // ...built from real nodes, so the prose is never parsed as markup.
    expect(reject.querySelectorAll("*")).toHaveLength(2);
  });

  it("replaces the previous rejection message instead of appending to it", async () => {
    const { dz, folderInput, reject } = setup();
    // Rejecting twice in a row has to swap the message out: the renderer now appends nodes, so
    // a missing reset would leave both messages (and four <br>s) stacked in the slot.
    dz.dispatchEvent(dropEvent(itemsFor([fileEntry("clip.mp4")])));
    await vi.waitFor(() => expect(reject.textContent).toContain("Individual files"));

    setInputFiles(folderInput, [withRelativePath(new File(["x"], ".DS_Store"), "base/.DS_Store")]);
    folderInput.dispatchEvent(new Event("change"));

    expect(reject.textContent).toBe("That folder contains no uploadable files.");
    expect(reject.querySelectorAll("br")).toHaveLength(0);
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

  it("ignores a drop event without a DataTransfer entirely", async () => {
    const { dz, reject, onFolder } = setup();
    dz.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onFolder).not.toHaveBeenCalled();
    expect(reject.hidden).toBe(true);
  });

  it("ignores non-file items (e.g. dragged text) when resolving the dropped folder", async () => {
    const { dz, onFolder } = setup();
    const folder = dirEntry("session1", [fileEntry("a.txt")]);
    const items = [
      { kind: "string", webkitGetAsEntry: () => null },
      { kind: "file", webkitGetAsEntry: () => folder },
    ];
    dz.dispatchEvent(dropEvent({ items, files: [] }));

    await vi.waitFor(() => expect(onFolder).toHaveBeenCalled());
    expect(acceptedFolder(onFolder).folderName).toBe("session1");
  });

  it("skips entries that are neither files nor directories while walking", async () => {
    const { dz, onFolder } = setup();
    const oddity = { name: "socket", isFile: false, isDirectory: false } as unknown as FakeFileEntry;
    const tree = dirEntry("session1", [oddity, fileEntry("a.txt")]);
    dz.dispatchEvent(dropEvent(itemsFor([tree])));

    await vi.waitFor(() => expect(onFolder).toHaveBeenCalled());
    expect(acceptedFolder(onFolder).entries.map((e) => e.file.name)).toEqual(["a.txt"]);
  });

  it("tolerates a base folder entry with an empty name", async () => {
    const { dz, onFolder } = setup();
    const tree = dirEntry("", [fileEntry("a.txt"), dirEntry("sub", [fileEntry("b.txt")])]);
    dz.dispatchEvent(dropEvent(itemsFor([tree])));

    await vi.waitFor(() => expect(onFolder).toHaveBeenCalled());
    const folder = acceptedFolder(onFolder);
    expect(folder.folderName).toBe("");
    expect(folder.entries.map((e) => [e.relativePath, e.file.name].filter(Boolean).join("/"))).toEqual([
      "a.txt",
      "sub/b.txt",
    ]);
  });

  it("prevents the browser's default navigation for drags that miss the dropzone", () => {
    setup();
    const dragover = new Event("dragover", { cancelable: true });
    window.dispatchEvent(dragover);
    expect(dragover.defaultPrevented).toBe(true);

    const drop = new Event("drop", { cancelable: true });
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
  });
});
