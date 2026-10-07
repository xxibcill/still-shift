# CE16 isolated backend proof

This is a command-only technical trial, isolated from the CE12 implementation and
active episode production. It does not implement the full soundtrack project,
editor, ducking or passage integration. CE16 remains in progress.

## Environment

Use Python 3.12.11 and the repository's pinned Node/pnpm toolchain. The audio
runtime is separate from the existing depth-worker environment:

```sh
UV_CACHE_DIR=/private/tmp/still-shift-ce16-uv-cache uv venv --python 3.12.11 benchmarks/results/composition-ce16/runtime
UV_CACHE_DIR=/private/tmp/still-shift-ce16-uv-cache uv pip sync --python benchmarks/results/composition-ce16/runtime/bin/python --require-hashes scripts/soundtrack/requirements.txt
```

The lock pins DawDreamer 0.9.0, NumPy 2.3.3 and SciPy 1.16.2 with distribution
hashes. The installed wheel is verified on macOS arm64. No GUI or provider service
is involved. `STILL_SHIFT_SOUNDTRACK_PYTHON` can select an existing isolated runtime.

DawDreamer is GPLv3. The upstream project also identifies JUCE, nanobind,
libsamplerate, Rubber Band, Steinberg VST2/3 and FAUST license obligations. NumPy and
SciPy's wheel license files include their bundled-library notices. The local trial
retains those files under ignored results. No dependency binary is distributed;
production adoption and packaging are pending. Subprocess use does not establish
an exemption. See the [upstream statement](https://github.com/DBraun/DawDreamer/blob/main/README.md#license)
and [retained evidence](./composition-ce16-verification-results.json).

## Project and commands

The readable `ce16-backend-proof-1` fixture contains one unchanged narration
interval, one BGM interval and two SFX cues. Paths and source hashes refer to
existing local episode assets, read only. The edited project moves the pouch cue
4,800 samples and reduces its gain by 3 dB. These are diagnostic edits, not changes
to the active episode.

```sh
pnpm soundtrack:proof --verify-only
```

This verifies the existing initial/reloaded/edited WAVs and writes the tracked
technical evidence. To perform the three render stages:

```sh
pnpm soundtrack:proof
```

The render command requires fresh `initial`, `reloaded` and `edited` directories
under `benchmarks/results/composition-ce16/`; it rejects existing outputs. Preserve
prior outputs before repeating the trial. The runtime, dependency/license records
and measured setup logs remain in that same ignored results root. Individual
stages can also be run with `scripts/soundtrack/proof-worker.py` and explicit
`--project` / `--output-dir` arguments. The worker exits nonzero and emits a JSON
failure when a checksum or rendering requirement fails.

## Timing, processing and comparisons

All source boundaries and placements are integer samples at 48 kHz. FFmpeg
resamples before sample trimming; source intervals are end-exclusive. The two SFX
sources are 96 kHz. Stereo inputs remain stereo. Narration is neither padded,
stretched nor processed; its decoded output is tested for exact equality.

Each output contains 2,880,000 samples per channel: exactly 60 seconds. Silence
outside a clip belongs to the full-length container. Clip gain/fades and automation
use linear amplitude interpolation. BGM and SFX pass through built-in high-pass
100 Hz and low-pass 5,500 Hz filters. Music and SFX have named buses; the master
sums at unity without normalization or additional DSP.

Track stems are captured after clip processing and before bus/master summation.
Bus stems are also exported. Narration + music bus + SFX bus reconstruct the mix
exactly. The impulse probe records onset delay, peak position and the last response
above 1e-10. Tails are retained within the project and truncated at its declared
end. External plugin latency is unsupported.

The initial render, new-process reload and edited render retain wall-time and
process peak-resident measurements. These exclude separately spawned FFmpeg child
memory. The measured fresh environment setup includes downloaded wheels and has
its own `/usr/bin/time -l` logs. No comparative speed claim is made.

## Remaining work

CE16-B still requires the production project contract, bounded structured worker
protocol, shared revisioned edits/persistence, narration-aware ducking, optional
layer timeline, rendered-audio preview, passage integration, relocation/recovery
and full regression verification. This proof alone does not complete CE16.

Technical checks passed. Listening and audiovisual QA were not performed.
