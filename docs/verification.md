# Verification tiers

Use the pinned Node and pnpm versions in `toolchain.json` for every tier. Runtime
checks additionally require the pinned Python/uv environment, FFmpeg/FFprobe,
and installed Playwright Chromium. `pnpm toolchain:check` verifies them.

| Command                   | Purpose                                                                                                     | Prerequisites                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `pnpm check:fast`         | Generated schema, package boundaries, TypeScript formatting/lint/type checks, and unit behavior tests       | Node, pnpm, installed workspace dependencies     |
| `pnpm test:runtime`       | Filesystem/process locks, cancellation, cache recovery, and FFmpeg evidence tests                           | Python, FFmpeg; OS process inspection permitted  |
| `pnpm test:integration`   | Real CLI, Python protocol, API, browser, and export transaction tests                                       | Full pinned toolchain and Python environment     |
| `pnpm test:browser:smoke` | Three Lab session workflows, component playback/pixel checks, and representative Commerce/Story MP4 exports | Full pinned toolchain                            |
| `pnpm check:runtime`      | Toolchain check plus all three runtime groups and Python tests, sequentially                                | Full pinned toolchain                            |
| `pnpm check`              | Existing full render matrix plus format/lint/type/schema/boundary gates                                     | Full pinned toolchain                            |
| `pnpm check:all`          | Full check, benchmark, and real-corpus readiness gate                                                       | Full pinned toolchain and frozen reviewed corpus |

`test:unit` remains an alias for the unit group. Tests that spawn processes moved
from `tests/unit` to `tests/runtime`; no lock-recovery or media assertions were
removed. Unit runs are capped at four workers. Runtime and integration files run
sequentially with a two-worker ceiling so Chromium/FFmpeg contention does not
turn short test budgets into intermittent failures. Individual render tests
declare their longer budgets. Run groups sequentially, as the aggregate commands
do, rather than launching them all at once.

Benchmark discovery is scoped to `benchmarks/`; local worktrees and package-store
copies are excluded. Benchmark iterations publish to distinct temporary paths and
throw on failure, so a successful command must contain actual sample measurements.

The Python lock helper uses standard-library modules and defaults to `python3`.
Set `STILL_SHIFT_PYTHON` or pass `pythonCommand` to the lock boundary when the
composition environment needs a specific executable. It does not assume a
repository `.venv` location. The depth protocol integration tests deliberately
exercise `.venv/bin/python`, installed by `uv sync`, to verify the pinned service.

## Composition baselines

`pnpm test` ends with `pnpm test:browser:composition-baselines`. It renders every frame
of the 176 acceptance items in
[`tests/visual/composition-baselines/fixtures.json`](../tests/visual/composition-baselines/fixtures.json)
through the export renderer and compares per-frame hashes with the stored baseline for
the current platform and architecture (for example `darwin-arm64.json`). It takes about
four and a half minutes on an Apple M5 Pro. See the
[composition engine plan](./composition-engine-plan.md#ce0--baseline-parity-harness-and-feature-matrix).

- A failure lists the items and frames whose pixels changed. An intentional rendering
  change regenerates the baseline with `pnpm composition:baselines --write` (use
  `--only id,id` or `--family name` for a subset) and records the reason in the commit.
  Partial writes replace the selected fixtures' entries, including removed or renamed
  passage beats, and remove their obsolete timing entries.
  Retaining pixel hashes requires the same renderer environment, launch arguments and
  machine metadata as the existing file. An incompatible partial write stops before
  rendering or changing either baseline file; regenerate with a full `--write` without
  filters. This also applies to legacy files with an older profile or missing machine
  metadata. Filtered writes that replace every existing item need no compatibility
  check because they retain no old hashes.
- Timing writes use `composition-timings-2`, with `machine` and `renderEnvironment`
  on each item. Partial runs retain the provenance of unselected measurements, even
  across platforms or machines. Older files with global provenance migrate on write;
  retained measurements without provenance require a full `--write` regeneration.
- Baselines exist per `platform-arch` (`darwin-arm64`, `linux-arm64`, `linux-x64`)
  because output differs across operating systems and CPU architectures; see policy
  rule 6 in the plan. On an environment without one, the check stops with an
  explanation instead of comparing against another platform's pixels.
  `darwin-arm64` is the reference environment (Q8, Mac first); the Linux baselines
  are kept for future machines and are not required by any check.
- `scripts/composition/linux/run.sh arm64|amd64` renders the baseline in the pinned
  Linux container (Docker required), writes `linux-<arch>.json`, and saves frames that
  differ from `darwin-arm64` under `benchmarks/results/`. `pnpm composition:baselines
--compare-frames <dir>` then classifies those frames against renders on this
  machine. `CHECK=1 scripts/composition/linux/run.sh arm64` checks the committed Linux
  baseline instead. The `linux-x64` baseline was generated under Rosetta; confirm it on
  real x86 hardware.
- Each `--save-mismatches <dir>` run replaces that directory's `reference/` frames
  and `environment.json`, including filtered runs. Reusing a directory cannot retain
  frames from an earlier fixture revision; use separate directories to keep older runs.
- Rendering uses the pinned software profile `chromium-software-2`
  (`--disable-gpu --enable-unsafe-swiftshader`); the command refuses to run on any other
  renderer.
- `pnpm composition:baselines --compare-hardware` measures how far a hardware-GPU
  preview drifts from export and writes a report beside the baseline.

## Continuous integration

[The workflow](../.github/workflows/verify.yml) runs the fast tier on pushes and
pull requests with the version from `.node-version` and the locked workspace
dependencies. Its action configuration follows the maintained
[checkout](https://github.com/actions/checkout) and
[setup-node](https://github.com/actions/setup-node) documentation.

The manually dispatched `runtime` and `release` choices run on a trusted runner
labelled `still-shift-media`. Provision that runner with the exact tools listed in
`toolchain.json`, a current Actions runner, and sufficient disk space for generated
videos. The workflow installs the locked Python dependencies and Chromium, then
verifies toolchain identity before testing. This repository change supplies the
workflow; it does not register a runner or change repository Actions settings.
Untrusted pull requests run only on the hosted fast runner.

The release choice intentionally retains `corpus:check`. The currently incomplete
real-media corpus must fail this gate until its reviewed inputs exist. Fixture
renders cannot replace corpus acceptance.

## Local sandbox execution

Runtime tests launch local HTTP servers, Chromium, Python, and media processes;
macOS lock recovery also reads process identities using `ps`. Run these checks in
an environment that permits those operations. Permission failures are not evidence
of an application regression. Use a writable `UV_CACHE_DIR` if the environment
restricts access to the user's default uv cache. Do not disable recovery checks or
weaken assertions to work around sandbox restrictions.
