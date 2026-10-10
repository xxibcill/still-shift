# Documentation patch 0.1.1

**Status:** preparation and full local verification in progress; unpublished.

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

Use the pinned toolchain and frozen dependencies, commit the candidate source,
and run `pnpm release:check`. Retain failed runs and reruns. Record the exact
source commit and final archive checksum in [release results](npm-release-results.json)
before any publication. Publish only the verified `dist/releases/still-shift-0.1.1.tgz`
when explicitly authorized; follow the [manual procedure](npm-release-plan.md#publish-the-verified-archive-manually)
and authenticate only if publication is requested.

Existing `production`, `v0.1.0` and the published `0.1.0` archive remain fixed
until an approved release promotion. Software checks do not establish human
visual or listening acceptance.
