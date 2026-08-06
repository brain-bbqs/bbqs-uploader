// The "already on EMBER" banner's four states, stacked for side-by-side review: check in
// flight, a populated listing, an empty dataset, and a failed check.
import { buildRemoteBanner } from "./selectionCard";
import { withCard, withTheme } from "./utils";

const GB = 1024 * 1024 * 1024;

function buildAllStates(): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.append(
    buildRemoteBanner({ kind: "checking" }),
    buildRemoteBanner({ kind: "checked", files: 5, bytes: 95 * GB }),
    buildRemoteBanner({ kind: "checked", files: 0, bytes: 0 }),
    buildRemoteBanner({ kind: "failed" }),
  );
  return withCard(card);
}

export default {
  title: "Components/Remote contents banner",
};

export const AllStatesLight = {
  name: "All states (light)",
  render: () => withTheme("light", buildAllStates),
};

export const AllStatesDark = {
  name: "All states (dark)",
  render: () => withTheme("dark", buildAllStates),
};
