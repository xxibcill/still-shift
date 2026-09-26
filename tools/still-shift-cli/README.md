# Single-image animation CLI

Run one existing explainer still through the full local pipeline:

```bash
pnpm --silent still-shift animate \
  --input ./path/to/still.png \
  --output ./outputs/still.mp4 \
  --duration 5 \
  --fps 30 \
  --preset auto \
  --intensity standard \
  --seed 1842
```

The command writes a 1920×1080 H.264 MP4 and `still.mp4.scene.json`. `--silent` keeps pnpm's script banner off stdout, so stdout contains one JSON `AnimationResult` with the output path, scene path, rendered/fallback status, selected preset, stable warnings, source/depth/scene/output SHA-256 checksums, cache status, timings, and tool versions. The output and manifest paths must not already exist. The result's `checksums.source` hashes the original input file. The scene manifest identifies the normalized source and depth by checksum so its bytes and scene checksum do not depend on the local cache directory. The result's `assetPaths` gives the current normalized source and depth paths for local reproduction. Both the result and scene manifest record the depth model ID, revision, and weight checksum, or `null` when depth preparation failed.

`--preset auto` chooses among the three presets using the normalized source checksum and seed. Durations are 3–8 seconds in whole 30-FPS frames. The default depth model is Depth Anything V2 Small; preparation is cached. Valid images whose depth preparation or safety analysis fails produce a deterministic 2D MP4 with `DEPTH_PREPARATION_FAILED` or `DEPTH_SAFETY_ANALYSIS_FAILED`, respectively. Invalid inputs and export failures are errors. The CLI does not overwrite outputs.

Source-normalization warnings use the stable `SOURCE_NORMALIZATION_WARNING` code and include the depth worker's specific reason in `context.workerCode`.

Set `STILL_SHIFT_CACHE_DIR` to choose another preparation cache. Relative paths are resolved from the CLI caller's working directory, including when the depth worker runs from the repository root.

Four explicit editorial presets—`locked_hold`, `story_settle`,
`panel_reveal`, and `comparison_step`—normalize the source and render in flat
2D without running depth inference. They return a normal rendered result, with
`depth: null` in the scene manifest. Choose a reveal only for a composition
authored for its reading order; see the
[illustrated-motion trial](../../docs/history-offstage-presets.md).

Exit code 0 means a complete result, including a valid 2D fallback. Exit code 2 means invalid command options or request constraints. Exit code 1 means an input, preparation, render, encode, or publication failure; stderr contains one JSON `AnimationFailure`. `--adapter noop` keeps the v0.1 fake path available for compatibility checks. For local fixtures, `STILL_SHIFT_DEPTH_ADAPTER=fake` selects the deterministic fake depth worker.

`pnpm test:browser:cli` exercises an explainer-shaped fixture, cache reuse, repeated checksums, intentional flat 2D, depth-failure fallback, invalid input, and existing-output protection.

## Prepared illustrated scenes

Story recipes use `story-scene-1` with integer `frameCount`, explicit cue frames
and the same `animate-scene` command. They return `story-result-1` and support
fractional derived milliseconds, including 646 frames at 24 fps. See the
[seven-recipe guide](../../docs/story-motion-implementation.md) and
[fixtures](../../benchmarks/fixtures/story-motion/catalog.json). Legacy v1/v2
contracts retain their duration limits.

The six richer History Offstage presets use a scene JSON containing supplied image
layers, paths, text, and authored states:

```bash
pnpm still-shift animate-scene \
  --scene benchmarks/fixtures/history-offstage-v2/resource-flow.json \
  --output /tmp/resource-flow-new.mp4
```

The scene supplies its preset, duration, and explicit 24 or 30 fps frame rate.
Clips must span 3–8 seconds in whole frames. Assets are resolved relative to the
JSON and checked against their SHA-256 hashes and dimensions. Missing roles,
invalid paths/crops, and missing alternate states produce errors before export.

This command writes the MP4, `.mp4.scene.json`, and `.mp4.result.json`; stdout
contains an `illustrated-result-1` result. Output files must not already exist.
Prepared input is separate from `animate --input` and the existing image batch
format. See the [six preset guide](../../docs/history-offstage-motion-implementation.md)
for the lab, reusable examples, and review reel. `pnpm illustrated:render
--output-dir <new-directory>` renders the six prepared fixtures through this CLI.

