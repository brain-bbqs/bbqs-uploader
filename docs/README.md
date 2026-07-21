# Docs

## How to test

### Unit tests

```
npm test
```

Runs the Vitest unit suite (`configs/vitest.config.ts`).

### Integration tests

```
npm run test:integration
```

Runs the Playwright suite (`configs/playwright.config.ts`) against a built preview server, with the
DANDI API mocked per-test.

### Previewing the multi-dataset dropdown

The dataset picker normally shows a dropdown only when the signed-in user owns more than one
"Incoming: " dandiset — otherwise it collapses to a single line of text. Since that's awkward to
set up with a real account, load the app with:

```
?test&num_datasets=N
```

for example `http://localhost:5173/?test&num_datasets=2`. This bypasses sign-in and fills the
picker with `N` fake "Incoming: Test dataset" entries, so the dropdown behavior can be previewed
directly. Omitting `num_datasets` (just `?test`) defaults to one fake dataset. This override is
debug-only: it never touches `localStorage`, so it has no effect on your real settings once the
query string is removed.
