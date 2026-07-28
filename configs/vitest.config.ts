import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: rootDir,
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts", "stories/**", "tests/**", "configs/**"],
      reporter: ["text", "lcov", "json"],
      // Ratchet thresholds: set just below the current measured coverage so any
      // regression fails locally (and in CI) before the Codecov upload. Raise
      // these as coverage of src/ui and src/main.ts improves; they are not a
      // target, only a floor.
      thresholds: {
        statements: 30,
        branches: 25,
        functions: 34,
        lines: 30,
      },
    },
  },
});
