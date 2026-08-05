import { describe, expect, it } from "vitest";
import { ancestorDirPaths, createSelectionModel, matchIgnorePattern } from "../../src/lib/selection";

function fakeFile(name: string, size: number): File {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function modelWith(entries: [relativePath: string, name: string, size: number][]) {
  const model = createSelectionModel();
  const files = entries.map(([relativePath, name, size]) => {
    const file = fakeFile(name, size);
    const path = ["sourcedata/raw", relativePath, name].filter(Boolean).join("/");
    model.add(file, relativePath, path);
    return file;
  });
  return { model, files };
}

describe("matchIgnorePattern", () => {
  it("matches bare patterns against the filename alone", () => {
    expect(matchIgnorePattern(["*.tmp"], "a/b", "x.tmp")).toBe("*.tmp");
    expect(matchIgnorePattern(["*.tmp"], "a/b.tmp", "x.mp4")).toBe(null);
  });

  it("matches trailing-slash patterns against any folder segment", () => {
    expect(matchIgnorePattern(["scratch/"], "a/scratch/b", "x.mp4")).toBe("scratch/");
    expect(matchIgnorePattern(["scratch/"], "a/b", "scratch")).toBe(null);
  });

  it("matches patterns containing a slash against the full relative path", () => {
    expect(matchIgnorePattern(["sub-01/ses-*/events.csv"], "sub-01/ses-20250110", "events.csv")).toBe(
      "sub-01/ses-*/events.csv",
    );
    expect(matchIgnorePattern(["sub-01/ses-*/events.csv"], "sub-02/ses-20250110", "events.csv")).toBe(null);
  });

  it("keeps * within one path segment and supports ?", () => {
    expect(matchIgnorePattern(["sub-*/x.csv"], "sub-01/deeper", "x.csv")).toBe(null);
    expect(matchIgnorePattern(["clip-?.mp4"], "", "clip-1.mp4")).toBe("clip-?.mp4");
    expect(matchIgnorePattern(["clip-?.mp4"], "", "clip-12.mp4")).toBe(null);
  });

  it("escapes regex metacharacters in patterns", () => {
    expect(matchIgnorePattern(["a+b.txt"], "", "a+b.txt")).toBe("a+b.txt");
    expect(matchIgnorePattern(["a+b.txt"], "", "aab.txt")).toBe(null);
  });

  it("returns the first matching pattern", () => {
    expect(matchIgnorePattern(["*.log", "*.tmp"], "", "x.tmp")).toBe("*.tmp");
    expect(matchIgnorePattern(["*.tmp", "*.log"], "", "x.tmp")).toBe("*.tmp");
  });
});

describe("ancestorDirPaths", () => {
  it("lists every prefix outermost first", () => {
    expect(ancestorDirPaths("a/b/c")).toEqual(["a", "a/b", "a/b/c"]);
    expect(ancestorDirPaths("")).toEqual([]);
  });
});

describe("createSelectionModel", () => {
  it("starts every file selected and summarizes counts and bytes", () => {
    const { model } = modelWith([
      ["a", "one.mp4", 10],
      ["a/b", "two.mp4", 20],
      ["", "three.txt", 5],
    ]);
    expect(model.summary()).toEqual({ selectedFiles: 3, selectedBytes: 35, totalFiles: 3, totalBytes: 35 });
  });

  it("excludes pattern-ignored files from the summary but keeps their checked state", () => {
    const { model, files } = modelWith([
      ["a", "keep.mp4", 10],
      ["a", "junk.tmp", 20],
    ]);
    model.setPatterns(["*.tmp"]);
    expect(model.summary()).toEqual({ selectedFiles: 1, selectedBytes: 10, totalFiles: 2, totalBytes: 30 });
    expect(model.get(files[1])?.ignoredBy).toBe("*.tmp");
    model.setPatterns([]);
    expect(model.summary().selectedFiles).toBe(2);
  });

  it("ignores setChecked on ignored files", () => {
    const { model, files } = modelWith([["a", "junk.tmp", 20]]);
    model.setPatterns(["*.tmp"]);
    model.setChecked(files[0], true);
    expect(model.summary().selectedFiles).toBe(0);
  });

  it("toggles whole subtrees, skipping ignored files", () => {
    const { model } = modelWith([
      ["a", "one.mp4", 10],
      ["a/b", "two.mp4", 20],
      ["a", "junk.tmp", 5],
      ["c", "other.mp4", 40],
    ]);
    model.setPatterns(["*.tmp"]);
    const changed = model.setSubtreeChecked("a", false);
    expect(changed.map((f) => f.file.name).sort()).toEqual(["one.mp4", "two.mp4"]);
    expect(model.summary()).toEqual({ selectedFiles: 1, selectedBytes: 40, totalFiles: 4, totalBytes: 75 });
    model.setSubtreeChecked("", true);
    expect(model.summary().selectedFiles).toBe(3);
  });

  it("does not treat sibling folders with a shared prefix as one subtree", () => {
    const { model } = modelWith([
      ["sub-01", "one.mp4", 10],
      ["sub-010", "two.mp4", 20],
    ]);
    model.setSubtreeChecked("sub-01", false);
    expect(model.summary().selectedFiles).toBe(1);
    expect(model.summary().selectedBytes).toBe(20);
  });

  it("applies a remote listing: same size deselects as uploaded, mismatch stays selected as changed", () => {
    const { model, files } = modelWith([
      ["a", "same.mp4", 10],
      ["a", "different.mp4", 20],
      ["a", "new.mp4", 30],
    ]);
    model.applyRemote(
      new Map([
        ["sourcedata/raw/a/same.mp4", 10],
        ["sourcedata/raw/a/different.mp4", 19],
      ]),
    );
    expect(model.hasRemote()).toBe(true);
    expect(model.get(files[0])?.remote).toBe("uploaded");
    expect(model.get(files[0])?.checked).toBe(false);
    expect(model.get(files[1])?.remote).toBe("changed");
    expect(model.get(files[1])?.checked).toBe(true);
    expect(model.get(files[2])?.remote).toBe(null);
    expect(model.summary().selectedFiles).toBe(2);
  });

  it("clearRemote forgets the diff and re-selects files deselected as already-uploaded", () => {
    const { model, files } = modelWith([
      ["a", "same.mp4", 10],
      ["a", "new.mp4", 20],
    ]);
    model.applyRemote(new Map([["sourcedata/raw/a/same.mp4", 10]]));
    model.setChecked(files[1], false);
    model.clearRemote();
    expect(model.hasRemote()).toBe(false);
    expect(model.get(files[0])?.remote).toBe(null);
    expect(model.get(files[0])?.checked).toBe(true);
    // A manual deselection of an ordinary file survives the forget.
    expect(model.get(files[1])?.checked).toBe(false);
  });

  it("treats an empty remote listing as no diff at all (no badges to show)", () => {
    const { model, files } = modelWith([["a", "one.mp4", 10]]);
    model.applyRemote(new Map());
    expect(model.hasRemote()).toBe(false);
    expect(model.get(files[0])?.remote).toBe(null);
    expect(model.get(files[0])?.checked).toBe(true);
  });

  it("rolls up per-folder aggregates for tri-state checkboxes", () => {
    const { model, files } = modelWith([
      ["a", "one.mp4", 10],
      ["a/b", "two.mp4", 20],
      ["c", "other.mp4", 40],
    ]);
    model.setChecked(files[1], false);
    const aggregates = model.dirAggregates();
    expect(aggregates.get("a")).toEqual({
      selectable: 2,
      selected: 1,
      selectableBytes: 30,
      selectedBytes: 10,
      files: 2,
      allBytes: 30,
      uploaded: 0,
    });
    expect(aggregates.get("a/b")).toEqual({
      selectable: 1,
      selected: 0,
      selectableBytes: 20,
      selectedBytes: 0,
      files: 1,
      allBytes: 20,
      uploaded: 0,
    });
    expect(aggregates.get("c")).toEqual({
      selectable: 1,
      selected: 1,
      selectableBytes: 40,
      selectedBytes: 40,
      files: 1,
      allBytes: 40,
      uploaded: 0,
    });
  });

  it("counts already-uploaded files per folder, so fully-uploaded folders are identifiable", () => {
    const { model } = modelWith([
      ["done", "one.mp4", 10],
      ["done", "two.mp4", 20],
      ["mixed", "three.mp4", 30],
      ["mixed", "four.mp4", 40],
    ]);
    model.applyRemote(
      new Map([
        ["sourcedata/raw/done/one.mp4", 10],
        ["sourcedata/raw/done/two.mp4", 20],
        ["sourcedata/raw/mixed/three.mp4", 30],
      ]),
    );
    const aggregates = model.dirAggregates();
    expect(aggregates.get("done")?.uploaded).toBe(2);
    expect(aggregates.get("done")?.files).toBe(2);
    expect(aggregates.get("mixed")?.uploaded).toBe(1);
    expect(aggregates.get("mixed")?.files).toBe(2);
  });

  it("consumes the selected files and removes them from later summaries and toggles", () => {
    const { model, files } = modelWith([
      ["a", "one.mp4", 10],
      ["a", "two.mp4", 20],
    ]);
    model.setChecked(files[1], false);
    const batch = model.consumeSelected();
    expect(batch.map((f) => f.file.name)).toEqual(["one.mp4"]);
    expect(model.summary()).toEqual({ selectedFiles: 0, selectedBytes: 0, totalFiles: 1, totalBytes: 20 });
    model.setSubtreeChecked("", true);
    expect(model.consumeSelected().map((f) => f.file.name)).toEqual(["two.mp4"]);
  });

  it("does not re-deselect a consumed file when a remote listing arrives late", () => {
    const { model, files } = modelWith([["a", "one.mp4", 10]]);
    model.consumeSelected();
    model.applyRemote(new Map([["sourcedata/raw/a/one.mp4", 10]]));
    expect(model.get(files[0])?.remote).toBe("uploaded");
    expect(model.get(files[0])?.checked).toBe(true);
  });
});
