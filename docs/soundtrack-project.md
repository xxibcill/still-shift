# Programmable soundtrack projects

CE16 adds an opt-in `soundtrack-project-1` file, a pinned offline DawDreamer worker,
shared revision-checked edits and an optional Lab layer view. Existing
`passage-audio-1` files keep their original preview/export path. Loading or exporting
an episode never migrates it.

## Command-only setup and lifecycle

Use the repository's Node 22.23.1 / pnpm 10.29.3 toolchain, UV 0.7.12 and
FFmpeg/ffprobe 8.0.1. Python 3.12.11, DawDreamer 0.9.0, NumPy 2.3.3 and SciPy 1.16.2
are installed separately with hashes from `scripts/soundtrack/requirements.txt`:

```sh
pnpm soundtrack:setup
pnpm still-shift soundtrack validate --project benchmarks/fixtures/composition/ce16/project.json
pnpm still-shift soundtrack inspect --project benchmarks/fixtures/composition/ce16/project.json --json
pnpm still-shift soundtrack render --project benchmarks/fixtures/composition/ce16/project.json --output-dir benchmarks/results/my-soundtrack --stems
```

Setup reuses an existing environment and installs the pinned dependencies; it does
not delete or replace the environment. The default is the isolated ignored
`benchmarks/results/composition-ce16/runtime`. Use `STILL_SHIFT_SOUNDTRACK_ENV` during
setup for another location, then set `STILL_SHIFT_SOUNDTRACK_PYTHON` to its Python
executable for rendering. No plugin, activation dialog, provider request or GUI is
required. Distribution is a separate decision; see licensing below.

The 60-second example references existing local episode files by path and SHA-256.
It contains natural narration, one music interval and two cues. Those media are
not included in Git. Use your own identities if those files are unavailable.
To try edits, copy the project into a new file first; the fixture is revision 0.
Its paths are absolute, so this specific example can be copied without rewriting
relative paths. Other projects resolve asset paths relative to their project JSON.

```sh
cp benchmarks/fixtures/composition/ce16/project.json benchmarks/results/my-project.json
pnpm still-shift soundtrack edit --project benchmarks/results/my-project.json --revision 0 --operations benchmarks/fixtures/composition/ce16/edits.json
pnpm still-shift soundtrack render --project benchmarks/results/my-project.json --output-dir benchmarks/results/my-edited-render --stems
pnpm still-shift soundtrack render --project benchmarks/results/my-project.json --output-dir benchmarks/results/my-range --range 24000:96000
pnpm still-shift soundtrack package --project benchmarks/results/my-project.json --output-dir benchmarks/results/my-portable-project
```

A package copies unchanged source bytes and rewrites asset paths in the current
state and its history. Move the entire directory; load its `project.json`. Packages
contain media only, not Python/native dependency binaries. Asset hashes are checked
before copying, after copying and before every render.

## Contract and audio semantics

The generated [JSON Schema](../packages/scene-contract/schemas/soundtrack-project-1.schema.json)
checks structure; `validateSoundtrackProject` also checks references, IDs, routing,
intervals, automation, ducking roles and the memory estimate. All fields are explicit;
loading does not introduce gain or ducking defaults.

