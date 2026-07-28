# BBQS Uploader

A **fully static, backend-free** web app for BBQS teams to upload files to an existing Dandiset on the EMBER Archive through a simple drag-and-drop interface.

## Testing & Coverage

Quality gates, from fastest to deepest (this repo is developed heavily with AI agents, and these deterministic checks catch subtle issues in generated code that coverage alone won't):

1. **Typecheck**: `npm run typecheck` (strict TypeScript, `tsc --noEmit`).
2. **Type-aware lint**: `npm run lint` (ESLint with typescript-eslint's `recommended-type-checked` rules plus complexity caps; also runs via pre-commit).
3. **Unit tests + coverage**: `npm run test:coverage` (Vitest with v8 coverage and threshold floors; `lcov` output is uploaded to [Codecov](https://about.codecov.io/) in CI, where the patch status requires new/changed code to be covered).
4. **Mutation testing (optional)**: `npm run test:mutation` (Stryker). Slow, so it is not a CI gate; run it locally when touching `src/lib/`. Mutation score, not raw coverage, is the real signal of test quality.

---

Built &amp; maintained by the [Center for Open Neuroscience](https://centerforopenneuroscience.org).
