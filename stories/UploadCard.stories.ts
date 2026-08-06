// The whole redesigned upload card: picked-folder summary row, "already on EMBER" banner,
// include/exclude tree with ignore patterns, and an Upload button carrying the live selection.
// Fully interactive, against the deterministic fixture dataset and archive listing.
import { FIXTURE_FOLDER_NAME, localFolderFixture, remoteListingFixture } from "./fixtures";
import { buildRemoteBanner, buildSelectionTree } from "./selectionCard";
import { humanSize } from "../src/lib/format";
import { withCard, withTheme } from "./utils";

function buildUploadCard(): HTMLElement {
  const wrapper = document.createElement("div");

  const entries = localFolderFixture();
  const totalBytes = entries.reduce((sum, e) => sum + e.file.size, 0);
  const listing = remoteListingFixture();

  // Card 1: the picked base folder, standing in for the dropzone once a folder is chosen.
  const folderCard = document.createElement("section");
  folderCard.className = "card";
  const folderRow = document.createElement("div");
  folderRow.className = "folder-summary";
  folderRow.innerHTML = `
    <span aria-hidden="true">📁</span>
    <span class="folder-summary-name"></span>
    <span class="folder-summary-stats"></span>
    <button type="button">Change folder</button>
  `;
  folderRow.querySelector(".folder-summary-name")!.textContent = FIXTURE_FOLDER_NAME;
  folderRow.querySelector(".folder-summary-stats")!.textContent = `${entries.length} files, ${humanSize(totalBytes)}`;
  folderCard.appendChild(folderRow);
  wrapper.appendChild(folderCard);

  // Card 2: everything file-selection, spawned below the folder card.
  const filesCard = document.createElement("section");
  filesCard.className = "card";

  let listingBytes = 0;
  for (const size of listing.values()) listingBytes += size;
  filesCard.appendChild(buildRemoteBanner({ kind: "checked", files: listing.size, bytes: listingBytes }));

  const uploadBar = document.createElement("div");
  uploadBar.className = "upload-bar";
  uploadBar.innerHTML = `<button type="button" class="primary"></button><button type="button">Reset</button>`;
  const uploadBtn = uploadBar.querySelector<HTMLButtonElement>(".primary")!;

  filesCard.appendChild(
    buildSelectionTree({
      entries,
      patterns: ["*.tmp", "*.log"],
      remote: listing,
      onSummary: (s) => {
        uploadBtn.textContent = `Upload ${s.selectedFiles} file${s.selectedFiles === 1 ? "" : "s"} (${humanSize(s.selectedBytes)})`;
        uploadBtn.disabled = s.selectedFiles === 0;
      },
    }),
  );
  filesCard.appendChild(uploadBar);
  wrapper.appendChild(filesCard);
  return withCard(wrapper);
}

export default {
  title: "Components/Upload card",
};

export const FullFlowLight = {
  name: "Full flow (light)",
  render: () => withTheme("light", buildUploadCard),
};

export const FullFlowDark = {
  name: "Full flow (dark)",
  render: () => withTheme("dark", buildUploadCard),
};
