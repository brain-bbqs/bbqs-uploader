// CommonJS on purpose: eslint also runs via the pre-commit hook in its own isolated
// environment (see .pre-commit-config.yaml), where these packages are only reachable
// through the NODE_PATH pre-commit sets — which require() honors but ESM import does
// not. The same packages are pinned in devDependencies so `npm run lint` matches.
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const path = require("node:path");

module.exports = tseslint.config(
  {
    ignores: [
      "dist/",
      "coverage/",
      "storybook-static/",
      "test-results/",
      "playwright-report/",
      "reports/",
      ".stryker-tmp/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Type-aware linting for everything the TypeScript project covers (src/ plus the
    // *.ts files under configs/; tests/ and stories/ are outside the tsconfig, so
    // type information is not available there).
    files: ["src/**/*.ts", "configs/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: path.join(__dirname, ".."),
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
  {
    // Deterministic complexity caps everywhere, type info not required.
    rules: {
      complexity: ["error", 15],
      "max-depth": ["error", 4],
    },
  },
  {
    // CommonJS config files (this one and configs/prettier.config.cjs) use CJS globals
    // and require() by definition.
    files: ["**/*.cjs"],
    languageOptions: { globals: { module: "writable", require: "readonly", __dirname: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
