# Production release preparation — 2026-10-09

**State:** retired-corpus requirement removed by owner decision; npm technical
verification passed in stages. Real-project production review and activation
remain separate and pending.
**Current target:** npm distribution of one `still-shift` package; the earlier
private-local preparation below remains historical operating evidence.
**npm publication:** the package implementation, all required software checks and
26 final clean-install checks are complete. The owner confirmed catalog authorship
for GPL-3.0-only distribution and published `still-shift@0.1.0`. The public registry
tags it `latest`; the downloaded archive exactly matches the tested candidate.
See the [npm release plan](./npm-release-plan.md)
and [verification record](./npm-release-results.json).

## npm publication readiness — 2026-10-09

**Historical audit before package implementation.** At this checkpoint the
checkout was not ready to release to npm. The initial preparation and render
evidence concerned local source-checkout use. Removing the retired corpus
requirement does not resolve the package distribution blockers.

| Blocker                                      | Evidence and required work                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publication disabled                         | The root and all six workspace manifests set `private: true`. Select the public packages and configure their publication metadata. [npm refuses to publish private packages](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#private).                                                                                                                                                                                                                          |
| No tested installed entry point              | Root `build` is `tsc --noEmit`; library exports point to TypeScript source. The CLI has no `bin` mapping. Define and build the supported runtime entry points and declare the dependencies they need.                                                                                                                                                                                                                                                                        |
| Runtime assumes repository layout            | `tools/still-shift-cli/src/cli.ts` imports `../../../packages/animation-engine/src/commerce-preparation.ts`, and the composition runner locates motion source through `../../../../packages/motion-builder/src/`. These targets are absent from the CLI package and do not match ordinary separately installed package paths. Other rendering and soundtrack paths also assume a checkout. Resolve dependencies through installed packages and ship required runtime assets. |
| Distribution contents and license unresolved | No package has a `files` allowlist or license field, and there is no root license file. The [soundtrack distribution decision](./soundtrack-project.md#verification-and-licensing) explicitly requires revisiting publication with that feature. Decide the shipped feature set and license, then audit the package contents and notices.                                                                                                                                    |
| Release validation incomplete                | No clean install of packed packages outside this checkout has passed. Full final-candidate `pnpm check:all` is still pending. Registry name/scope ownership, version availability and access have not been checked.                                                                                                                                                                                                                                                          |

A local CLI `npm pack --dry-run --ignore-scripts --json` succeeds, listing
21 files: TypeScript sources, `package.json` and README, with no compiled output
or sibling engine sources. Reported archive size is 31,779 bytes (125,516 bytes
unpacked). This checks the proposed contents only; it creates no archive,
performs no installed-package execution and publishes nothing. The raw output
and its hash are recorded in [release results](./production-release-results.json).

The `workspace:*` dependencies require a coordinated packaging strategy, but
their syntax alone is not a blocker: [pnpm rewrites workspace references when
packing or publishing](https://pnpm.io/workspaces#publishing-workspace-packages).
That rewrite does not repair relative imports into the repository.

Before npm release, implement the chosen package layout, runtime assets,
entry points and dependency declarations; run a clean external install and
CLI/render smoke test from the resulting archives; then verify the final candidate
locally and resolve publication metadata and distribution decisions. This audit
does not change package privacy, choose a license or publish a version.

## Historical private-local candidate and supported scope

The candidate production source is `main` at
`bd0197cdcbef7ef78f84d41d55c3dad508c34b7f`, tree
`3fff7bddd2d92243caf0b5868a3be4afd68d726a`. It includes merged CE14/CE15 and
their review repairs. Preparation changes include documentation and the approved
release-script/test update below. Package and renderer versions, lockfiles, fixtures
and software acceptance thresholds stay unchanged.
No version tag, hosted deployment, npm publication or public binary is created.

- Author `composition-1` JSON or TypeScript; use the existing family adapters,
  Lab inspection, native media/audio and composition exports.
- Reference environment: `darwin-arm64`, pinned software rendering for exports;
  hardware previews retain their documented tolerance policy.
- Evaluator: `composition-evaluator-57`; Canvas: `composition-canvas-1.47.7`;
  WebGL: `composition-webgl2-0.68.7`. Result manifests record actual identities.
- Soundtrack processing is a separate local opt-in runtime. Its backend binaries
  are not included in project packages. Public distribution needs the decision
  recorded in the [soundtrack guide](./soundtrack-project.md#command-only-setup-and-lifecycle).
- CE5-X, CE6-P, CE9-F1 and CE8-L-F retain their existing blocked/deferred/follow-up
  states. This release preparation does not start or complete them. The active
  roadmap does not make these unscheduled proposals prerequisites by mention.

## Retired corpus requirement removed

**Owner decision, 2026-10-09:** “discard requirement of retired corpus.”
The production technical release gate is now:

```sh
pnpm check:all
# runs: pnpm check && pnpm benchmark
```

This supersedes the earlier unresolved acceptance-policy mismatch. The October 8
[active roadmap](../ROADMAP.md#archived-and-removed-from-active-priorities) keeps
Phase 0 archived. `pnpm corpus:check` remains a standalone historical diagnostic;
its incomplete corpus no longer blocks production release. No new corpus, freeze,
image selection or review of retired inputs is required for this release.

All existing software correctness, render, baseline, lifecycle and benchmark checks
remain required. The historical Phase 0 experiment is still unverified; removing
its requirement does not turn its old failing result into a pass.

### Release gate for private local composition use

The technical command above is adopted. The production operating target remains
provisional; project review and activation below are still pending.

1. Freeze the candidate source revision and pinned dependencies; run the complete
   local `pnpm check:all` (`pnpm check` followed by `pnpm benchmark`). Preserve every correctness,
   export, baseline and lifecycle check. The benchmark is the existing no-op
   benchmark; it does not establish production render throughput. Prior full
   composition gates took approximately four hours on this machine.
2. Validate the selected real production project; render it in separate fresh
   output directories with the intended backend, resolution, frame rate and
   delivery format. Verify complete encoded and decoded output identity where
   required, exact frame count/timing, asset/font identities and matching audio.
   Record the actual operating limits and timings for that project.
3. Reopen the saved project and dependencies through its supported workflow.
   Have the named reviewer watch the complete export and check explanation,
   readability, continuous playback and listening as applicable. Record the
   reviewer, date, artifact hashes and accepted limitations.
4. Record the accepted commit, project revision, artifact hashes, previous
   production checkout and rollback procedure before activation. Keep private
   media and the opt-in soundtrack runtime local. Approve a public distribution
   route separately if one is later requested.

The standalone archived-corpus check remains non-green and outside the production
gate. A new composition release does not establish that historical experiment's
acceptance.

## Missing production-proof records

The earlier preparation audit found the detailed mechanism and authoring records
absent. MS0 on 2026-10-09 restores the [mechanism production plan](./mechanism-shorts-production-plan.md)
and [feedback audit](./mechanism-shorts-feedback-coverage-audit-2026-10-07.md),
locates original E01 sources and records their dependencies in the
[MS0 results](./mechanism-shorts-ms0-results.json). This resolves mechanism source
recovery; portable E01 implementation and human visual/listening acceptance remain
separate work. Veymelo authoring-study files remain outside this milestone's scope.
Existing technical examples do not establish the E01 production proof.

## Installation and operating procedure

Use the exact versions in [toolchain.json](../toolchain.json). Activate Node
22.23.1 and pnpm 10.29.3 before running these repository-root commands:

```sh
pnpm install --frozen-lockfile
uv sync --frozen --python 3.12.11
pnpm browser:install
pnpm toolchain:check
```

FFmpeg and ffprobe 8.0.1 must be on `PATH`. For opt-in soundtrack projects:

```sh
pnpm soundtrack:setup
pnpm test:integration:command
```

The setup uses a separate ignored runtime under
`benchmarks/results/composition-ce16/runtime`; no credentials or provider service
are required for these local operations. User project media and fonts must remain
available and match the checksums recorded by the saved project.

Start the inspection UI with `pnpm lab`; it binds to `127.0.0.1`. Validate the
saved project before rendering. Use a fresh output path for each candidate:

```sh
pnpm --silent still-shift comp validate --input examples/composition/12-puppet-acting/composition.json
pnpm --silent still-shift comp render --input examples/composition/12-puppet-acting/composition.json --output /tmp/still-shift-release-puppet.mp4 --backend webgl2
```

The example is a technical smoke render. For production, substitute the reviewed
project and save its source, dependencies, result manifests and output checksums.
Keep prior accepted outputs and the previous production checkout available during
activation. There is no recorded prior production deployment to name as a rollback
target yet; record it before replacing one. Render/cache version identities must
remain intact when switching checkouts.

## Verification evidence

Fresh preparation checks and sample exports are recorded in
[release results](./production-release-results.json). Raw logs, result manifests
and rendered samples remain in the ignored artifact directory recorded there.
The core code checkpoint is fixed; documentation changes are checked separately.

| Fresh check                                         | Result                                                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned toolchain                                    | Pass, including a real headless Chromium launch                                                                                                                            |
| Runtime                                             | 85 tests in 13 files pass                                                                                                                                                  |
| Depth                                               | 14 tests pass                                                                                                                                                              |
| Local soundtrack setup and command-only integration | Pinned runtime installed; 48 tests pass                                                                                                                                    |
| Lab/browser smoke                                   | Session recovery, playback, source retry, depth controls and component export/seek checks pass                                                                             |
| Independent native puppet exports                   | Four H.264 exports: 320×192, 48 frames, 24 fps, 2 seconds each; complete encoded files and decoded RGBA agree within each backend across one/four workers and cache off/on |
| Existing no-op benchmark                            | Pass; no production throughput claim                                                                                                                                       |

These are bounded preparation checks. The four sample exports are silent technical
fixtures; no human visual/listening review or real-project acceptance is inferred.
The full current-head `pnpm check` remains pending for the final release candidate.

The preceding readiness pass covered schema, boundaries, formatting, lint, build
and 3,662 unit tests in stages. The initial missing locked dependencies were
restored, and the two sandbox-limited process-lock tests passed unchanged outside
the sandbox. This is not an uninterrupted aggregate `check:fast` result.

CE14 and CE15's historical full-gate logs and hashes are retained in their
[completion](./composition-ce14-results.json)
[records](./composition-ce15-completion-results.json). They establish their named
checkpoints, not a new release approval for a later commit.

## Promotion checklist

- [x] Owner removes the retired corpus requirement; the technical command is updated.
- [ ] Owner confirms the production operating target.
- [ ] Authoritative production-proof records and project inputs are available.
- [ ] The selected full technical gate passes on the final candidate.
- [ ] Complete output has named visual, playback and listening review as applicable.
- [x] Updated `check:all` scope and historical corpus status are recorded.
- [ ] Previous deployed revision, output retention and rollback target are recorded.
- [ ] Candidate version/tag and activation are approved if a formal release is desired.

GitHub Actions remain prohibited. Verification and release preparation are local.
