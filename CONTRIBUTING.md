# Contributing to Still Shift

## Branches

| Branch       | Purpose                                                | Changes enter through                             |
| ------------ | ------------------------------------------------------ | ------------------------------------------------- |
| `main`       | Default branch for ongoing development and integration | Feature, fix and documentation PRs                |
| `production` | Latest approved release checkpoint                     | Reviewed release promotions and urgent hotfix PRs |

`production` starts with the source for the published `0.1.0` release. The
[release results](docs/npm-release-results.json) record publication status,
the archive checksum and verification limits separately.

Keep development on short-lived branches based on `main`. Use `codex/` for
Codex-created branches unless the owner requests another name. For example:

```sh
git switch main
git pull --ff-only origin main
git switch -c codex/example-feature
```

Preserve existing local edits before changing branches. Open ordinary PRs
against `main`; develop new features there while `production` stays at the
approved release checkpoint.

## Setup and verification

Use the exact versions in [toolchain.json](toolchain.json) and the locked
dependencies. Follow the [README setup](README.md#install) for Node, pnpm,
Python, Chromium and FFmpeg. Install JavaScript dependencies with:

```sh
nvm use
pnpm install --frozen-lockfile
```

Run the checks appropriate to the change:

| Change                              | Local verification                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Documentation only                  | `pnpm exec prettier --check` with the edited Markdown paths, then `git diff --check` |
| TypeScript or ordinary feature work | `pnpm check:fast` and relevant behavior tests                                        |
| Workers, exports or Lab workflows   | `pnpm check:runtime` and the relevant browser/render checks                          |
| npm release or hotfix release       | `pnpm release:check`                                                                 |

The [verification guide](docs/verification.md) defines prerequisites, rendering
baselines, bounded concurrency and deferred performance requirements. Record
actual results, failures and reruns. Preserve frozen baselines and acceptance
thresholds unless an intentional change is approved and documented.

GitHub Actions are prohibited. Keep repository Actions disabled, and do not add,
restore, enable or recommend `.github/workflows/` files. Run verification locally
using the existing pnpm commands.

## Pull requests

Keep each PR focused on one change. Explain the problem, resulting behavior,
local verification and material limits. Include the relevant plan or evidence
links for milestone work. New rendering capabilities follow the
[composition and family schema rules](docs/composition-contributing.md).

Keep [docs/dev-log.md](docs/dev-log.md) current: read Current state and the latest
entries before starting; add a short dated entry at the top of Entries and
update Current state before finishing or after committing a completed slice.
Keep detailed evidence in the relevant plans and results files.

## Release promotion

1. Commit the release preparation and choose the reviewed source commit. If
   development continues on `main`, use a short-lived release branch at that
   commit so later features do not enter the candidate.
2. Run `pnpm release:check` against the candidate with the pinned toolchain.
   It runs `pnpm check:all` and clean installed-package checks. Record the source
   commit, results and archive checksum in the release records.
3. Review the changes against `production`. Promote only the verified candidate
   after release approval. Prefer a fast-forward to the reviewed commit; if a
   merge is necessary, use a merge commit and verify its resulting tree. Do not
   squash release promotions, because both branches must retain shared ancestry.
4. Create an annotated tag such as `v0.1.0` on the exact approved release commit.
   Keep release tags fixed, and advance `production` for subsequent releases.
5. When npm publication is authorized, publish the exact verified archive using
   the [manual npm procedure](docs/npm-release-plan.md#publish-the-verified-archive-manually)
   and confirm the registry result. Promotion and tagging alone do not publish.

Keep `main` as the default branch. Do not force-push `production` or merge
ordinary development work into it between releases. Any changed source or
rebuilt archive needs refreshed verification; retain the earlier evidence.

## Urgent release fixes

Create a hotfix branch from `production`, for example `codex/hotfix-example`.
Limit it to the release fix and any needed version/package metadata. Open its
PR against `production`, run the release checks, and release a new patch version
with its own fixed tag and verified archive.

Merge the released fix back into `main` before the next regular release, keeping
the production commits in the shared history. Resolve any conflicts and verify
the development result. This keeps later releases from reintroducing the bug.
