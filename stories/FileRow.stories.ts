import { createFileRow } from "../src/ui/fileRow";
import { withCard, withTheme } from "./utils";

function buildRow(theme: "light" | "dark", configure: (row: ReturnType<typeof createFileRow>) => void): HTMLElement {
  return withTheme(theme, () => {
    const list = document.createElement("ul");
    list.id = "file-list";
    const file = new File([new Uint8Array(32)], "session1-clip.mp4", { type: "video/mp4" });
    const row = createFileRow(list, file, "story-file-row", "sourcedata/raw/session1-clip.mp4");
    configure(row);
    return withCard(list);
  });
}

export default {
  title: "Components/FileRow",
};

export const QueuedLight = {
  name: "Queued (light)",
  render: () => buildRow("light", () => {}),
};

export const QueuedDark = {
  name: "Queued (dark)",
  render: () => buildRow("dark", () => {}),
};

export const UploadingLight = {
  name: "Uploading (in progress, light)",
  render: () =>
    buildRow("light", (row) => {
      row.setBadge("Uploading", "busy");
      row.setProgress(0.62);
      row.setStatus("62%");
    }),
};

export const UploadingDark = {
  name: "Uploading (in progress, dark)",
  render: () =>
    buildRow("dark", (row) => {
      row.setBadge("Uploading", "busy");
      row.setProgress(0.62);
      row.setStatus("62%");
    }),
};

export const ReplacedUpdatedLight = {
  name: "Replaced (content updated, light)",
  render: () =>
    buildRow("light", (row) => {
      row.setBadge("Replaced", "ok");
      row.setStatus("content updated", "ok");
      row.setProgress(1, true);
    }),
};

export const ReplacedUpdatedDark = {
  name: "Replaced (content updated, dark)",
  render: () =>
    buildRow("dark", (row) => {
      row.setBadge("Replaced", "ok");
      row.setStatus("content updated", "ok");
      row.setProgress(1, true);
    }),
};

export const ReplacedMatchedLight = {
  name: "Replaced (matched existing content, light)",
  render: () =>
    buildRow("light", (row) => {
      row.setBadge("Replaced", "ok");
      row.setStatus("matched existing content", "ok");
      row.setProgress(1, true);
    }),
};

export const ReplacedMatchedDark = {
  name: "Replaced (matched existing content, dark)",
  render: () =>
    buildRow("dark", (row) => {
      row.setBadge("Replaced", "ok");
      row.setStatus("matched existing content", "ok");
      row.setProgress(1, true);
    }),
};

export const DoneLight = {
  name: "Done (light)",
  render: () =>
    buildRow("light", (row) => {
      row.setBadge("Done", "ok");
      row.setProgress(1, true);
    }),
};

export const DoneDark = {
  name: "Done (dark)",
  render: () =>
    buildRow("dark", (row) => {
      row.setBadge("Done", "ok");
      row.setProgress(1, true);
    }),
};

export const ErroredLight = {
  name: "Error (light)",
  render: () =>
    buildRow("light", (row) => {
      row.setBadge("Error", "err");
      row.setStatus("Upload failed: network connection was lost.", "err");
    }),
};

export const ErroredDark = {
  name: "Error (dark)",
  render: () =>
    buildRow("dark", (row) => {
      row.setBadge("Error", "err");
      row.setStatus("Upload failed: network connection was lost.", "err");
    }),
};
