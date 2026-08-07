// The include/exclude checkbox tree over a staged folder, fully interactive: per-file toggles,
// tri-state folder checkboxes, Select all/none, and the ignore-pattern chip editor. Built from
// the production selection model and tree renderer (see selectionCard.ts).
import { localFolderFixture } from "./fixtures";
import { buildSelectionTree } from "./selectionCard";
import { withCard, withTheme } from "./utils";

function buildCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.appendChild(
    buildSelectionTree({
      entries: localFolderFixture(),
      patterns: ["*.tmp", "*.log"],
    }),
  );
  return withCard(card);
}

export default {
  title: "Components/Selection tree",
};

export const InteractiveLight = {
  name: "Interactive (light)",
  render: () => withTheme("light", buildCard),
};

export const InteractiveDark = {
  name: "Interactive (dark)",
  render: () => withTheme("dark", buildCard),
};
