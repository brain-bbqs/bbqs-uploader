// Prototype: the whole redesigned upload card in one place. A picked base folder collapses the
// dropzone into a compact summary row, the archive check reports what's already under
// sourcedata/raw/, the selection tree (with editable ignore patterns) drives the Upload button's
// live count, and already-uploaded files sit deselected. Fully interactive. See
// docs/file-management-redesign.md for the design notes.
import { FIXTURE_FOLDER_NAME, localFolderFixture, remoteListingAsMap, remoteListingFixture } from "./fixtures";
import { buildSelectionTree, type SelectionSummary } from "./selectionTree";
import { humanSize } from "../../src/lib/format";
import { withCard, withTheme } from "../utils";
import "./proto.css";

function buildRedesignedCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";

  const entries = localFolderFixture();
  const totalBytes = entries.reduce((sum, e) => sum + e.file.size, 0);

  const folderRow = document.createElement("div");
  folderRow.className = "proto-folder-summary";
  folderRow.innerHTML = `
    <span aria-hidden="true">📁</span>
    <span class="proto-folder-name"></span>
    <span class="proto-folder-stats"></span>
    <button type="button">Change folder</button>
  `;
  folderRow.querySelector(".proto-folder-name")!.textContent = FIXTURE_FOLDER_NAME;
  folderRow.querySelector(".proto-folder-stats")!.textContent = `${entries.length} files, ${humanSize(totalBytes)}`;
  card.appendChild(folderRow);

  const listing = remoteListingFixture();
  const banner = document.createElement("div");
  banner.className = "proto-remote-banner checked";
  banner.innerHTML = `
    <span aria-hidden="true">☁️</span>
    <div>
      <div class="proto-banner-title"></div>
      <div class="proto-banner-body">Matching files under <code>sourcedata/raw/</code> are deselected below; re-check one to replace its uploaded copy.</div>
    </div>
    <button type="button">Re-check</button>
  `;
  banner.querySelector(".proto-banner-title")!.textContent =
    `Already on EMBER: ${listing.length} files (${humanSize(listing.reduce((sum, f) => sum + f.size, 0))})`;
  card.appendChild(banner);

  const uploadBar = document.createElement("div");
  uploadBar.className = "upload-bar";
  uploadBar.innerHTML = `
    <button type="button" class="primary"></button>
    <button type="button">Reset</button>
  `;
  const uploadBtn = uploadBar.querySelector<HTMLButtonElement>(".primary")!;
  const applySummary = (summary: SelectionSummary): void => {
    uploadBtn.textContent = `Upload ${summary.selectedFiles} files (${humanSize(summary.selectedBytes)})`;
    uploadBtn.disabled = summary.selectedFiles === 0;
  };

  const tree = buildSelectionTree({
    entries,
    patterns: ["*.tmp", "*.log"],
    editablePatterns: true,
    remote: remoteListingAsMap(listing),
    onSummary: applySummary,
  });
  card.appendChild(tree.el);
  card.appendChild(uploadBar);

  return withCard(card);
}

export default {
  title: "Prototypes/Redesigned upload card",
};

export const FullFlowLight = {
  name: "Full flow (light)",
  render: () => withTheme("light", buildRedesignedCard),
};

export const FullFlowDark = {
  name: "Full flow (dark)",
  render: () => withTheme("dark", buildRedesignedCard),
};
