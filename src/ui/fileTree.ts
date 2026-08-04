import { buildTree, sumSize, type DroppedFile, type TreeNode } from "../lib/fileTree";
import { humanSize } from "../lib/format";

export const DEFAULT_REVEAL_COUNT = 30;

// Building the DOM for a very large dropped folder (thousands of directory nodes) in one
// synchronous pass blocks the main thread long enough that the browser can't paint anything
// (including the tree itself) until it's done. Yielding back to the event loop every
// RENDER_CHUNK_SIZE nodes lets the browser interleave a paint between chunks.
const RENDER_CHUNK_SIZE = 300;

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** The per-folder controls a rendered directory row exposes for selection wiring. */
export interface DirRowEls {
  checkbox: HTMLInputElement;
  sizeEl: HTMLSpanElement;
}

export interface RenderedFileTree {
  /** For each dropped file, the `<ul>` it was placed under, to append a matching file row to. */
  targets: Map<File, HTMLUListElement>;
  /** Each rendered directory's checkbox and size label, keyed by its slash-joined folder path. */
  dirs: Map<string, DirRowEls>;
}

/**
 * Renders a nested directory tree into `root`. Every directory row is always shown (expanded,
 * with its own tri-state include checkbox, name, and size); which *file* rows are visible is
 * decided separately by `setRevealCount`, which the caller should run once it has appended its
 * file rows. `onDirCheckbox` fires when a folder's checkbox is toggled — keeping the checkbox's
 * tri-state and the size label in step with the selection is the caller's job (via `dirs`).
 */
export async function renderFileTree(
  root: HTMLUListElement,
  entries: DroppedFile[],
  onDirCheckbox?: (dirPath: string, checked: boolean) => void,
): Promise<RenderedFileTree> {
  const targets = new Map<File, HTMLUListElement>();
  const dirs = new Map<string, DirRowEls>();
  let processed = 0;

  async function renderNode(node: TreeNode, container: HTMLUListElement): Promise<void> {
    for (const entry of node.files) targets.set(entry.file, container);
    for (const child of node.dirs.values()) {
      const size = sumSize(child);

      const li = document.createElement("li");
      li.className = "dir-item";
      li.innerHTML = `
        <div class="dir-row">
          <input type="checkbox" class="select-check" checked />
          <button type="button" class="dir-toggle" aria-expanded="true">
            <span class="dir-chevron" aria-hidden="true">▸</span>
            <span class="dir-name"></span>
            <span class="dir-size">${humanSize(size)}</span>
          </button>
        </div>
        <ul class="dir-children"></ul>
      `;
      li.querySelector(".dir-name")!.textContent = `${child.name}/`;
      const childUl = li.querySelector<HTMLUListElement>(".dir-children")!;
      const toggle = li.querySelector<HTMLButtonElement>(".dir-toggle")!;
      toggle.addEventListener("click", () => {
        const nowHidden = !childUl.hidden;
        childUl.hidden = nowHidden;
        toggle.setAttribute("aria-expanded", String(!nowHidden));
      });
      const checkbox = li.querySelector<HTMLInputElement>(".select-check")!;
      checkbox.setAttribute("aria-label", `Include everything in ${child.path}/`);
      checkbox.addEventListener("change", () => onDirCheckbox?.(child.path, checkbox.checked));
      dirs.set(child.path, { checkbox, sizeEl: li.querySelector<HTMLSpanElement>(".dir-size")! });

      container.appendChild(li);
      if (++processed % RENDER_CHUNK_SIZE === 0) await yieldToMain();

      await renderNode(child, childUl);
    }
  }

  await renderNode(buildTree(entries), root);
  return { targets, dirs };
}

/**
 * Reveals exactly `revealCount` file rows in total across the whole rendered tree (or every row,
 * if there are fewer), handing out the slots one file at a time round-robin across directories in
 * breadth-first order: each directory in turn shows its first file, then each its second, and so
 * on — so a single huge folder can't consume all the slots before its siblings get any. Directory
 * rows themselves don't consume slots (they're always shown), and every directory still holding
 * hidden files gets a free "… N more files" placeholder row so the truncation is visible.
 */
export function setRevealCount(root: HTMLUListElement, revealCount: number): void {
  // Breadth-first list of every directory container, starting with the root list itself (which
  // holds any top-level files dropped outside a folder).
  const containers: HTMLUListElement[] = [root];
  for (let i = 0; i < containers.length; i++) {
    for (const li of containers[i].children) {
      if (li instanceof HTMLLIElement && li.classList.contains("dir-item")) {
        containers.push(li.lastElementChild as HTMLUListElement);
      }
    }
  }

  const fileRows = containers.map((ul) =>
    Array.from(ul.children).filter((li): li is HTMLLIElement => li.classList.contains("file-item")),
  );

  // Round-robin allocation: round t hands slot t to every directory that still has a t-th file,
  // until the budget runs out or everything is revealed.
  const revealed = fileRows.map(() => 0);
  let remaining = Math.max(0, revealCount);
  let active = fileRows.map((_, i) => i).filter((i) => fileRows[i].length > 0);
  while (remaining > 0 && active.length > 0) {
    const stillActive: number[] = [];
    for (const i of active) {
      if (remaining === 0) break;
      revealed[i]++;
      remaining--;
      if (revealed[i] < fileRows[i].length) stillActive.push(i);
    }
    active = stillActive;
  }

  containers.forEach((ul, i) => {
    fileRows[i].forEach((li, fileIndex) => {
      li.hidden = fileIndex >= revealed[i];
    });
    updateMoreIndicator(ul, fileRows[i].length - revealed[i]);
  });
}

// The "… N more files" placeholder is created lazily, updated in place, and kept as the last row
// of its directory (file rows appended by later drops would otherwise land after it).
function updateMoreIndicator(ul: HTMLUListElement, hiddenCount: number): void {
  let more = ul.querySelector<HTMLLIElement>(":scope > .more-files");
  if (hiddenCount === 0) {
    more?.remove();
    return;
  }
  if (!more) {
    more = document.createElement("li");
    more.className = "more-files";
  }
  more.textContent = `… ${hiddenCount} more file${hiddenCount === 1 ? "" : "s"}`;
  if (more !== ul.lastElementChild) ul.appendChild(more);
}
