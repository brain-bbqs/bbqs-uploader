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

### Previewing the dataset picker's states

The dataset picker shows a dropdown when the signed-in user owns more than one "Incoming: "
dandiset, collapses to a single line of text when they own exactly one, and shows a
no-datasets-found message when they own none. Since that's awkward to set up with a real account,
load the app with:

```
?test&num_datasets=N
```

for example `http://localhost:5173/?test&num_datasets=2`. It fills the picker with `N` fake
"Incoming: Test dataset" entries (using negative identifiers, e.g. `-000001`, so they're never
mistaken for real dandisets), so any of those states can be previewed directly:

- `N` omitted (just `?test`) or `N=1` — the single-dataset text
- `N >= 2` — the dropdown
- `N=0` — the no-datasets-found message

Only the dataset list is faked; sign-in state is untouched, so if you're already signed in for
real, the header avatar still reflects your actual account. This override is debug-only: it never
touches `localStorage`, so it has no effect on your real settings once the query string is
removed.
