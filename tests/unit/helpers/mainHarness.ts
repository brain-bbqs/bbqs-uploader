// Shared harness for tests that boot the real src/main.ts against the real index.html markup
// (see main.smoke.test.ts for the original pattern). Each test file gets its own module registry,
// so importing main.ts runs its top-level wiring exactly once per file; boot with the URL search
// params the scenario needs before that first import.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function bodyFromIndexHtml(): string {
  // import.meta.url is an http URL under jsdom; vitest's cwd is the repo root (see its config).
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf-8");
  // The inline pre-paint script (and the module entry) don't belong in this harness —
  // main.ts is imported directly instead. Parsed and pruned via the DOM (DOMParser never
  // executes scripts) rather than regex-filtering the HTML.
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const script of Array.from(doc.querySelectorAll("script"))) script.remove();
  return doc.body.innerHTML;
}

export function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

export function fakeFolderFile(name: string, webkitRelativePath: string, size?: number): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "webkitRelativePath", { value: webkitRelativePath, configurable: true });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

export function pickFolder(files: File[]): void {
  const input = el<HTMLInputElement>("folder-input");
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change"));
}

export function installMatchMedia(matches = false): void {
  // jsdom has no matchMedia; main.ts only reads `.matches` for the theme toggle's starting point.
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom (25) parses <dialog> but implements neither showModal() nor close(); the What's New modal
// only needs `open` to track state and a "close" event on close(), so a minimal stand-in keeps
// main.ts's real modal wiring exercisable. Patched on the element's actual prototype, so it works
// whether jsdom maps <dialog> to HTMLDialogElement or a generic element.
export function installDialogPolyfill(): void {
  const proto = Object.getPrototypeOf(document.createElement("dialog")) as {
    showModal?: () => void;
    close?: (returnValue?: string) => void;
  };
  if (typeof proto.showModal !== "function") {
    proto.showModal = function (this: HTMLElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function (this: HTMLElement) {
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
  const desc = Object.getOwnPropertyDescriptor(proto, "open");
  if (!desc || typeof desc.get !== "function") {
    Object.defineProperty(proto, "open", {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("open");
      },
      set(this: HTMLElement, value: boolean) {
        if (value) this.setAttribute("open", "");
        else this.removeAttribute("open");
      },
    });
  }
}

/**
 * Boots the real app: sets the URL (so main.ts's `?test&...` injection readers see `search`),
 * swaps in the real index.html body, installs the matchMedia stub and dialog polyfill, and
 * imports src/main.ts. Call once per test file, from `beforeAll`; `vi.mock` calls in the test
 * file still apply to main.ts's imports because this dynamic import resolves through the same
 * mocked registry.
 */
export async function bootMain(search = ""): Promise<void> {
  window.history.replaceState(null, "", `/${search}`);
  document.body.innerHTML = bodyFromIndexHtml();
  installMatchMedia();
  installDialogPolyfill();
  await import("../../../src/main");
}
