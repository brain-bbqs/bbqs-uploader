// Prototype: include/exclude selection over a scanned base folder. Fully interactive -- toggle
// file and folder checkboxes (folders go indeterminate when partially selected), and add/remove
// glob-style ignore patterns via the chip editor. The "scratch/" contents start ignored by the
// two seeded patterns. See docs/file-management-redesign.md for the design notes.
import { localFolderFixture } from "./fixtures";
import { buildSelectionTree } from "./selectionTree";
import { withCard, withTheme } from "../utils";
import "./proto.css";

function buildSelectionCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  const heading = document.createElement("div");
  heading.className = "dest-root";
  heading.innerHTML = "<code>sourcedata/raw/</code>";
  card.appendChild(heading);

  const tree = buildSelectionTree({
    entries: localFolderFixture(),
    patterns: ["*.tmp", "*.log"],
    editablePatterns: true,
    initiallyExcluded: ["notes.txt"],
  });
  card.appendChild(tree.el);
  return withCard(card);
}

export default {
  title: "Prototypes/Include-exclude selection",
};

export const InteractiveLight = {
  name: "Interactive (light)",
  render: () => withTheme("light", buildSelectionCard),
};

export const InteractiveDark = {
  name: "Interactive (dark)",
  render: () => withTheme("dark", buildSelectionCard),
};
