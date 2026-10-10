# npm release — 2026-10-09

**Status:** `still-shift@0.1.0` published and verified. Technical
verification passed in stages; all 26 clean-consumer checks pass. The owner
confirmed catalog authorship and published the release on 2026-10-09.

**Registry check:** the public registry exposes `0.1.0` as `latest`. Its downloaded
archive is byte-for-byte identical to the candidate that passed all 26 installed
checks, including the GPLv3 catalog notices and runtime lock. See the dated
[registry verification](./npm-release-results.json).

## Scope and owner decisions

Prepare one public `still-shift@0.1.0` package with the command-line interface,
composition authoring API, renderer and soundtrack workflow. The repository root
manifest is public; its six internal workspace manifests remain private development
modules. `npm-release.json` defines the publishable manifest generated in `dist/npm/`.
The owner confirmed one public package on 2026-10-09. Root `publishConfig` uses
public npm access and points pnpm packing/publishing at `dist/npm`, with
`linkDirectory: false`; `prepack` builds that distribution first. This follows
[pnpm's publication-directory configuration](https://pnpm.io/package_json#publishconfigdirectory).

Owner decisions on 2026-10-09:

- Use `GPL-3.0-only` for the application.
- Include soundtrack support with a separately installed audio runtime.
- The retired corpus is not a release requirement.
- The owner created the commerce catalog; include it under GPL-3.0-only.

The commerce catalog's import initially recorded no supplied pack-level license.
The owner's authorship confirmation resolves that question for the selected
GPL-3.0-only release. The included provenance and notices record this decision.
No publication is performed while preparing and testing local archives.

### Commerce catalog being included

`catalogs/ecommerce-motion/source/v1.0/library_data.json` is the imported
Ecommerce_Motion_Library_Pack: 40 product-ad format ideas, 12 motion techniques,
8 storyboard recipes and 16 external reference links. Examples include Hand
Cutout Reveal, Hand Hero + Kinetic Headline and Hand + Benefit Callouts. Each
format describes its assets, suggested timing, hook/body/close and cautions.
`catalogs/ecommerce-motion/capabilities.json` maps these ideas to implementation;
H01, H03 and H04 are implemented. The 40 ideas are not 40 finished ad templates.

The supplied pack contains descriptions and study links; external footage,
templates, music and artwork are not included. Its
[provenance record](../catalogs/ecommerce-motion/source/v1.0/SOURCE.md) records
that no pack-level license was supplied at import, followed by the owner's
2026-10-09 authorship confirmation and GPL-3.0-only distribution decision.

The verified production platform is macOS / Apple Silicon with Node 22.23.1,
pnpm 10.29.3 and the versions in `toolchain.json`. The package declares Node 22
at or above 22.23.1. Other operating systems remain unverified.

Existing milestone deferrals remain in effect. In particular, CE6-P WebGL
adapter timing is recorded by the current tests but its performance target
remains owner-paused/deferred. This preparation does not claim to complete that
target or change the current acceptance policy.

## Package contents and build

`pnpm build:package` emits ESM JavaScript and declarations, rewrites workspace
imports to paths inside the distribution, and preserves the relative layout
needed by browser pages, subprocesses and source-fingerprint checks. TypeScript
compilation must pass before anything is packed. Explicit schema and API types
allow declaration emission without expanding huge inferred Zod types; runtime
schema behavior and serialized JSON schemas remain unchanged.

The published `npm-shrinkwrap.json` pins transitive runtime dependencies. It is
explicitly listed in the package files, and packing fails if npm omits it. Refresh
it explicitly with `pnpm lock:package` after dependency or version changes, then
repeat release verification. The build rejects a stale lock.

The package includes the composition preview page, execution-runtime HTML pages,
Python worker source, runtime JSON catalogs, schema JSON and the commerce font
with its OFL notice. Only the declared runtime dependencies are installed. No
workspace dependencies, browser binaries, Python environments, models, test
renders or retired corpus media are bundled. Generated Python cache directories
and bytecode are excluded from runtime and source copies and rejected by the
archive inventory check.

`still-shift setup browser|soundtrack|depth` explicitly installs optional runtimes.
Soundtrack defaults to `~/.cache/still-shift/soundtrack`, or accepts
`STILL_SHIFT_SOUNDTRACK_PYTHON` for an existing runtime. FFmpeg/ffprobe and uv are
external prerequisites. Installing the npm archive does not run setup scripts.

GPLv3 license text, third-party notices, application source and build inputs
are shipped in the same package. `source/` contains the source needed to rebuild
using the pinned dependency lockfiles. Internal source-workspace manifests remain
private and are not separately published.

## Development and release branches

Adopted by the owner on 2026-10-09. The
[contribution guide](../CONTRIBUTING.md) and [agent instructions](../AGENTS.md)
define the working policy.

- Keep `main` as the default branch for development. Feature branches continue
  to merge into `main`.
- Use `production` for the latest approved release. Advance it only to a reviewed
  release commit, keeping it stable while development continues on `main`.
- Record each release with an annotated version tag such as `v0.1.0`. Keep
  existing release tags fixed; `production` advances as new releases are approved.
- Run the existing local `pnpm release:check` procedure against the candidate.
  Record its source commit and the verified archive checksum, and publish that
  exact archive using the manual steps below. Branch promotion alone does not
  publish an npm package. GitHub Actions remain prohibited.
- Prefer fast-forward promotion to the reviewed commit when ancestry permits.
  Avoid squashing release promotions so the branches retain shared history.
- Start urgent fixes from `production`, verify and release the patch, and merge
  the fix back into `main` before the next regular release.

The initial release checkpoint is `db28a938`, based on `bd0197cd`. `production`
and the annotated `v0.1.0` tag are pushed at that commit; `main` remains the
default development branch. Unrelated local research is preserved separately.
The committed source corresponds to the already
published `0.1.0` archive, whose SHA-256 is
`48c3988e09048e414d132ca5b286cdc2adb6de6f90eb7b0de582602ea9b34a8c`.
All 591 corresponding-source files in that archive match the committed tag
byte for byte. Documentation and branch setup do not rebuild the archive.
Any rebuilt archive needs its own package verification and checksum record.

Fresh bootstrap verification passes `pnpm check:fast`, including all 3,664 unit
tests. Its first sandboxed run passed schema/boundary/format/lint/build and 3,662
units but blocked the two process-identity cache-lock cases because `ps` was
denied. The complete rerun outside the sandbox passes without source changes.
Retain both logs under `benchmarks/results/release-branches-20261009/`, alongside
the archive source-comparison record. The earlier full staged release gate and
26 installed-package checks remain valid for the unchanged published archive;
this Git/documentation setup does not claim a new full `release:check` run.
[Setup results](./release-branch-setup-results.json) retain the commit, refs,
source comparison and fresh gate evidence. `main` receives the completion record
afterward; `production` and the version tag remain at the release checkpoint.

This follows Git's documented
[stable/development branch workflow](https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows)
and [release tagging](https://git-scm.com/book/en/v2/Git-Basics-Tagging).

## Local release procedure

```sh
pnpm install --frozen-lockfile
uv sync --frozen --python 3.12.11
pnpm browser:install
pnpm soundtrack:setup
pnpm release:check
```

Fresh checkouts need the pinned Python environment, Chromium and the separate
hash-locked soundtrack runtime because the full gate exercises all supported
workers. FFmpeg/ffprobe must also be on `PATH`; run `pnpm toolchain:check` to
confirm the pinned toolchain. Runtime setup does not publish a package.

`release:check` runs the existing full `check:all` software gate, then builds,
packs and tests the installed package. The archived corpus remains excluded.
GitHub Actions are prohibited; all verification runs locally.

`pnpm test:package` creates a fresh consumer directory outside the repository,
installs the actual tarball with npm without lifecycle scripts, checks the installed
command and public APIs, type-checks an authoring example with ordinary strict
consumer settings, loads JSON/TypeScript/legacy-motion programs, and renders
the puppet example through both Canvas 2D and WebGL2. It checks frame counts and
exact encoded parity with the source checkout, exercises browser preview/seeking,
explicit browser/depth/soundtrack setup and the installed audio workflow, and
rebuilds the included source. It
retains its result and archive checksum in `dist/releases/package-verification.json`.
Set `STILL_SHIFT_PNPM_STORE` to an existing pnpm store to exercise the alternative
pnpm offline installation path with cached dependencies.

`pnpm pack:release` only builds and packs; it does not replace release verification.
The publishable archive is `dist/releases/still-shift-0.1.0.tgz`. Publish that
verified archive after resolving any remaining distribution decisions and npm
account access. Use the tested tarball for `npm publish`, or the configured pnpm
publication directory; npm itself does not redirect a root publish to that directory.
Any change to
the archive invalidates the earlier package verification checksum.

### Publish the verified archive manually

The owner has completed this procedure for `0.1.0`. The commands below are retained
as the publication record; future releases need a new version and verified archive.

Use an npm account with two-factor authentication enabled. Run the following
commands in your own terminal and complete npm's browser authentication prompts:

```sh
cd /Users/jjae/Documents/playground/still-shift
nvm use 22.23.1
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish ./dist/releases/still-shift-0.1.0.tgz --access public --dry-run
```

The dry run reports the proposed publication without uploading the package.
Publish the already verified archive, then confirm its registry version:

```sh
npm publish ./dist/releases/still-shift-0.1.0.tgz --access public
npm view still-shift@0.1.0 version --registry=https://registry.npmjs.org/
```

Complete any two-factor prompt during publication. A successful publication makes
`still-shift@0.1.0` available by name. npm rejects an already published name/version
combination; future updates need a new version and newly verified archive.
[npm login](https://docs.npmjs.com/cli/v11/commands/npm-login/),
[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/),
[public-package authentication requirements](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/#direct-publishing).

A read-only registry lookup on 2026-10-09 returned npm E404 for `still-shift`.
This indicates no package metadata was available then; it does not reserve the
name or verify that a particular account can publish it. No credentials were
read and no publication was attempted.

A later check of the owner-linked package on the same date found a public
staging placeholder (`0.0.0-stage`), with two files / 333 unpacked bytes and no
CLI/library entry points. The authenticated current account is a maintainer,
but its staged-package list is empty and public `0.1.0` retrieval returns
ETARGET. No staged or published `0.1.0` archive was available for comparison.
The verified local archive remains unchanged. npm documents `0.0.0-stage` as
the placeholder created when staging a new package; approval publishes a staged
version when one exists. [npm staged publishing](https://docs.npmjs.com/staged-publishing/).

### Published release verification

After the owner reported publication, an exact-version registry lookup confirmed
`still-shift@0.1.0`, published at `2026-10-09T15:25:03.607Z`, with `latest` pointing
to that version. A read-only `npm pack still-shift@0.1.0 --ignore-scripts` download
matches the tested local archive byte for byte: SHA-256
`48c3988e09048e414d132ca5b286cdc2adb6de6f90eb7b0de582602ea9b34a8c`.
Registry integrity also matches the downloaded bytes. The package has 1,570 files,
GPL-3.0-only licensing, the CLI and all documented public exports.

Trimmed registry metadata, download inventory, archive and comparison evidence are
saved in `benchmarks/results/npm-release-20261009/published/` and summarized in
[release results](./npm-release-results.json). Byte identity carries the prior
26 installed-package checks to the live release; no software rerun was needed.
This verification performed no publication, stage approval, commit or tag change.

## Verification record

The aggregate `pnpm release:check` stopped after 5,860.625 seconds on a panel timing
ratio of 1.267 against the unchanged 1.25 limit; all pixels matched. Its full log
is preserved in `benchmarks/results/npm-release-20261009/full-gate.log`.
A focused rerun passed at 1.176 (both panel variants: 480 exact frames). The complete
commerce rerun then passed 127 items / 28,200 frames in 2,576.553 seconds, with the
panel at 1.151 and all export checks passing. The continuation completed every
remaining software command and the benchmark. No acceptance limits or renderer
and engine sources were changed during these runs. Completed groups include
3,664 unit tests, 85 runtime tests, 318 integration tests, 14 depth tests and all
required browser suites. The frozen-baseline check passed 176 items / 36,061
frames without regeneration. The benchmark remains the existing no-op check;
it does not establish production throughput.

The continuation then exposed an installed browser-setup bug: Playwright does
not export its `./cli` subpath. The wrapper now resolves the executable through
Playwright's exported package manifest. Installed help also uses the package
version and `npx still-shift` commands. After these repairs and excluding Python
cache files, the final `pnpm test:package` passed all **26 checks**, including all
three runtime setup commands, both render backends, preview, soundtrack and
corresponding-source rebuild. Final TypeScript, release-script lint and formatting
checks pass.

The tested archive is `dist/releases/still-shift-0.1.0.tgz`: 2,724,418 compressed
bytes, 19,961,632 unpacked bytes and 1,570 files. Its SHA-256 is
`48c3988e09048e414d132ca5b286cdc2adb6de6f90eb7b0de582602ea9b34a8c`.
After the owner confirmed one public package, the root manifest and its pnpm
publication-directory lock entry were updated. The first recheck exposed the
missing lock entry; after synchronizing it offline without dependency changes,
root pnpm packing and all 26 installed checks passed again. This archive
supersedes the earlier tested archives; all records are retained. Comparing npm
and pnpm archives also exposed an omitted runtime shrinkwrap. Its missing-file
guard fails before the allowlist repair; the corrected archive and installed
consumer contain identical release lock bytes, and all 26 checks pass again.

The owner then confirmed catalog authorship. Only the included provenance and
license notices changed; the final archive passes all 26 checks again, including
source rebuild, and its ownership notice is verified in the packed contents.

The installed-package record is `dist/releases/package-verification.json`; a copy
of the final archive, logs, manifest and source hashes is retained under
`benchmarks/results/npm-release-20261009/`.

The first clean install exposed omitted catalog JSON; the next
consumer type check exposed conditional Zod field declarations that depended on
`exactOptionalPropertyTypes`. Both are addressed in the package build/source.
The first corresponding-source rebuild also exposed a demo-only fixture dependency;
compilation now follows the shipped entry points and their dependency graph.
All technical release checks are complete in stages. The
[release results](./npm-release-results.json) retain the failed aggregate run,
focused rerun, continuation and final archive verification separately. This is
not an uninterrupted aggregate pass. The owner confirmed catalog authorship,
resolving the remaining distribution decision. The owner subsequently published
the exact verified archive; public registry verification is recorded above.

## Dependency security repair

The initial npm production audit reported a high-severity `image-size@2.0.2`
issue: malformed JXL/HEIF or ICNS input could leave its parsers looping. The
first full gate was intentionally stopped after 345.659 seconds to patch it;
that interrupted run is not a full pass.
[GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq),
[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr).

Both workspace references and the pnpm lock now pin `image-size@2.0.4`; the
release shrinkwrap was regenerated. A fresh npm production audit reports zero
known vulnerabilities at all severities. Default online package verification now
also checks the locked production dependencies before installation and fails on
high or critical findings. Offline pnpm verification does not query advisories.
The interrupted gate, before/after audit reports and earlier fast-suite log are
retained under `benchmarks/results/npm-release-20261009/`.
