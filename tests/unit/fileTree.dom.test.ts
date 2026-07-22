// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderFileTree, setExpandBudget, computeExpandBudget, maxExpandStep } from "../../src/ui/fileTree";
import type { DroppedFile } from "../../src/lib/fileTree";

function fakeFile(name: string): File {
  return new File(["x"], name);
}

function toggleByName(root: HTMLUListElement, name: string): HTMLButtonElement {
  const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>(".dir-toggle"));
  return toggles.find((t) => t.querySelector(".dir-name")!.textContent === `${name}/`)!;
}

describe("computeExpandBudget", () => {
  it("sweeps depth first at the base fanout cap", () => {
    expect(computeExpandBudget(0, 5)).toEqual({ depthReach: 1, levelCap: 3 });
    expect(computeExpandBudget(1, 5)).toEqual({ depthReach: 2, levelCap: 3 });
    expect(computeExpandBudget(4, 5)).toEqual({ depthReach: 5, levelCap: 3 });
  });

  it("widens the fanout cap only once the depth sweep is exhausted, without regressing depth", () => {
    expect(computeExpandBudget(5, 5)).toEqual({ depthReach: 5, levelCap: 6 });
    expect(computeExpandBudget(6, 5)).toEqual({ depthReach: 5, levelCap: 9 });
  });

  it("is a no-op depth for a tree with no subfolders", () => {
    expect(computeExpandBudget(0, 0)).toEqual({ depthReach: 0, levelCap: 3 });
  });
});

describe("maxExpandStep", () => {
  it("is zero for a tree with no subfolders", () => {
    expect(maxExpandStep(0, 0)).toBe(0);
  });

  it("covers the depth sweep plus however many widen rounds the widest folder needs", () => {
    // depth 3, fanout 7: 2 steps to sweep depth (0..2), then ceil(7/3)-1 = 2 more widen steps.
    expect(maxExpandStep(3, 7)).toBe(4);
    expect(computeExpandBudget(4, 3)).toEqual({ depthReach: 3, levelCap: 9 });
  });
});

describe("renderFileTree", () => {
  it("places top-level (non-nested) files directly in the root list, no dir wrapper", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "" }];
    const targets = await renderFileTree(root, entries, computeExpandBudget(0, 0));
    expect(targets.get(entries[0].file)).toBe(root);
    expect(root.querySelectorAll(".dir-item")).toHaveLength(0);
  });

  it("shows every sibling folder's row, but only auto-expands the first levelCap of them", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = ["a", "b", "c", "d", "e"].map((name) => ({
      file: fakeFile(`${name}.txt`),
      relativePath: name,
    }));
    await renderFileTree(root, entries, { depthReach: 1, levelCap: 3 });

    // All 5 folder rows exist and are individually clickable...
    expect(root.querySelectorAll(".dir-toggle")).toHaveLength(5);
    // ...but only the first 3 (by listed order) start with their contents expanded.
    expect(toggleByName(root, "a").getAttribute("aria-expanded")).toBe("true");
    expect(toggleByName(root, "b").getAttribute("aria-expanded")).toBe("true");
    expect(toggleByName(root, "c").getAttribute("aria-expanded")).toBe("true");
    expect(toggleByName(root, "d").getAttribute("aria-expanded")).toBe("false");
    expect(toggleByName(root, "e").getAttribute("aria-expanded")).toBe("false");

    // A folder past the cap can still be expanded manually.
    const dToggle = toggleByName(root, "d");
    dToggle.click();
    expect(dToggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("collapses folders past depthReach regardless of fanout", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [{ file: fakeFile("a.txt"), relativePath: "l1/l2/l3" }];
    await renderFileTree(root, entries, { depthReach: 2, levelCap: 3 });

    expect(toggleByName(root, "l1").getAttribute("aria-expanded")).toBe("true");
    expect(toggleByName(root, "l2").getAttribute("aria-expanded")).toBe("true");
    expect(toggleByName(root, "l3").getAttribute("aria-expanded")).toBe("false");
  });

  it("collapses a folder with more than 30 direct files, regardless of budget", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = Array.from({ length: 35 }, (_, i) => ({
      file: fakeFile(`file-${i}.txt`),
      relativePath: "bigfolder",
    }));
    // A generous budget (deep, wide) still doesn't auto-reveal 35 file rows at once.
    await renderFileTree(root, entries, { depthReach: 5, levelCap: 100 });

    const toggle = toggleByName(root, "bigfolder");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps a folder collapsed if it's nested inside a folder past levelCap (out-to-in cascade)", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [
      ...["a", "b", "c", "d"].map((name) => ({ file: fakeFile(`${name}.txt`), relativePath: name })),
      { file: fakeFile("x.txt"), relativePath: "d/sub" },
    ];
    await renderFileTree(root, entries, { depthReach: 5, levelCap: 3 });

    expect(toggleByName(root, "d").getAttribute("aria-expanded")).toBe("false");
    // "sub" is well within depthReach and would be within levelCap among its own single sibling,
    // but its parent "d" is past levelCap, so it must stay collapsed too.
    expect(toggleByName(root, "sub").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("setExpandBudget", () => {
  it("re-applies a wider budget to an already-rendered tree without regressing shown folders", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = ["a", "b", "c", "d"].map((name) => ({
      file: fakeFile(`${name}.txt`),
      relativePath: name,
    }));
    await renderFileTree(root, entries, { depthReach: 1, levelCap: 3 });

    expect(toggleByName(root, "d").getAttribute("aria-expanded")).toBe("false");

    setExpandBudget(root, { depthReach: 1, levelCap: 6 });
    expect(toggleByName(root, "d").getAttribute("aria-expanded")).toBe("true");

    setExpandBudget(root, { depthReach: 1, levelCap: 1 });
    expect(toggleByName(root, "a").getAttribute("aria-expanded")).toBe("true");
    expect(toggleByName(root, "b").getAttribute("aria-expanded")).toBe("false");
    expect(toggleByName(root, "d").getAttribute("aria-expanded")).toBe("false");
  });

  it("re-collapses a folder the user manually expanded, if it's still nested inside a folder past levelCap", async () => {
    const root = document.createElement("ul");
    const entries: DroppedFile[] = [
      ...["a", "b", "c", "d"].map((name) => ({ file: fakeFile(`${name}.txt`), relativePath: name })),
      { file: fakeFile("x.txt"), relativePath: "d/sub" },
    ];
    await renderFileTree(root, entries, { depthReach: 5, levelCap: 3 });

    const subToggle = toggleByName(root, "sub");
    // Manually expand "d" (its own toggle click bypasses the cap check) so "sub" becomes
    // reachable, then manually expand "sub" too.
    toggleByName(root, "d").click();
    subToggle.click();
    expect(subToggle.getAttribute("aria-expanded")).toBe("true");

    // Re-running the bulk budget re-collapses "d" (still past levelCap), which must cascade back
    // down onto "sub" even though "sub" itself is well within the budget.
    setExpandBudget(root, { depthReach: 5, levelCap: 3 });
    expect(toggleByName(root, "d").getAttribute("aria-expanded")).toBe("false");
    expect(subToggle.getAttribute("aria-expanded")).toBe("false");
  });
});
