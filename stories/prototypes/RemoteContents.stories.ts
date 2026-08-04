// Prototype: reading what already exists under sourcedata/raw/ on EMBER and folding it into the
// selection tree. Three states: the check in flight, a diff against a partially-uploaded dataset
// (Uploaded files auto-deselected, one size-mismatched file flagged Changed, the rest New), and
// a dataset with nothing uploaded yet. See docs/file-management-redesign.md for the design notes
// and the API sketch behind the banner.
import { localFolderFixture, remoteListingAsMap, remoteListingFixture } from "./fixtures";
import { buildSelectionTree } from "./selectionTree";
import { humanSize } from "../../src/lib/format";
import { withCard, withTheme } from "../utils";
import "./proto.css";

type BannerState = "checking" | "checked" | "empty";

function buildBanner(state: BannerState): HTMLElement {
  const banner = document.createElement("div");
  banner.className = "proto-remote-banner";
  if (state === "checking") {
    banner.innerHTML = `
      <span class="proto-spin" aria-hidden="true"></span>
      <div>
        <div class="proto-banner-title">Checking EMBER…</div>
        <div class="proto-banner-body">Listing what is already under <code>sourcedata/raw/</code> in this dataset.</div>
      </div>
    `;
    return banner;
  }
  banner.classList.add("checked");
  const listing = remoteListingFixture();
  const totalSize = listing.reduce((sum, f) => sum + f.size, 0);
  banner.innerHTML = `
    <span aria-hidden="true">☁️</span>
    <div>
      <div class="proto-banner-title"></div>
      <div class="proto-banner-body"></div>
    </div>
    <button type="button">Re-check</button>
  `;
  if (state === "empty") {
    banner.querySelector(".proto-banner-title")!.textContent = "Nothing uploaded yet";
    banner.querySelector(".proto-banner-body")!.innerHTML =
      "<code>sourcedata/raw/</code> is empty in this dataset, so everything below is new.";
  } else {
    banner.querySelector(".proto-banner-title")!.textContent =
      `Already on EMBER: ${listing.length} files (${humanSize(totalSize)})`;
    banner.querySelector(".proto-banner-body")!.innerHTML =
      "Matching files under <code>sourcedata/raw/</code> are deselected below; re-check one to replace its uploaded copy.";
  }
  return banner;
}

function buildRemoteCard(state: BannerState): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.appendChild(buildBanner(state));
  if (state !== "checking") {
    const tree = buildSelectionTree({
      entries: localFolderFixture(),
      patterns: ["*.tmp", "*.log"],
      remote: state === "checked" ? remoteListingAsMap(remoteListingFixture()) : new Map(),
    });
    card.appendChild(tree.el);
  }
  return withCard(card);
}

export default {
  title: "Prototypes/Remote contents check",
};

export const CheckingLight = {
  name: "Checking (light)",
  render: () => withTheme("light", () => buildRemoteCard("checking")),
};

export const CheckingDark = {
  name: "Checking (dark)",
  render: () => withTheme("dark", () => buildRemoteCard("checking")),
};

export const DiffLight = {
  name: "Partially uploaded (light)",
  render: () => withTheme("light", () => buildRemoteCard("checked")),
};

export const DiffDark = {
  name: "Partially uploaded (dark)",
  render: () => withTheme("dark", () => buildRemoteCard("checked")),
};

export const EmptyLight = {
  name: "Nothing uploaded yet (light)",
  render: () => withTheme("light", () => buildRemoteCard("empty")),
};

export const EmptyDark = {
  name: "Nothing uploaded yet (dark)",
  render: () => withTheme("dark", () => buildRemoteCard("empty")),
};