| Field                                              | Meaning                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`, `revision`, `history`             | Versioned authority and monotonic save revision; up to 20 nonrecursive undo/redo states                         |
| `sampleRate`, `channels`                           | Fixed 48,000 Hz, stereo output                                                                                  |
| `assets`                                           | Named paths and `sha256:` identities; paths resolve relative to the JSON                                        |
| `tracks`                                           | Named narration/BGM/SFX/ambience roles, destination, gain, mute/solo and built-in processors                    |
| `clips`                                            | Asset/track, source start/end, project placement, gain, fades and automation; all positions use integer samples |
| `clips[].anchor`                                   | Original beat and cue/event reference, plus signed sample offset; retained alongside resolved `startSample`     |
| `buses`, `master`                                  | Named acyclic routing graph; outputs reference a bus or master; explicit gain                                   |
| `ducking`                                          | Optional explicit narration detector and BGM targets with all detector/ramp settings                            |
| `normalization`, `channelConversion`, `tailPolicy` | `none`, `mono-duplicate-stereo-preserve`, `retain-to-project-end`                                               |

Source intervals and render ranges are half-open: `[start, end)`. Resample sources
to 48 kHz **before** trimming. Mono duplicates at unity into both channels; stereo
keeps its channels. More channels are rejected. Picture frames resolve with
`round(frame × 48000 / fps)` at 1–120 integer fps. Clip automation positions are
relative to the clip, strictly increasing and inside its source duration.
Linear interpolation operates on amplitude gains; `hold` keeps the preceding
point. The first/last point extends to the beginning/end of the clip. Fades are
linear amplitude ramps; their combined length must fit. No rescaling of narration,
source padding, looping, time stretching or automatic normalization occurs.

The worker sums overlapping clips, applies clip gains/fades/automation, then track
gain/mute/solo, explicit BGM ducking and track DSP. Only built-in causal `highpass`
and `lowpass` are accepted, with frequency 20–20,000 Hz and Q 0.1–10. Every DSP path
receives an impulse probe: onset must have zero delay. Peak-response displacement
is recorded separately. Nonzero onset latency and external plugins are rejected;
no unsupported compensation is implied. Block size is 512. Tails continue inside
the project and are cut at its declared end.

`--stems` exports post-track-processing stems and post-bus-gain stems; master gain
applies to the mix only. Unity master/direct buses reconstruct the mix in graph
summation order. Nonunity bus/master gains must be included when reconstructing
from track stems. `mix` and `duck-envelope` are reserved output names. Output files
are Float32 WAVs; delivery encoding stays with FFmpeg. The full graph renders before
any range crop, preserving filters, fades and ducking at the range boundary.
`render.json` records sample count, waveform peaks, hashes, revision, worker/DSP
versions, runtime, path calibration and a cache identity. Identity includes the
authored state, source identities, worker bytes, backend, toolchain and render
settings. History/revision do not change PCM identity; the manifest still records
the saved revision. Relocated paths conservatively change identity even when PCM
is exact. No automatic cache reuse is introduced.

Bounds: 8 MB project/request JSON, 100 assets, 128 clips, 16 tracks, 8 buses, four
filters per track, 2,048 automation points per clip and 10 minutes of sample address
space. The duration/node buffer estimate must be at most 1.5 GB; most dense projects
reach that bound earlier. Sources must be regular files no larger than 1 GB each.
Worker stdout is bounded at 2 MB, stderr retains its last 32 KB, and rendering has
a 120-second worker budget (library override at most 600 seconds).

## Ducking

`peak-window-attack-hold-release-1` uses the peak absolute sample across both
channels in each nonoverlapping `windowSamples` window of the **raw narration
track**. It includes narration placement/source trims but precedes clip gain,
track gain, mute/solo and DSP. Muting narration therefore leaves the explicitly
authored detector intact. The detector never rewrites narration samples.

Windows at or above `thresholdDb` activate fixed `attenuationDb` reduction. Optional
`lookaheadSamples` advances that activity; `holdSamples` extends it after speech.
Linear sample ramps reach reduction in `attackSamples` and unity in
`releaseSamples`; zero ramps step immediately. The derivation/version and all
parameters persist in JSON; rendering also emits `duck-envelope.wav`. Only named
BGM targets are eligible. SFX, ambience and old projects are never ducked implicitly.
The example's parameters are explicit authoring choices, not listening-approved
mix recommendations.

## Shared edits and recovery

`edit --revision N --operations edits.json` applies a validated batch under the
shared artifact lock, checks the current revision and atomically renames the new
JSON. An invalid operation leaves the original file unchanged. A save increments
revision exactly once; history records each authored operation, capped at 20.
Undo/redo changes state and increments revision; it never rolls revision back.
CLI and HTTP edits call the same `saveSoundtrackEdits` API.

Operations are `gain` (target and gainDb; optional kind `clip|track|bus|master` to
resolve same-name clip/node ambiguity), `mute`, `solo`, `move`, `trim`,
`automation`, `undo` and `redo`. The latter two need only `type`.
Moving an anchored clip also requires its new `offsetSamples`.
Trims preserve placement and reject fades/automation that no longer fit.

```json
[
  { "type": "gain", "target": "bgm", "kind": "track", "gainDb": -6 },
  { "type": "mute", "track": "sfx-pouch", "value": true }
]
```

`revision-conflict` means reload, inspect the new state, and submit a fresh edit;
never silently retry a stale edit. `source-checksum` means restore media bytes or
author an explicit new identity. `runtime-missing`/`runtime-version` means run setup
or correct the Python override. `clip-range`/`source-range` means fix the requested
interval; no narration padding is a recovery mechanism. `routing-cycle` requires
fixing the routing graph. Schema failures include field paths; worker failures
include asset/clip/processor context when applicable. Use `pnpm --silent still-shift` when consuming stdout in a script, to omit
pnpm's command headers. CLI stdout is one JSON
result with `ok`; failures exit nonzero. Python stdout contains one protocol JSON
response; native logs remain on stderr.

Ctrl-C/SIGTERM cancels CLI rendering; the worker process group, including FFmpeg
children, is stopped and unpublished staging is removed. Retry into a fresh output
path. The library takes `AbortSignal`. Successful outputs are never overwritten.
The existing artifact-lock helper recovers abandoned locks using process identity,
not PID alone. Abandoned matching render stages are removed only after acquiring
the output lock. Project temporary files are never read as authority. Save errors
leave the last complete project readable.

## Passage integration

Create an explicit new project with `soundtrack from-passage --passage plan.json
[--narration audio.wav] --output new-project.json`. The adapter copies authored
anchors, trims, gains and fades, resolves sample positions, and adds no ducking/DSP.
It does not edit the passage. It requires valid named IDs under the new contract.
After picture retiming, run `soundtrack retime --project project.json --revision N
--passage plan.json`; changed cue/event positions move linked clips while keeping
source intervals and durations fixed. Missing/ambiguous references or position
conflicts are errors. Export does not silently retime.

```sh
pnpm story:passage --plan path/to/plan.json --soundtrack path/to/project.json --output-dir benchmarks/results/my-passage
```

`--soundtrack` is a separate explicit render mode. Legacy narrated, sound-only,
silent, range and portable-workspace modes keep their existing branch. The new
mode checks duration/anchors and requires any narration clip to match the plan's
hash, unchanged source interval and zero placement. It renders the soundtrack with
full DSP state, crops to the requested frame range and muxes through FFmpeg.
The report/resume identity records the project/runtime. Portable picture packages
continue to use `story:package`; independently package the soundtrack and provide
its relocated `project.json` when rendering. No automatic episode migration occurs.

## Optional layer view and preview

Run `pnpm lab`; open `/soundtrack.html` via **Soundtrack layers**. Load a saved
project inside the checkout. Tracks show overlapping clip bounds, stepped hold or linear automation with
extended endpoint gains, processed-stem
waveforms after rendering, and authored automation. Set track mute/solo/gain or
edit a clip's numeric placement, trim, gain and automation JSON; Save writes the
same file as the CLI. Undo/redo uses persisted project history. Numeric edits are
supported; drag handles, fades/DSP/ducking inspectors and an independent browser
mixing engine are not provided. Author those settings in JSON and validate them.

**Render this revision** generates a fresh checked mix/stems and waveform data.
Play/seek/download use that saved revision's rendered mix. An edit invalidates
preview until re-rendered; stale or different-project preview requests fail.
In `/passage.html`, **Saved soundtrack (optional)** attaches a rendered full mix to
the passage's existing Web Audio clock. **Use passage audio** restores the legacy
scheduler. The temporary legacy Sound effects checkbox does not change a rendered
full mix; use project mute/solo and render again. A picture edit causing an anchor
conflict requires explicit soundtrack retiming and reattachment. Clearing or
replacing an attachment cancels pending decodes; earlier requests cannot restore
a superseded soundtrack. Playback uses an immutable validated project snapshot
and integer sample boundaries on the shared passage clock. Rendered mixes
avoid claiming browser/DawDreamer DSP parity.

The view is a read-only projection of the shared contract, backed by the same HTTP
edit/render API. Evaluated candidates: `@waveform-playlist/engine` 13.6.0 and `core`
12.6.1 (MIT), `browser` 16.0.0 (MIT, React/Tone peers), and `@dawcore/components`
0.0.37 (MIT, Lit/native audio peers). Published engine declarations/README expose
collision-constrained clips and separate snapshot history. Its component package
name is `@dawcore/components`, not the nonexistent `@waveform-playlist/web-component`.
We retained a small vanilla TypeScript view to support project overlaps and one
persisted history. No candidate package’s playout or DSP engine was adopted;
native playback uses the rendered mix.
Sources: [engine package](https://www.npmjs.com/package/@waveform-playlist/engine/v/13.6.0),
[components package](https://www.npmjs.com/package/@dawcore/components/v/0.0.37).

## Verification and licensing

`pnpm test:soundtrack` runs the shared model, offline PCM, persistence/HTTP and old
passage-audio regressions without GUI interaction. `pnpm check:soundtrack` runs
fast checks, runtime tests, three audited audio-only integration suites, depth tests and soundtrack Python
checks. These tests are also discovered by the existing unit/integration tiers.
`pnpm soundtrack:verify` creates fresh 60-second CLI lifecycle artifacts and updates
[evidence](./composition-ce16-verification-results.json); it refuses existing results.
Set `STILL_SHIFT_SOUNDTRACK_RESULTS` for a new location, or add `--verify-only` to
check retained results. Full `pnpm check` includes the separate `pnpm test:browser:soundtrack` group and
frozen browser baselines. The owner authorized these automated browser checks
for the CE16 completion pass on 2026-10-04. Routine production and the command-only
tier continue without browser driving; consult the evidence for full-gate status. No baseline was regenerated.
The [completion audit](./composition-ce16-completion-audit.md) records the earlier
indirect headless-browser verification breach and corrected test selection.

The backend is local and opt-in. DawDreamer 0.9.0 is GPLv3 and includes native
component obligations; NumPy/SciPy carry BSD and bundled native-library notices.
The pinned wheel/license audit is retained in the [backend proof](./composition-ce16-backend-proof.md)
and evidence. No backend binaries are bundled into Still Shift or a media package.
A distribution/packaging license decision remains pending; subprocess separation
is not asserted to exempt distribution from those obligations.
Technical PCM/FFprobe acceptance does not establish creative quality: listening,
audiovisual QA and GUI inspection have not been performed.
