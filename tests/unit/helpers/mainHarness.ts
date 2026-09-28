// Shared harness for tests that boot the real src/main.ts against the real index.html markup. Each
// test file gets its own module registry, so importing main.ts runs its top-level wiring exactly
// once per file; boot with the URL the scenario needs before that first import. The import stays
// here, in the app's own code, so Vitest transforms it and a test file's `vi.mock` calls apply.
import { createMainHarness, fakeFile, pickFiles } from "@brain-bbqs/test-utils/vitest";

export const { bootMain } = createMainHarness({ importMain: () => import("../../../src/main") });
export { el } from "@brain-bbqs/test-utils/vitest";

export const fakeFolderFile = (name: string, relativePath: string, size?: number): File =>
  fakeFile(name, { relativePath, size });

export const pickFolder = (files: File[]): void => pickFiles("folder-input", files);
