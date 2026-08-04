// Prototype: the dropzone restricted to base folders only. The "browse files" button and
// #file-input are gone; dropping loose files is rejected with an inline explanation instead of
// silently queueing them. See docs/file-management-redesign.md for the design notes.
import { withCard, withTheme } from "../utils";
import "./proto.css";

type DropzoneState = "idle" | "dragover" | "rejected";

function buildFolderDropzone(state: DropzoneState): HTMLElement {
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
      <p class="proto-dz-hint">
        Everything inside the folder is scanned first; you choose what to include next.
      </p>
    </div>
  `;
  if (state === "rejected") {
    const reject = document.createElement("p");
    reject.className = "proto-dz-reject";
    reject.textContent = "Individual files can't be uploaded on their own. Drop the folder that contains them instead.";
    dz.querySelector(".dz-inner")!.appendChild(reject);
  }
  return withCard(dz);
}

export default {
  title: "Prototypes/Folder-only dropzone",
};

export const IdleLight = {
  name: "Idle (light)",
  render: () => withTheme("light", () => buildFolderDropzone("idle")),
};

export const IdleDark = {
  name: "Idle (dark)",
  render: () => withTheme("dark", () => buildFolderDropzone("idle")),
};

export const DragOverLight = {
  name: "Drag over (light)",
  render: () => withTheme("light", () => buildFolderDropzone("dragover")),
};

export const DragOverDark = {
  name: "Drag over (dark)",
  render: () => withTheme("dark", () => buildFolderDropzone("dragover")),
};

export const FilesRejectedLight = {
  name: "Loose files rejected (light)",
  render: () => withTheme("light", () => buildFolderDropzone("rejected")),
};

export const FilesRejectedDark = {
  name: "Loose files rejected (dark)",
  render: () => withTheme("dark", () => buildFolderDropzone("rejected")),
};
