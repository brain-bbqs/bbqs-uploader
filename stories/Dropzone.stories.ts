import { withCard, withTheme } from "./utils";

function buildDropzone(dragover: boolean): HTMLElement {
  const dz = document.createElement("div");
  dz.id = "dropzone";
  if (dragover) dz.classList.add("dragover");
  dz.innerHTML = `
    <div class="dz-inner">
      <div class="dz-icon"><span>🎥</span><span>🔬</span><span>📄</span></div>
      <p>
        Drop your research contents here, or click to browse
        <button type="button" class="dz-browse">files</button>
        or a
        <button type="button" class="dz-browse">folder</button>.
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
  render: () => withTheme("light", () => buildDropzone(false)),
};

export const IdleDark = {
  name: "Idle (dark)",
  render: () => withTheme("dark", () => buildDropzone(false)),
};

export const DragOverLight = {
  name: "Drag over (light)",
  render: () => withTheme("light", () => buildDropzone(true)),
};

export const DragOverDark = {
  name: "Drag over (dark)",
  render: () => withTheme("dark", () => buildDropzone(true)),
};