The prepared-scene command also accepts `illustrated-scene-2` for the cinematic
`layered_parallax` recipe. It supports `dramatic`, `standard`, and `restrained` intensity in
the scene JSON and returns `illustrated-result-2` with camera-validation metrics.
Every frame must satisfy declared background coverage and subject framing;
unsafe or insufficiently separated planes fail explicitly. See the
[cinematic guide](../../docs/cinematic-parallax-implementation.md) for examples.

The same command accepts the `threshold_push` recipe with `camera.push`, two
foreground sides, a subject assembly, and a distant plate. It checks source
resolution after magnification on every frame. Run `pnpm threshold:render
--output-dir <new-directory>` for its two compositions and Standard comparison;
see the [Threshold Push guide](../../docs/threshold-push-implementation.md).

The `lateral_track` recipe uses nonzero X travel, zero Y/Z travel, fixed scale,
and visible subject drift. Run `pnpm lateral:render --output-dir <new-directory>`
for two grounded room compositions and a Standard comparison. See the
[Lateral Track guide](../../docs/lateral-track-implementation.md).

The `foreground_reveal` recipe adds an authored vessel polygon and validates actual
foreground alpha before rendering. It clears the subject and holds the ending.
Run `pnpm reveal:render --output-dir <new-directory>`; see the
[Foreground Reveal guide](../../docs/foreground-reveal-implementation.md).

## Unattended batch

Create a UTF-8 JSONL file with one object per line. IDs must be unique regardless of letter case and use letters, digits, underscores, or hyphens (1–80 characters). Paths are resolved relative to the JSONL file. Blank lines are ignored.

```jsonl
{"id":"shot-001","inputPath":"./stills/first.png","durationMs":5000,"preset":"auto","intensity":"standard","seed":1842}
{"id":"shot-002","inputPath":"./stills/second.png","durationMs":3000}
```

```bash
pnpm still-shift batch \
  --manifest ./shots.jsonl \
  --output-dir ./outputs \
  --concurrency 2
```

`durationMs`, `preset`, `intensity`, and `seed` default to the single-image CLI values. Concurrency is bounded to 1–2 renders; it defaults to 1. Each item writes `<id>.mp4`, `<id>.mp4.scene.json`, and a private `.batch-checkpoints/<id>.json` checkpoint. After all items finish, the command atomically writes `batch-results.jsonl` in input order and `batch-summary.json`. Each result record includes line number, ID, input path, request hash, reuse flag, status, and either the full `AnimationResult` (paths, warnings, checksums, timings, selected preset) or an `AnimationFailure`. The summary contains counts, reuse count, success rate, elapsed time, and paths.

The batch keeps going after an individual item fails. Exit code 0 means every manifest item has a result record, including any per-item failures; check `batch-summary.json` and `batch-results.jsonl` for their status. Exit code 2 means invalid batch configuration, and 1 means batch execution stopped before the results were complete. For a partial failure, fix the source or manifest and rerun the same command. Completed items are reused only when their request, source, scene, MP4, normalized source, and depth hashes match the checkpoint. A changed request or damaged artifact is reported as an item failure to avoid silently overwriting earlier work. An interrupted run leaves an owner lock and per-item progress markers; the next run reclaims a lock whose process has exited and rerenders an uncheckpointed item only when its request and source still match the marker. Outputs without a matching progress marker remain protected. To intentionally rerender one ID, move its MP4, scene manifest, and checkpoint out of the output directory before retrying. Concurrent batch commands targeting one output directory are rejected.

The WebGL path uses the lossless in-memory PNG frame pipe by default. `STILL_SHIFT_FRAME_TRANSPORT=jpeg_pipe` selects the faster 95%-quality JPEG evaluation path. The transport is recorded in the scene manifest and result metrics; transport, depth adapter, and requested depth device are included in batch checkpoint identity. `batch-runs.jsonl` preserves each run summary so a fast retry does not replace the full-render wall-time measurement.

`pnpm test:browser:batch` verifies mixed success/failure, bounded execution, retry identity, and artifact tamper detection.
