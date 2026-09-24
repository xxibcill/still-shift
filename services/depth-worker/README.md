# Depth worker

The v0.2 depth worker normalizes JPEG, PNG, and WebP images, estimates relative depth,
and stores validated outputs in a reusable content-addressed cache. It preserves raw
little-endian float32 depth for evaluation and writes an edge-smoothed 8-bit grayscale
texture for the renderer. It does not render animation.

Install the pinned environment from the repository root with `uv sync --frozen`, then
prepare one image:

```bash
uv run still-shift-depth prepare --input path/to/image.png
```

The result is JSON with paths for the normalized source, `depth.raw.f32`, `depth.png`,
and `manifest.json`. The default adapter downloads the pinned Depth Anything V2 Small
checkpoint on first use. To exercise normalization, caching, and output validation
without downloading model weights, select the deterministic fake adapter:

```bash
uv run still-shift-depth prepare \
  --input path/to/image.png \
  --adapter fake \
  --cache-dir /tmp/still-shift-depth-cache
```

The cache key covers the normalized source SHA-256, preprocessing and pipeline
versions, adapter/model identity, model-weight SHA-256, inference device, percentiles,
and smoothing parameters. Entries publish atomically under
`~/.cache/still-shift/depth` by default. Set `STILL_SHIFT_CACHE_DIR` to move the cache.
Cache reads validate artifact checksums, dimensions, raw float range, and image modes;
invalid entries are discarded and rebuilt.

Generate the full corpus review sheet after the real corpus is supplied and frozen:

```bash
uv run still-shift-depth contact-sheet \
  --manifest benchmarks/corpus-manifest.json \
  --workspace-root . \
  --output benchmarks/gallery/depth-contact-sheet.png
```

The PNG compares each normalized source with its prepared depth texture. A companion
JSON file records per-image cache state, timings, checksums, and stable failures. With
the current empty corpus manifest, the command writes an explicitly pending placeholder
sheet and reports zero prepared images; this does not satisfy the visual review gate.

Model identity, licensing, and the immutable weight checksum are recorded in
[`docs/v0.2-depth-model.md`](../../docs/v0.2-depth-model.md).
