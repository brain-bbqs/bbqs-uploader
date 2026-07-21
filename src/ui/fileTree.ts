import { buildTree, countDescendants, sumSize, type DroppedFile, type TreeNode } from "../lib/fileTree";
import { humanSize } from "../lib/format";

const COLLAPSE_THRESHOLD = 30;
export const DEFAULT_EXPAND_DEPTH = 2;

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
 * `<ul>` it was placed under so callers can append a matching file row there. Folders past
 * `expandDepth` levels of nesting (or with more than 30 entries) start collapsed.
 */
export async function renderFileTree(
  root: HTMLUListElement,
  entries: DroppedFile[],
  expandDepth = DEFAULT_EXPAND_DEPTH,
): Promise<Map<File, HTMLUListElement>> {
  const targets = new Map<File, HTMLUListElement>();
  let processed = 0;

  async function renderNode(node: TreeNode, container: HTMLUListElement, depth: number): Promise<void> {
    for (const entry of node.files) targets.set(entry.file, container);
    for (const child of node.dirs.values()) {
      const count = countDescendants(child);
      const collapsed = depth > expandDepth || count > COLLAPSE_THRESHOLD;
      const size = sumSize(child);

      const li = document.createElement("li");
      li.className = "dir-item";
      li.innerHTML = `
        <button type="button" class="dir-toggle" aria-expanded="${!collapsed}" data-depth="${depth}" data-count="${count}">
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

      await renderNode(child, childUl, depth + 1);
    }
  }

  await renderNode(buildTree(entries), root, 1);
  return targets;
}

/** Re-applies a "expand down to N levels" bulk toggle to an already-rendered tree. */
export function setExpandDepth(root: HTMLUListElement, expandDepth: number): void {
  root.querySelectorAll<HTMLButtonElement>(".dir-toggle").forEach((toggle) => {
    const depth = Number(toggle.dataset.depth);
    const count = Number(toggle.dataset.count);
    const collapsed = depth > expandDepth || count > COLLAPSE_THRESHOLD;
    const childUl = toggle.nextElementSibling as HTMLUListElement;
    childUl.hidden = collapsed;
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });
}
