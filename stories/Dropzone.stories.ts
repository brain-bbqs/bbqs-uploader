import { withCard, withTheme } from "./utils";

type DropzoneState = "idle" | "dragover" | "rejected";

function buildDropzone(state: DropzoneState): HTMLElement {
  const dz = document.createElement("div");
  dz.id = "dropzone";
  if (state === "dragover") dz.classList.add("dragover");
  dz.innerHTML = `
    <div class="dz-inner">
      <div class="dz-icon"><span>📁</span></div>
      <p>
        Drop your dataset folder here, or
        <button type="button" class="dz-browse">browse for a folder</button>.
      </p>
      <p class="dz-hint">Everything inside the folder is scanned first; you choose what to include next.</p>
      <p class="dz-reject" ${state === "rejected" ? "" : "hidden"}>
        Individual files can't be uploaded on their own.<br /><br />Drop the folder that contains them instead.
      </p>
    </div>
  `;
  return withCard(dz);
}

export default {
  title: "Components/Dropzone",
};

export const IdleLight = {
  name: "Idle (light)",
  render: () => withTheme("light", () => buildDropzone("idle")),
};

export const IdleDark = {
  name: "Idle (dark)",
  render: () => withTheme("dark", () => buildDropzone("idle")),
};

export const DragOverLight = {
  name: "Drag over (light)",
  render: () => withTheme("light", () => buildDropzone("dragover")),
};

export const DragOverDark = {
  name: "Drag over (dark)",
  render: () => withTheme("dark", () => buildDropzone("dragover")),
};

export const RejectedLight = {
  name: "Loose files rejected (light)",
  render: () => withTheme("light", () => buildDropzone("rejected")),
};

export const RejectedDark = {
  name: "Loose files rejected (dark)",
  render: () => withTheme("dark", () => buildDropzone("rejected")),
};
