# Still Shift

Still Shift is a local, deterministic still-image animation engine spike. The v0.1
foundation and fake animation path are merged. The v0.2 depth worker prepares and caches
normalized images and validated depth assets; animation rendering is still future work.

The v0.1 animation CLI still writes an explicitly labeled `.noop.json` artifact and
does **not** produce video or motion. The separate v0.2 depth CLI can estimate depth;
it does not yet connect depth assets to a renderer.

## Pinned toolchain

| Tool             | Version                                  |
| ---------------- | ---------------------------------------- |
| Node.js          | 22.23.1                                  |
| pnpm             | 10.29.3                                  |
| Python           | 3.12.11                                  |
| uv               | 0.7.12                                   |
| Playwright       | 1.62.1                                   |
| Chromium         | 151.0.7922.34 (Playwright revision 1234) |
| FFmpeg / ffprobe | 8.0.1                                    |

The canonical machine-readable pins are in [`toolchain.json`](./toolchain.json).
`.tool-versions`, `.node-version`, `.nvmrc`, `.python-version`, lockfiles, and exact
package versions make the pins usable by common local tool managers.

## Install

Install the versions above using your preferred version manager, then run:

```bash
corepack enable
corepack prepare pnpm@10.29.3 --activate
pnpm install --frozen-lockfile
uv sync --frozen --python 3.12.11
pnpm browser:install
```

FFmpeg and ffprobe 8.0.1 must be available on `PATH`. The check command verifies all
pins and launches the installed Chromium binary, so version drift or a missing browser
fails visibly.

## Verify

Run the software-only foundation checks while the corpus is being assembled:

```bash
pnpm check
pnpm benchmark
```

Run the complete v0.1 release-readiness gate with:

```bash
pnpm check:all
```

`check:all` includes `corpus:check` and intentionally remains non-zero until the real
explainer corpus is reviewed and frozen.

Individual commands are also available:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test:unit
pnpm test:integration
pnpm benchmark
pnpm toolchain:check
pnpm depth:prepare -- --input path/to/image.png --adapter fake
pnpm depth:contact-sheet -- --manifest benchmarks/corpus-manifest.json
```

## Exercise the v0.1 CLI

```bash
pnpm still-shift animate \
  --input tests/fixtures/source-placeholder.txt \
  --output /tmp/still-shift-example.noop.json \
  --duration 5 \
  --preset auto \
  --intensity standard \
  --seed 1842
```

The command prints an `AnimationResult` JSON record. It also writes the no-op artifact
and a sibling `.scene.json` manifest. Repeated requests with the same source bytes and
animation parameters produce identical source, scene, and output checksums.

## Prepare depth with v0.2

The depth worker can be run separately from the no-op animation CLI:

```bash
pnpm depth:prepare -- --input path/to/image.png
```

The first run downloads the pinned Depth Anything V2 Small weights. Use
`--adapter fake` to prepare deterministic fixture depth without downloading model
weights. Both modes write a normalized source image, raw float depth, a renderer-ready
depth texture, a provenance manifest, and cache metrics. See
[`services/depth-worker/README.md`](./services/depth-worker/README.md) for options and
the corpus contact-sheet command.

## Frozen corpus requirement

[`benchmarks/corpus-manifest.json`](./benchmarks/corpus-manifest.json) is a valid v0.1
manifest, but it is intentionally marked `incomplete`: the repository does not contain
the required 30–50 images from real explainer projects. The schema, runtime validation,
metadata fixture, ignored private-media directory, and freeze-readiness command are in
place.

After the real images and reviewed metadata are supplied, run:

```bash
pnpm corpus:check
```

That command remains non-zero until the target count, category coverage, project
provenance, rights, checksums, outstanding requirements, explicit review sign-off, and
freeze metadata are complete. Do not begin renderer tuning against a substitute demo
corpus.

See [`ROADMAP.md`](./ROADMAP.md) and
[`Phase_0_Implementation_Plan.md`](./Phase_0_Implementation_Plan.md) for the exact scope
and gates.
