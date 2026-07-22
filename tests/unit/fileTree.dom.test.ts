// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderFileTree, setExpandCount } from "../../src/ui/fileTree";
import type { DroppedFile } from "../../src/lib/fileTree";

function fakeFile(name: string): File {
  return new File(["x"], name);
}

function toggleByName(root: HTMLUListElement, name: string): HTMLButtonElement {
  const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>(".dir-toggle"));
  return toggles.find((t) => t.querySelector(".dir-name")!.textContent === `${name}/`)!;
}

describe("renderFileTree", () => {
  it("places top-level (non-nested) files directly in the root list, no dir wrapper", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "" }];
    const targets = await renderFileTree(root, entries);
    expect(targets.get(entries[0].file)).toBe(root);
    expect(root.querySelectorAll(".dir-item")).toHaveLength(0);
  });

  it("collapses a folder with more than maxItems entries by default, and expands on click", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 35 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "bigfolder",
    }));
    await renderFileTree(root, entries, 30);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const childUl = root.querySelector<HTMLUListElement>(".dir-children")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(childUl.hidden).toBe(true);

    toggle.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(childUl.hidden).toBe(false);
  });

  it("does not collapse a folder with maxItems or fewer entries", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 30 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "smallfolder",
    }));
    await renderFileTree(root, entries, 30);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    const childUl = root.querySelector<HTMLUListElement>(".dir-children")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(childUl.hidden).toBe(false);
  });

  it("keeps a small folder collapsed if it's nested inside a folder past maxItems (out-to-in cascade)", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [
      ...Array.from({ length: 35 }, (_, i) => ({
        file: fakeFile(`file-${i}.txt`),
        relativePath: "big",
      })),
      { file: fakeFile("a.txt"), relativePath: "big/small" },
    ];
    await renderFileTree(root, entries, 30);

    expect(toggleByName(root, "big").getAttribute("aria-expanded")).toBe("false");
    // "small" only has 1 entry (well under maxItems) but its parent "big" is collapsed, so it
    // must stay collapsed too rather than being independently expanded.
    expect(toggleByName(root, "small").getAttribute("aria-expanded")).toBe("false");
  });

  it("honors a custom maxItems passed to renderFileTree", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 5 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "folder",
    }));
    await renderFileTree(root, entries, 2);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("setExpandCount", () => {
  it("re-applies a new maxItems threshold to an already-rendered tree", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 35 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "bigfolder",
    }));
    await renderFileTree(root, entries, 30);

    const toggle = root.querySelector<HTMLButtonElement>(".dir-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    setExpandCount(root, 40);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    setExpandCount(root, 10);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("re-collapses a folder the user manually expanded, if it's still nested inside a folder past maxItems", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [
      ...Array.from({ length: 35 }, (_, i) => ({
        file: fakeFile(`file-${i}.txt`),
        relativePath: "big",
      })),
      { file: fakeFile("a.txt"), relativePath: "big/small" },
    ];
    await renderFileTree(root, entries, 30);

    const smallToggle = toggleByName(root, "small");
    // Manually expand "big" (its own toggle click bypasses the threshold check) so "small"
    // becomes reachable, then manually expand "small" too.
    toggleByName(root, "big").click();
    smallToggle.click();
    expect(smallToggle.getAttribute("aria-expanded")).toBe("true");

    // Re-running the bulk threshold re-collapses "big" (still over 30 items), which must cascade
    // back down onto "small" even though "small" itself is well under the threshold.
    setExpandCount(root, 30);
    expect(toggleByName(root, "big").getAttribute("aria-expanded")).toBe("false");
    expect(smallToggle.getAttribute("aria-expanded")).toBe("false");
  });
});
