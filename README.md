# Still Shift

Still Shift is a local, deterministic still-image animation engine spike. This
repository currently implements Phase 0 version **v0.1** only: contracts, toolchain,
corpus metadata structure, and a fake end-to-end engine/CLI path.

The v0.1 CLI writes an explicitly labeled `.noop.json` artifact. It does **not**
produce video, infer depth, or implement motion rendering. Those capabilities belong
to later roadmap versions.

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

Run every v0.1 foundation check and the no-op benchmark:

```bash
pnpm check:all
```

Individual commands are also available:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test:unit
pnpm test:integration
pnpm benchmark
pnpm toolchain:check
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

That command remains non-zero until the target count, category coverage, rights,
checksums, outstanding requirements, and explicit freeze metadata are complete. Do not
begin renderer tuning against a substitute demo corpus.

See [`ROADMAP.md`](./ROADMAP.md) and
[`Phase_0_Implementation_Plan.md`](./Phase_0_Implementation_Plan.md) for the exact scope
and gates.
