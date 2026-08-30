import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolveAppVersion } from "./appVersion";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: rootDir,
  // Same injection vite.config.ts performs, so src/main.ts (which reads __APP_VERSION__) can be
  // imported by the boot smoke test.
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion()),
  },
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
      // these as coverage improves; they are not a target, only a floor. The
      // remaining uncovered sliver is defensive dead code (unreachable guards).
      thresholds: {
        statements: 99,
        branches: 98,
        functions: 99,
        lines: 99,
      },
    },
  },
});
