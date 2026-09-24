import { defineConfig } from "vitest/config";
import { createVitestConfig } from "@brain-bbqs/config/vitest";

export default defineConfig(
  createVitestConfig({
    rootDir: new URL("..", import.meta.url),
    // Pure-logic suites run under node; a suite that needs a DOM opts in with a
    // `// @vitest-environment jsdom` docblock on its first line.
    environment: "node",
    // Ratchet thresholds: set just below the current measured coverage so any
    // regression fails locally (and in CI) before the Codecov upload. Raise
    // these as coverage improves; they are not a target, only a floor. The
    // remaining uncovered sliver is defensive dead code (unreachable guards).
    thresholds: {
      statements: 99,
      branches: 98,
      functions: 99,
      lines: 99,
    },
    overrides: {
      test: {
        // Vitest 5 clears mocks before each test by default. Several suites here boot the app once
        // in `beforeAll` and assert on those recorded calls across multiple `it` blocks, so restore
        // the pre-v5 behavior of leaving mocks alone between tests.
        clearMocks: false,
      },
    },
  }),
);
