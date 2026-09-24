# Single-image animation CLI

Run one existing explainer still through the full local pipeline:

```bash
pnpm still-shift animate \
  --input ./path/to/still.png \
  --output ./outputs/still.mp4 \
  --duration 5 \
  --fps 30 \
  --preset auto \
  --intensity standard \
  --seed 1842
```

The command writes a 1920×1080 H.264 MP4 and `still.mp4.scene.json`. It prints one JSON `AnimationResult` with the output path, scene path, rendered/fallback status, selected preset, stable warnings, source/depth/scene/output SHA-256 checksums, cache status, timings, and tool versions. The output and manifest paths must not already exist. The scene manifest includes the full resolved scene and normalized source/depth asset paths for local reproduction.

`--preset auto` chooses among the three presets using the normalized source checksum and seed. Durations are 3–8 seconds in whole 30-FPS frames. The default depth model is Depth Anything V2 Small; preparation is cached. Valid images whose depth preparation or safety analysis fails produce a deterministic 2D MP4 with a reason code. Invalid inputs and export failures are errors. The CLI does not overwrite outputs.

Exit code 0 means a complete result, including a valid 2D fallback. Exit code 2 means invalid command options or request constraints. Exit code 1 means an input, preparation, render, encode, or publication failure; stderr contains one JSON `AnimationFailure`. `--adapter noop` keeps the v0.1 fake path available for compatibility checks. For local fixtures, `STILL_SHIFT_DEPTH_ADAPTER=fake` selects the deterministic fake depth worker.

`pnpm test:browser:cli` exercises an explainer-shaped fixture, cache reuse, repeated checksums, depth-failure fallback, invalid input, and existing-output protection.

## Unattended batch

Create a UTF-8 JSONL file with one object per line. IDs must be unique and use letters, digits, underscores, or hyphens (1–80 characters). Paths are resolved relative to the JSONL file. Blank lines are ignored.

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

The batch keeps going after an individual item fails. Exit code 0 means all items rendered or produced valid 2D fallbacks; 1 means at least one item failed; 2 means invalid command options. For a partial failure, fix the source or manifest and rerun the same command. Completed items are reused only when their request, source, scene, and MP4 hashes match the checkpoint. A changed request or damaged artifact is reported as an item failure to avoid silently overwriting earlier work. To intentionally rerender one ID, move its MP4, scene manifest, and checkpoint out of the output directory before retrying. Concurrent batch commands targeting one output directory are rejected.

`pnpm test:browser:batch` verifies mixed success/failure, bounded execution, retry identity, and artifact tamper detection.
