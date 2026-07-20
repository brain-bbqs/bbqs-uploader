// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderFileTree } from "../../src/ui/fileTree";
import type { DroppedFile } from "../../src/lib/fileTree";

function fakeFile(name: string): File {
  return new File(["x"], name);
}

describe("renderFileTree", () => {
  it("places top-level (non-nested) files directly in the root list, no dir wrapper", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "" }];
    const targets = renderFileTree(root, entries);
    expect(targets.get(entries[0].file)).toBe(root);
    expect(root.querySelectorAll(".dir-item")).toHaveLength(0);
  });

  it("collapses a subtree with more than 30 descendant entries by default, and expands on click", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 35 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "bigfolder",
    }));
    renderFileTree(root, entries);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const childUl = root.querySelector<HTMLUListElement>(".dir-children")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(childUl.hidden).toBe(true);

    toggle.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(childUl.hidden).toBe(false);
  });

  it("does not collapse a subtree with 30 or fewer descendant entries", () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 30 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "smallfolder",
    }));
    renderFileTree(root, entries);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const childUl = root.querySelector<HTMLUListElement>(".dir-children")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(childUl.hidden).toBe(false);
  });
});
