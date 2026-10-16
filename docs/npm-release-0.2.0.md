# Still Shift 0.2.0

**Status:** release candidate preparation; publication and release approval pending.
**Baseline:** published `0.1.1`, source `73c01fa7`.
**Integrated feature source:** merged PR #58, `9c94101d`.

Adds mechanism episode authoring, native 3D composition, reusable cue-driven packs
and recoverable production queues with portable handoffs.

## Changes

- Author, inspect, validate, prepare, compile, render, check, patch and package
  mechanism episodes through the public engine API and `episode` CLI.
- Combine bounded native solid meshes, world graphics, cameras, depth and physical
  anchors with composition overlays. Prepare bounded rigid glTF/GLB and verified
  PBR resources for preview and export.
- Reuse mechanism family controls, legal transitions, supplied narration cues,
  camera/annotation recipes and revision-aware cached native plates.
- Run durable production queues with interruption recovery, retry requests,
  located failure/evidence reports, scoped repairs and portable handoffs.
- Retain the reviewed identifier, receiver-FPS, filesystem admission, cancellation,
  camera, shader-precision and lifecycle error-reporting repairs from the merged
  milestone PRs.

See the [episode CLI](./mechanism-episode-cli.md),
[native PBR guide](./native-pbr-resources.md),
[reusable family guide](./mechanism-family-authoring.md),
[cue lifecycle](./mechanism-cue-lifecycle.md) and
[production queue guide](./mechanism-production-queue.md).

## Compatibility and setup

The existing package entry points and documented command families remain. A new
`still-shift/renderer/native3d-browser` subpath exposes the browser integration;
mechanism APIs extend the existing engine/schema entry points. Invalid native
scopes, unsupported camera inputs and unsafe artifact files now fail with located
diagnostics. Do not depend on previously accepted invalid or unsupported inputs.
Existing illustrated, cinematic, story, commerce and composition inputs remain
covered by the complete local regression and installed-package release gates;
results are recorded separately after execution. This pre-1.0 release does not
promise a stable API for future versions.

Use Node `>=22.23.1 <23` with the package's locked runtime dependencies. Release
verification targets macOS on Apple Silicon with the versions in `toolchain.json`.
Other platforms remain unqualified. Browser, Python/depth and soundtrack runtimes
require explicit setup; FFmpeg/ffprobe are external prerequisites. Installation
runs no lifecycle setup and bundles no models, private narration or pilot assets.
Core/default Three remains Blender-free. Blender capture is an explicitly selected
host integration; the pilot's Blender qualification is limited to its recorded
executable, source and runtime profile.

## Acceptance and limits

The new package capabilities are technically implemented. Candidate mechanism
families and the MS3 pilot remain experimental; this release does not certify the
ten pilot videos as supported or accepted products.

- Original first-pass completion is **1/10 (10%)**, below the **90%** target; the
  nine original failures remain retained.
- Comparable authoring-token savings are **unverified/null**, against a **50%**
  target. No full-production speed or cost claim follows from the no-op benchmark.
- Reviewed-ready/supported/accepted pilot products remain **0/10**. Whole factual,
  mechanical, encoded-text/readability, normal-speed motion, listening and owner
  reviews remain open. Export/cache/frame checks do not replace those reviews.
- Existing CE6-P WebGL timing requirements remain owner-deferred; nineteen recorded
  timing deferrals remain explicit. Finer Thai motion is unadopted. MS4 scale,
  diversity and sound extensions remain future work.

The [MS3 acceptance tracker](./mechanism-shorts-ms3-acceptance.md) retains source
bindings, failed attempts and the distinction between implementation, actual pilot
execution and product acceptance. Release approval must explicitly include this
limited experimental scope.

## Release verification

Run `pnpm release:check` on the final committed candidate with pinned tooling and
locked dependencies. Preserve actual results, failures, reruns, archive checksums
and the exact source commit in [release results](./npm-release-results.json).
The [release plan](./npm-release-plan.md) describes promotion and publication.
A source change or rebuilt archive requires refreshed corresponding verification.
No historical milestone run is a fresh gate for this versioned candidate.
