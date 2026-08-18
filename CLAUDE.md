# Development Guidelines

- Always run `pre-commit` before committing and pushing changes
- To the best of your ability, ensure tests are passing
- Follow assertion style (actual on left, expected on right)
- Always bump the version in `package.json` appropriately when any file under `src/` (except `stories/` or `tests/`), `configs/`, or `package.json`/`package-lock.json` itself, is changed. Bump once per PR: if the version was already bumped by earlier work on the same PR/branch and it hasn't been merged yet, do not bump it again for follow-up commits on that same PR — keep adding entries under the existing top-most `CHANGELOG.md` heading instead
- This project has no formal releases, so there is no `## Upcoming` staging section in `CHANGELOG.md`. Leave a short description of the change or addition directly under the top-most version heading (the same version just bumped in `package.json`; create the heading if it does not yet exist) under the appropriate subsection (`#### 🚀 Enhancement`, `#### 🐛 Bug Fix`, or `#### 🏠 Internal`); create the subsection if it does not yet exist; include the GitHub PR link at the end of each entry in the format `([#N](https://github.com/brain-bbqs/bbqs-uploader/pull/N))`
- Never mention `?test` live test injections (or any other debug-only URL override) in `CHANGELOG.md` entries; the changelog is user-facing (it feeds the "What's New" modal), and those are developer tooling documented in `docs/README.md` instead. If a change mixes user-facing behavior with `?test` tooling, describe only the user-facing part in the changelog entry
- PR titles should be human-readable and in the past tense; they should NOT use conventional commit style
- Keep PR descriptions short and to the point
- Always end the PR description with the original user prompt(s) quoted verbatim, wrapped in a `<details>` dropdown titled `Original prompt` (`<details><summary>Original prompt</summary>` ... `</details>`); when the PR grows out of several prompts, list them in order inside that same dropdown, and update the dropdown when later prompts add to the work
- Limit use of em-dashes in all text. Before committing any change to `CHANGELOG.md`, grep the newly added entries for `—` and rewrite any hits (commas, parentheses, or semicolons work well) before committing
- Before storing any new credential/token client-side, adding/changing `innerHTML`/`outerHTML`/`insertAdjacentHTML` usage, or responding to a CodeQL "clear text storage of sensitive data" alert, read `SECURITY.md`
