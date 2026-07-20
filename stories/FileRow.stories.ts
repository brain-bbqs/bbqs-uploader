import { createFileRow } from "../src/ui/fileRow";
import { withCard } from "./utils";

function buildRow(configure: (row: ReturnType<typeof createFileRow>) => void): HTMLElement {
  const list = document.createElement("ul");
  list.id = "file-list";
  const file = new File([new Uint8Array(32)], "session1-clip.mp4", { type: "video/mp4" });
  const row = createFileRow(list, file, "story-file-row");
  configure(row);
  return withCard(list);
}

export default {
  title: "Components/FileRow",
};

export const Queued = {
  name: "Queued",
  render: () => buildRow((row) => row.setBadge("Queued", "busy")),
};

export const Checking = {
  name: "Checking MP4 structure",
  render: () =>
    buildRow((row) => {
      row.setBadge("Checking", "busy");
      row.setStatus("Verifying MP4 structure…");
    }),
};

export const Uploading = {
  name: "Uploading (in progress)",
  render: () =>
    buildRow((row) => {
      row.setBadge("Uploading", "busy");
      row.setProgress(0.62);
      row.setStatus("Uploading to the archive… 62.0%");
    }),
};

export const NeedsConfirmation = {
  name: "Needs confirmation (existing asset)",
  render: () =>
    buildRow((row) => {
      row.setBadge("Checking", "busy");
      row.setStatus("An asset already exists at this path. Overwrite it?", "warn");
      row.addAction("Skip", () => {});
      row.addAction("Overwrite", () => {}, true);
    }),
};

export const Done = {
  name: "Done",
  render: () =>
    buildRow((row) => {
      row.setBadge("Done", "ok");
      row.setProgress(1, true);
      row.setStatus("Uploaded successfully as session1-clip.mp4", "ok");
    }),
};

export const Errored = {
  name: "Error",
  render: () =>
    buildRow((row) => {
      row.setBadge("Error", "err");
      row.setStatus("Upload failed: network connection was lost.", "err");
    }),
};
