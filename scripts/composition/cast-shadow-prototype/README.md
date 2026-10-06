# Flat-alpha cast-shadow experiment

This directory is isolated from production imports. It prepares a candidate for
CE8-L-F integration after CE8 and CE8-L. Read the
[specification](../../../docs/composition-ce8lf-cast-shadow-spec.md) first.

- `model.ts`: bounded alpha-plane contract, CPU ray/UV oracle, vertex projection,
  fixed disk tables and a premultiplied linear colour probe.
- `fixtures.ts`: explicit alpha rasters and planes. Nine border/geometry controls
  and three opaque-solid hard/soft controls; these are not native asset adapters.
- `reference.ts`: 64² reference bytes and eight explicit triangle-wave poses per
  fixture. It never invokes or substitutes for CE7's evaluator.
- `shader.ts`: independent GLSL intersection/UV/bilinear/transmission implementation
  and an isolated browser draw. Output is grayscale visibility with opaque alpha.
- `verify.ts`: frozen CPU references, software forward/reverse/random seeks,
  independent software pixel/PNG repeats and one hardware pose per fixture. A
  separate 8-caster/16-sample/64²-alpha smoke probe checks the maximum input size.
  A near-collinear regression must fail preflight before constructing shader input.

Run from the repository root with its own installed dependencies:

```sh
export PATH=/Users/jjae/.nvm/versions/node/v22.23.1/bin:$PATH
pnpm exec vitest run tests/unit/cast-shadow-prototype.test.ts --maxWorkers=1 --no-file-parallelism
node --import tsx scripts/composition/cast-shadow-prototype/verify.ts
```

Chromium needs permission to launch its macOS bootstrap service when invoked from
a restricted shell. The runner serves no app and uses no Vite optimizer/config
cache. It uses the existing pinned render-browser flags and actual hardware
profile, verifies Chromium 151.0.7922.34 and records both fingerprints.

References are under `tests/visual/cast-shadow-prototype/`. Checks never overwrite
them. The two initialization flags (`--initialize-reference` and
`--initialize-solid-reference`) create only nonexistent files with exclusive
write access; they are not regeneration commands. The original 72 border/geometry
poses were retained when adding a separate 24-pose opaque-solid reference.

Output: `benchmarks/results/ce8lf-prototype/report.json`, `gallery.html`, `gallery.png` and PNG
control images. Source/input hashes identify the exact experiment. Software PNG
repeats are small browser encodes, not preview/CLI/MP4 export acceptance. The
one-byte CPU/shader ceiling applies to these explicit inputs only. No 1080p timing,
memory or soft-quality acceptance is established by this runner.

Production source textures, selected CE7 clocks, spot cones, emitter basis,
native premultiplied colour conversion, receivers' real alpha, light integration,
cache identity and 1080p budgets still require the specification's integration gates.
