# Documentation patch 0.1.1

**Status:** published and registry-verified on 2026-10-10. npm `latest` is `0.1.1`;
`production` and annotated `v0.1.1` point to verified source `73c01fa7`.

The `0.1.1` candidate adds complete usage guidance and both Still Shift skills to
the npm archive, fixes installed README links and refreshes feature discovery for
all implemented composition, preset, commerce, passage and soundtrack workflows.
The package includes small examples and text guides while omitting historical
measurement dumps and rendered review media. Runtime behavior and dependencies
remain unchanged.

The isolated branch starts from `main` `e6eb7b06` and includes only the usage
refresh, public package version metadata and one correction marking the Three.js
preparation bridge as planned. Unrelated roadmap and research edits remain in
their original checkout. Internal workspace and schema versions are independent
of the public package and retain their existing values.

Prepare the pinned toolchain and frozen dependencies on a fresh checkout:

```sh
pnpm install --frozen-lockfile
uv sync --frozen --python 3.12.11
pnpm browser:install
pnpm soundtrack:setup
pnpm toolchain:check
```

The full gate needs the separate hash-locked soundtrack runtime even when this
patch changes only documentation. Commit the candidate source and run
`pnpm release:check`. Retain failed runs and reruns. Record the exact
source commit and final archive checksum in [release results](npm-release-results.json)
before any publication. Publish only the verified `dist/releases/still-shift-0.1.1.tgz`
when explicitly authorized; follow the [manual procedure](npm-release-plan.md#publish-the-verified-archive-manually)
and authenticate only if publication is requested.

Release promotion #54 fast-forwarded `production` to the exact verified source.
`v0.1.0` and the published `0.1.0` archive remain fixed. Software checks do not
establish human visual or listening acceptance.

## Preparation history

The first full run on `a437d980` passed all source checks, 3,666 unit tests and
85 runtime tests, then stopped with 38 integration failures caused by the absent
fresh-checkout audio runtime (280 integration tests passed). The log is retained
at `benchmarks/results/npm-patch-0.1.1-20261010/full-gate-attempt-1.log`. The locked
audio runtime is now prepared, and the fresh-checkout setup instructions above
are explicit. Rerun the full gate on the committed revised candidate; retain
both runs and keep thresholds and frozen baselines unchanged.

## Completion

The revised full gate passed in stages, retaining the owner-interrupted rerun
and continuation. All 69 required browser commands and 27 online installed-package
checks pass; frozen baselines and thresholds remain unchanged. The owner authorized
publication and completed npm browser authentication. The downloaded public
archive matches the verified candidate byte for byte, SHA-256
`5cf82c0379f3a78e5b91b96200b5f9b5816cbf8975f860a3deda40fe96fa8ac5`.
Initial npm authentication failures and stale registry reads are retained in
[release results](npm-release-results.json). Existing WebGL timing deferrals, the
no-op benchmark limit and separate human visual/listening acceptance remain in effect.
