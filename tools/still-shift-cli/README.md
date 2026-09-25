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

`--preset auto` chooses among the three presets using the normalized source checksum and seed. Durations are 3–8 seconds in whole 30-FPS frames. The default depth model is Depth Anything V2 Small; preparation is cached. Valid images whose depth preparation or safety analysis fails produce a deterministic 2D MP4 with a reason code. Invalid inputs and export failures are errors. The CLI does not overwrite outputs.

Source-normalization warnings use the stable `SOURCE_NORMALIZATION_WARNING` code and include the depth worker's specific reason in `context.workerCode`.

Exit code 0 means a complete result, including a valid 2D fallback. Exit code 2 means invalid command options or request constraints. Exit code 1 means an input, preparation, render, encode, or publication failure; stderr contains one JSON `AnimationFailure`. `--adapter noop` keeps the v0.1 fake path available for compatibility checks. For local fixtures, `STILL_SHIFT_DEPTH_ADAPTER=fake` selects the deterministic fake depth worker.

`pnpm test:browser:cli` exercises an explainer-shaped fixture, cache reuse, repeated checksums, depth-failure fallback, invalid input, and existing-output protection.
