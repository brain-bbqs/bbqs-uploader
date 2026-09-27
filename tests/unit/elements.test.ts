// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getElements } from "../../src/ui/elements";

// The real page, so this test fails when index.html and getElements drift apart. Assigning
// repo-controlled static markup via innerHTML is the pattern SECURITY.md documents as safe
// (and jsdom never executes scripts inserted this way). Resolved from the Vitest root (the
// repo root) rather than import.meta.url, which jsdom rewrites to an http: URL.
const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

beforeEach(() => {
  document.body.innerHTML = indexHtml;
});

describe("getElements", () => {
  it("finds every element the app requires in the shipped index.html", () => {
    const els = getElements();
    for (const [key, el] of Object.entries(els)) {
      expect(el, `element for ${key}`).toBeInstanceOf(Element);
    }
  });

  // One of the app's own ids, a shell id the package always requires, the sign-in button (which
  // the package treats as optional and this page does not), and the rest of the account menu.
  it.each(["dropzone", "theme-toggle", "oauth-signin-btn", "oauth-username"])(
    "throws naming the missing id when #%s is absent",
    (id) => {
      document.getElementById(id)!.remove();
      expect(() => getElements()).toThrow(`Expected #${id} to exist in the document`);
    },
  );
});
