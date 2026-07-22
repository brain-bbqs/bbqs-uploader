import { buildTree, countDescendants, sumSize, type DroppedFile, type TreeNode } from "../lib/fileTree";
import { humanSize } from "../lib/format";

// How many sibling subfolders are revealed per folder, per sweep round (see computeExpandBudget).
export const LEVEL_CAP_STEP = 3;

// A folder holding more direct files than this always starts collapsed, independent of the
// depth/fanout budget below — that budget only paces revealing *nested subfolders*, but a
// folder's own file rows aren't gated by it at all, so a folder with, say, 10,000 files directly
// inside it would otherwise dump all 10,000 rows into the DOM's visible state the moment the
// budget reaches it.
const LEAF_FILE_THRESHOLD = 30;

export interface ExpandBudget {
  /** Folders deeper than this (1-indexed) stay collapsed, regardless of their own size. */
  depthReach: number;
  /** Only a folder's first this-many subfolders (by listed order) are auto-revealed; the rest
   * stay collapsed until the cap grows. */
  levelCap: number;
}

/**
 * Maps a single slider step to a budget where both `depthReach` and `levelCap` only ever grow as
 * `step` increases (never regress), so dragging the slider never re-hides something already
 * shown. Depth is swept first at a fixed fanout cap (step 0 reveals 1 level deep with up to
 * LEVEL_CAP_STEP subfolders each, step 1 reveals 2 levels deep, and so on); once the sweep
 * reaches the tree's full depth, further steps widen the fanout cap instead — this avoids a
 * single dominant folder (e.g. one that holds effectively the whole drop) acting as an all-or-
 * nothing gate, where nothing below it shows until the threshold clears it, and then everything
 * does at once.
 */
export function computeExpandBudget(step: number, treeDepth: number): ExpandBudget {
  if (treeDepth <= 0) return { depthReach: 0, levelCap: LEVEL_CAP_STEP };
  const depthReach = Math.min(step + 1, treeDepth);
  const widenRounds = Math.max(0, step - (treeDepth - 1));
  return { depthReach, levelCap: LEVEL_CAP_STEP * (1 + widenRounds) };
}

/** The slider step at which `computeExpandBudget` reveals every folder in a tree this deep and wide. */
export function maxExpandStep(treeDepth: number, treeFanout: number): number {
  if (treeDepth <= 0) return 0;
  const widenRoundsNeeded = Math.max(0, Math.ceil(treeFanout / LEVEL_CAP_STEP) - 1);
  return treeDepth - 1 + widenRoundsNeeded;
}

/** Short human label for a budget, shown next to the slider. */
export function describeExpandBudget(budget: ExpandBudget): string {
  return `${budget.levelCap} per folder, ${budget.depthReach} deep`;
}

// Building the DOM for a very large dropped folder (thousands of directory nodes) in one
// synchronous pass blocks the main thread long enough that the browser can't paint anything
// (including the tree itself) until it's done. Yielding back to the event loop every
// RENDER_CHUNK_SIZE nodes lets the browser interleave a paint between chunks.
const RENDER_CHUNK_SIZE = 300;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Renders a nested directory tree into `root` and returns, for each dropped file, the
 * `<ul>` it was placed under so callers can append a matching file row there. Which folders
 * start expanded is governed by `budget` — see `computeExpandBudget`.
 */
export async function renderFileTree(
  root: HTMLUListElement,
  entries: DroppedFile[],
  budget: ExpandBudget,
): Promise<Map<File, HTMLUListElement>> {
  const targets = new Map<File, HTMLUListElement>();
  let processed = 0;

  async function renderNode(
    node: TreeNode,
    container: HTMLUListElement,
    depth: number,
    parentCollapsed: boolean,
  ): Promise<void> {
    for (const entry of node.files) targets.set(entry.file, container);
    let siblingIndex = 0;
    for (const child of node.dirs.values()) {
      const count = countDescendants(child);
      const collapsed =
        parentCollapsed ||
        depth > budget.depthReach ||
        siblingIndex >= budget.levelCap ||
        child.files.length > LEAF_FILE_THRESHOLD;
      const size = sumSize(child);

      const li = document.createElement("li");
      li.className = "dir-item";
      li.innerHTML = `
        <button
          type="button"
          class="dir-toggle"
          aria-expanded="${!collapsed}"
          data-depth="${depth}"
          data-index="${siblingIndex}"
          data-files="${child.files.length}"
        >
          <span class="dir-chevron" aria-hidden="true">▸</span>
          <span class="dir-name"></span>
          <span class="dir-count">${count} item${count === 1 ? "" : "s"}</span>
          <span class="dir-size">${humanSize(size)}</span>
        </button>
        <ul class="dir-children"></ul>
      `;
      li.querySelector(".dir-name")!.textContent = `${child.name}/`;
      const childUl = li.querySelector<HTMLUListElement>(".dir-children")!;
      childUl.hidden = collapsed;
      const toggle = li.querySelector<HTMLButtonElement>(".dir-toggle")!;
      toggle.addEventListener("click", () => {
        const nowHidden = !childUl.hidden;
        childUl.hidden = nowHidden;
        toggle.setAttribute("aria-expanded", String(!nowHidden));
      });

      container.appendChild(li);
      if (++processed % RENDER_CHUNK_SIZE === 0) await yieldToMain();

      await renderNode(child, childUl, depth + 1, collapsed);
      siblingIndex++;
    }
  }

  await renderNode(buildTree(entries), root, 1, false);
  return targets;
}

/**
 * Re-applies a budget (see `computeExpandBudget`) to an already-rendered tree. Walks out-to-in
 * (root to leaves) and top-to-bottom (document/listed order) so a folder past the budget forces
 * every folder nested inside it to stay collapsed too, regardless of their own depth or position.
 */
export function setExpandBudget(root: HTMLUListElement, budget: ExpandBudget): void {
  function walk(container: HTMLUListElement, parentCollapsed: boolean): void {
    for (const li of Array.from(container.children)) {
      if (!(li instanceof HTMLLIElement) || !li.classList.contains("dir-item")) continue;
      const toggle = li.firstElementChild as HTMLButtonElement;
      const childUl = li.lastElementChild as HTMLUListElement;
      const depth = Number(toggle.dataset.depth);
      const index = Number(toggle.dataset.index);
      const fileCount = Number(toggle.dataset.files);
      const collapsed =
        parentCollapsed || depth > budget.depthReach || index >= budget.levelCap || fileCount > LEAF_FILE_THRESHOLD;
      childUl.hidden = collapsed;
      toggle.setAttribute("aria-expanded", String(!collapsed));
      walk(childUl, collapsed);
    }
  }
  walk(root, false);
}
