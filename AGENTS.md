# Repository instructions

## Branches and contributions

- `main` is the default branch and the integration branch for development.
- `production` holds the latest approved release checkpoint, starting with the
  source for the published `0.1.0` release.
- Start ordinary feature, fix and documentation branches from `main`, using the
  `codex/` prefix unless the owner specifies another name. Target their PRs at
  `main`. Follow [CONTRIBUTING.md](CONTRIBUTING.md) and the
  [composition contribution rules](docs/composition-contributing.md).
- Do not develop directly on `production` or merge routine feature PRs into it.
  Use a reviewed release promotion or a hotfix PR to advance it.
- Promote the exact reviewed release commit, not an unverified newer tip of
  `main`. Prefer fast-forward promotion; when a merge is needed, preserve
  ancestry with a merge commit and verify the resulting tree. Do not squash
  release promotions, force-push `production`, or move existing release tags.
- Start urgent release fixes from `production` on a separate branch. Target the
  hotfix PR at `production`, run the release checks, and merge the fix back into
  `main` before the next regular release. Never bring unrelated development
  changes into a hotfix.
- Preserve unrelated working-tree edits. A release checkpoint must contain
  committed package source and build inputs; do not create it from an older
  HEAD while leaving its release preparation uncommitted.

## Release verification and publication

Use the versions in `toolchain.json` and locked dependencies. Run the appropriate
local verification tier for development changes; see
[docs/verification.md](docs/verification.md). For npm releases, run
`pnpm release:check`, which includes the full software/benchmark gate and clean
installed-package verification. Retain failed runs, reruns and any deferred
requirements; do not describe staged completion as one uninterrupted pass.

Record the release source commit and the verified archive checksum in the
[release records](docs/npm-release-results.json). Any changed source or rebuilt
archive requires the corresponding verification to be refreshed. Create
annotated version tags such as `v0.1.0` on the exact approved release commit;
keep them fixed as `production` advances.

Branch creation, branch promotion and tagging do not publish an npm package.
Publish only when the owner's request includes publication, using the exact
verified archive and the [manual release procedure](docs/npm-release-plan.md).
Never infer human visual/listening acceptance from software checks.

## GitHub Actions

GitHub Actions are prohibited in this project. Do not add, restore, enable, or
recommend GitHub Actions workflows, including files under `.github/workflows/`.
Keep repository Actions disabled. Run verification locally using the existing
pnpm commands. This rule remains in effect unless the user explicitly revokes it.

## Development log

Keep [`docs/dev-log.md`](docs/dev-log.md) current. At the start of a session,
read its **Current state** section and latest entries. Before finishing a
session or after committing a completed slice, add a short dated entry at the
top of **Entries** and update **Current state** (in-flight work, blockers,
pending owner decisions, rejected experiments). Keep detailed evidence in the
milestone plans and results files and link to them from the entry.
