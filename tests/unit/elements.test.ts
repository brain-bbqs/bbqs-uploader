// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { expectIdContract, mountHtml, readIndexHtml } from "@brain-bbqs/test-utils/vitest";
import { getElements } from "../../src/ui/elements";

// The real page, so this test fails when index.html and getElements drift apart.
const indexHtml = readIndexHtml();

describe("getElements", () => {
  // Both ways: every id a lookup requires is in the page, and every id in the page is registered
  // by a lookup (or referenced from the page itself, as the What's New heading is by the dialog).
  it("agrees with the shipped index.html on every id", () => {
    expectIdContract({ html: indexHtml, lookups: getElements });
  });

  describe("on the shipped page", () => {
    beforeEach(() => {
      mountHtml(indexHtml);
    });

    // One of the app's own ids, a shell id the package always requires, the sign-in button (which
    // the package treats as optional and this page does not), the rest of the account menu, and
    // the What's New modal the package looks up.
    it.each(["dropzone", "theme-toggle", "oauth-signin-btn", "oauth-username", "whats-new-modal"])(
      "throws naming the missing id when #%s is absent",
      (id) => {
        document.getElementById(id)!.remove();
        expect(() => getElements()).toThrow(`Expected #${id} to exist in the document`);
      },
    );
  });
});
