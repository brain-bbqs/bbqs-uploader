import { humanSize } from "../lib/format";

export type BadgeKind = "scan" | "upload" | "ok" | "warn" | "err" | "mute";

export interface FileRow {
  el: HTMLLIElement;
  /** The row's include checkbox; null when created without one (e.g. in stories). */
  checkbox: HTMLInputElement | null;
  setBadge(text: string, kind: BadgeKind): void;
  hideBadge(): void;
  setStatus(text: string, kind?: BadgeKind | ""): void;
  setProgress(fraction: number, done?: boolean): void;
}

export function createFileRow(
  fileList: HTMLUListElement,
  file: File,
  id: string,
  destinationPath: string,
  withCheckbox = false,
): FileRow {
  const li = document.createElement("li");
  li.className = "file-item";
  li.id = id;
  li.title = destinationPath;
  li.innerHTML = `
    ${withCheckbox ? '<input type="checkbox" class="select-check" checked />' : ""}
    <span class="file-name"></span>
    <span class="file-size">${humanSize(file.size)}</span>
    <span class="file-status" data-role="status"></span>
    <span class="badge" data-role="badge" hidden></span>
    <span class="progress" data-role="progress-wrap" hidden><span data-role="progress"></span></span>
  `;
  li.querySelector(".file-name")!.textContent = file.name;
  const checkbox = li.querySelector<HTMLInputElement>(".select-check");
  checkbox?.setAttribute("aria-label", `Include ${file.name}`);
  fileList.appendChild(li);

  const badge = li.querySelector<HTMLSpanElement>('[data-role="badge"]')!;
  const progressWrap = li.querySelector<HTMLSpanElement>('[data-role="progress-wrap"]')!;
  const progressBar = li.querySelector<HTMLSpanElement>('[data-role="progress"]')!;
  const status = li.querySelector<HTMLSpanElement>('[data-role="status"]')!;

  return {
    el: li,
    checkbox,
    setBadge(text, kind) {
      badge.hidden = false;
      badge.textContent = text;
      badge.className = `badge ${kind}`;
    },
    hideBadge() {
      badge.hidden = true;
    },
    setStatus(text, kind = "") {
      status.textContent = text;
      status.className = `file-status ${kind}`;
    },
    setProgress(fraction, done = false) {
      progressWrap.hidden = false;
      progressWrap.classList.toggle("done", done);
      progressBar.style.width = `${(fraction * 100).toFixed(1)}%`;
    },
  };
}
