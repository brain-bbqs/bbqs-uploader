// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createFileRow } from "../../src/ui/fileRow";

let fileList: HTMLUListElement;

beforeEach(() => {
  document.body.textContent = "";
  fileList = document.createElement("ul");
  document.body.appendChild(fileList);
});

const file = new File([new Uint8Array(2048)], "clip.mp4");

describe("createFileRow", () => {
  it("appends a row showing the file name, human size, and destination tooltip", () => {
    const row = createFileRow(fileList, file, "file-0", "sourcedata/raw/clip.mp4");

    expect(fileList.children).toHaveLength(1);
    expect(row.el.id).toBe("file-0");
    expect(row.el.title).toBe("sourcedata/raw/clip.mp4");
    expect(row.el.querySelector(".file-name")!.textContent).toBe("clip.mp4");
    expect(row.el.querySelector(".file-size")!.textContent).toBe("2.0 KB");
  });

  it("renders even hostile file names as inert text, not markup", () => {
    const hostile = new File([], '<img src=x onerror="window.pwned=true">.mp4');
    const row = createFileRow(fileList, hostile, "file-0", "sourcedata/raw/x");

    expect(row.el.querySelector("img")).toBeNull();
    expect(row.el.querySelector(".file-name")!.textContent).toBe('<img src=x onerror="window.pwned=true">.mp4');
  });

  it("shows, restyles, and hides the badge", () => {
    const row = createFileRow(fileList, file, "file-0", "p");
    const badge = row.el.querySelector<HTMLSpanElement>('[data-role="badge"]')!;
    expect(badge.hidden).toBe(true);

    row.setBadge("Uploading", "upload");
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("Uploading");
    expect(badge.className).toBe("badge upload");

    row.setBadge("Done", "ok");
    expect(badge.className).toBe("badge ok");

    row.hideBadge();
    expect(badge.hidden).toBe(true);
  });

  it("sets the status text with an optional kind class", () => {
    const row = createFileRow(fileList, file, "file-0", "p");
    const status = row.el.querySelector<HTMLSpanElement>('[data-role="status"]')!;

    row.setStatus("42%");
    expect(status.textContent).toBe("42%");
    expect(status.className).toBe("file-status ");

    row.setStatus("Permission denied", "err");
    expect(status.className).toBe("file-status err");
  });

  it("reveals the progress bar and widens it with progress, marking completion", () => {
    const row = createFileRow(fileList, file, "file-0", "p");
    const wrap = row.el.querySelector<HTMLSpanElement>('[data-role="progress-wrap"]')!;
    const bar = row.el.querySelector<HTMLSpanElement>('[data-role="progress"]')!;
    expect(wrap.hidden).toBe(true);

    row.setProgress(0.4567);
    expect(wrap.hidden).toBe(false);
    expect(wrap.classList.contains("done")).toBe(false);
    expect(bar.style.width).toBe("45.7%");

    row.setProgress(1, true);
    // jsdom normalizes the "100.0%" the code assigns to "100%".
    expect(bar.style.width).toBe("100%");
    expect(wrap.classList.contains("done")).toBe(true);
  });
});
