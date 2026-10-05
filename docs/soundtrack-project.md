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

| Field                                              | Meaning                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`, `revision`, `history`             | Versioned authority and monotonic save revision; up to 20 nonrecursive undo/redo states                                                     |
| `sampleRate`, `channels`                           | Fixed 48,000 Hz, stereo output                                                                                                              |
| `assets`                                           | Named paths and `sha256:` identities; paths resolve relative to the JSON                                                                    |
| `tracks`                                           | Named narration/BGM/SFX/ambience roles, destination, gain, mute/solo and built-in processors                                                |
| `clips`                                            | Asset/track, source start/end, project placement, gain, fades with optional curves, automation and optional `pan`; integer sample positions |
| `clips[].anchor`                                   | Original beat and cue/event reference, plus signed sample offset; retained alongside resolved `startSample`                                 |
| `buses`, `master`                                  | Named acyclic routing graph; outputs reference a bus or master; explicit gain                                                               |
| `ducking`                                          | Optional explicit narration detector and BGM targets with all detector/ramp settings                                                        |
| `normalization`, `channelConversion`, `tailPolicy` | `none`, `mono-duplicate-stereo-preserve`, `retain-to-project-end`                                                                           |

Source intervals and render ranges are half-open: `[start, end)`. Resample sources
to 48 kHz **before** trimming. Mono duplicates at unity into both channels; stereo
keeps its channels. More channels are rejected. Picture frames resolve with
`round(frame × 48000 / fps)` at 1–120 integer fps. Clip automation positions are
relative to the clip, strictly increasing and inside its source duration.
Linear interpolation operates on amplitude gains; `hold` keeps the preceding
point. The first/last point extends to the beginning/end of the clip. Fades are
linear amplitude ramps by default; their combined length must fit. No rescaling of
narration, source padding, looping, time stretching or automatic normalization
occurs.

Optional `clips[].fadeInCurve` and `clips[].fadeOutCurve` choose each fade's shape
independently: `linear` (the default when absent) or `equal-power`. For a linear
ramp `r` running 0→1 across the fade, `equal-power` applies `sin(r·π/2)`: the fade
midpoint is −3 dB instead of −6 dB, so a fade-out holds its body longer and then
drops, which suits SFX tails and ambience. Gain is exactly 1 outside the fade,
and an absent curve or `linear` renders bit-identically to earlier versions.

Optional `clips[].pan` places a clip in the stereo field from `-1` (left) through
`0` (centre) to `1` (right). It uses a constant-power sine/cosine law normalized to
unity at centre: left gain is `√2·cos((pan + 1)·π/4)` and right gain is
`√2·sin((pan + 1)·π/4)`, applied per channel after mono duplication. An absent
`pan` and `pan: 0` render bit-identically to an unpanned clip, so earlier projects
are unchanged. Hard pan is +3 dB on its side and exact silence on the other. A
stereo source keeps only that side's channel. Panning can therefore raise peaks;
check the headroom report below.

The worker sums overlapping clips, applies clip gains/fades/automation and pan, then track
gain/mute/solo, explicit BGM ducking and track DSP. Only built-in causal `highpass`
and `lowpass` are accepted, with frequency 20–20,000 Hz and Q 0.1–10. Every DSP path
receives an impulse probe: onset must have zero delay. Peak-response displacement
is recorded separately. Nonzero onset latency and external plugins are rejected;
no unsupported compensation is implied. Block size is 512. Tails continue inside
the project and are cut at its declared end.

Sources are probed once per asset. An asset used by several clips decodes in one
streamed FFmpeg pass that keeps only those clips' samples, so many short cues cut
from one long library file cost one decode, not one per cue. One decode plan covers
the whole render in track order, so passes are shared across tracks. Clips join a
pass in that order while their decoded samples, together with samples already
decoded for later clips, fit in a fixed 64 MB decode budget; a longer clip streams
from FFmpeg straight into its track. Resampling precedes trimming, so every path
gives identical samples. Probes, decode passes and source hashing run on up to
eight threads, at most 64 MB of decoded clips ahead of the mix. Clips are still
summed in authored order within each track. Tracks render one at a time: the
ducking detector, then filtered tracks, then the rest in depth-first routing order.
Within a track, a failure is reported at the first affected clip in authored order.
Sharing and parallelism change speed only: outputs are byte-identical to
sequential per-clip decoding. On a 15-core Mac, a 120-second, 128-cue stress
project cut from long 44.1 kHz WAV/MP3 files rendered in about 1.5 s instead of
about 20 s.

### Working memory

The worker keeps memory proportional to routing depth, not to the number of tracks
and buses, so 10-minute projects fit. Only filter chains run in DawDreamer: each
filtered track renders alone and is spilled as raw float32 to a temporary directory
inside the render stage, which is removed afterwards. That directory needs one
project-length stereo file per filtered track (230 MB at 10 minutes). The worker
then reads the spills through memory maps, whose clean pages the system can
reclaim. Track gains, ducking and bus/master sums run in NumPy and reproduce
DawDreamer 0.9.0's add and playback processors exactly. This includes JUCE's
single-rounding fused multiply-add for non-unity input gains, its treatment of
gains within an ulp of 1 as unity, and preserved subnormals. A depth-first walk
keeps only the accumulators on the current bus path alive. Clips are shaped in
chunks, outputs stream to WAV byte-identical to SciPy's writer, and ducking uses
intervals rather than per-sample index arrays. Outputs are byte-identical to the
former single-graph render on 400 randomized projects. These cover filters, nested
and empty buses, ducking, pan, fade curves, gains at and near unity, mute/solo,
ranges and stems.

Validation and the worker share one estimate, in project-length stereo float32
buffers (8 bytes per sample frame). It follows the render rather than counting
nodes. The ducking detector holds 1, and DawDreamer filtering a track holds 3
before any accumulator exists. During the depth-first walk, a routing node's
accumulator exists once its first input is summed, a mixed track holds 1, and a
finished bus holds 1 until summed. A spilled filtered track holds none unless it
seeds an accumulator. The estimate is the largest of these, plus 0.5 for ducking
and a fixed 328 MB for the interpreter and the decode budget, and must not exceed
1.5 GB. Plain bus chains therefore cost nothing extra; accumulators only stack
when each level sums a track before the bus beneath it. At 10 minutes, ordinary
graphs (any bus depth where tracks feed one level each) fit with filters and
ducking. A graph stacking five live buffers with ducking is limited to about 9.2
minutes. Measured macOS footprints with the default allocator stayed at least
0.24 GB below the estimate, from one track to stacked five-level graphs at that
limit.

`--stems` exports post-track-processing stems and post-bus-gain stems; master gain
applies to the mix only. Unity master/direct buses reconstruct the mix in graph
summation order. Nonunity bus/master gains must be included when reconstructing
from track stems. Track and bus IDs must be unique ignoring case, and `mix` and
`duck-envelope` are reserved output names in any case, so stem filenames remain
portable to case-insensitive filesystems. Validation applies to saved history as
well; rename conflicting IDs and their references in an explicitly authored copy.
Distinct mixed-case IDs are preserved. Output files are Float32 WAVs; delivery
encoding stays with FFmpeg. The full graph renders before any range crop, preserving filters, fades and ducking at the range boundary.
Integer sample counts convert to backend seconds rounded upward by one representable
step, preventing truncation to one sample short. Full outputs must still match the
exact authored integer length; narration intervals and placements are unchanged.
`render.json` records sample count, waveform peaks, hashes, revision, worker/DSP
versions, runtime, path calibration and a cache identity. Each output also reports
headroom from its written samples: `peakDbfs` (the largest absolute sample in either
channel, in dB relative to full scale; `null` for silence) and
`samplesAboveFullScale` (sample positions where either channel exceeds 1.0). With no
limiter or normalization, a hot mix keeps its overs in the Float32 WAV, but integer
delivery formats clip them; a nonzero master count means lowering gains before
delivery. The report changes no PCM and does not change the DSP version. Identity includes the
authored state, source identities, worker bytes, backend, toolchain and render
settings. History/revision do not change PCM identity; the manifest still records
the saved revision. Relocated paths conservatively change identity even when PCM
is exact. No automatic cache reuse is introduced.

Bounds: 8 MB project/request JSON, 100 assets, 128 clips, 16 tracks, 8 buses, four
filters per track, 2,048 automation points per clip and 10 minutes of sample address
space, within the 1.5 GB working-memory estimate above. Sources must be regular files no larger than 1 GB each.
Worker stdout is bounded at 2 MB, stderr retains its last 32 KB, and rendering has
a 120-second worker budget (library override at most 600 seconds).

## Ducking

`peak-window-attack-hold-release-1` uses the peak absolute sample across both
channels in each nonoverlapping `windowSamples` window of the narration track's
**pre-fader sum**: narration placement, source trims, clip gain, fades and
automation are included; clip pan, track gain, mute/solo and DSP are not, as with
a console's pre-fader send. Ducking therefore
follows what each narration clip says, including fade-ins and automated dips,
while riding, muting or soloing the narration track to audition the mix leaves
the BGM ducked exactly as in the final mix. `thresholdDb` is measured after clip
gain. The detector never rewrites narration samples. This is `soundtrack-dsp-5`, which adds optional
equal-power fade curves; projects without them render identically to version 4.
Version 4 added clip pan after the detector tap; projects without pan render
identically to version 3.
Version 3 made hold require a detected active sample; version 2 used the same
pre-fader detector but could start a long hold before any activity in a short
project.
`soundtrack-dsp-1` read the raw source before clip gain, fades and automation,
which differs only for narration clips with non-unity gain, fades or automation.

Windows at or above `thresholdDb` activate fixed `attenuationDb` reduction. Optional
`lookaheadSamples` advances that activity; `holdSamples` extends it after speech.
Linear sample ramps reach reduction in `attackSamples` and unity in
`releaseSamples`; zero ramps step immediately. The derivation/version and all
parameters persist in JSON; rendering also emits `duck-envelope.wav`. Only named
BGM targets are eligible. SFX, ambience and old projects are never ducked implicitly.
The example's parameters are explicit authoring choices, not listening-approved
mix recommendations.

## Shared edits and recovery

`edit --revision N --operations edits.json` (or `--operations -` to read the JSON
from standard input, up to 8 MB) applies a validated batch under the
shared artifact lock, checks the current revision and atomically renames the new
JSON. An invalid operation or a serialized next revision exceeding the 8 MB UTF-8 limit
leaves the original file and revision unchanged. Project packaging and render snapshots
use the same serialization bound. A save increments
revision exactly once. Each request is one undoable action: its operations share
one history entry (capped at 20), and only the request's final state must be valid,
so a move and a shortening trim can be submitted together. A request that changes
nothing adds no history entry. `undo`/`redo` inside a request first commit the
operations before them. Undo/redo changes state and increments revision; it never
rolls revision back.
CLI and HTTP edits call the same `saveSoundtrackEdits` API.

Operations are `gain` (target and gainDb; optional kind `clip|track|bus|master` to
resolve same-name clip/node ambiguity), `mute`, `solo`, `move`, `trim`,
`automation`, `pan` (clip and pan; `0` removes the field, so recentring an
unpanned clip adds no history), `fade` (clip with any of `fadeInSamples`,
`fadeOutSamples`, `fadeInCurve` and `fadeOutCurve`; a `linear` curve removes the
field), `add-clip`, `remove-clip`, `add-asset`, `remove-asset`, `add-track`,
`remove-track`, `add-bus`, `remove-bus`, `route`, `processors`, `ducking`, `tile`,
`undo` and `redo`. The latter two need only `type`.

Routing and DSP edits use the contract's own shapes. `add-track` and `add-bus` take
a complete track or bus flattened beside `type` and append it, so existing graph
order and PCM are unchanged. `remove-track` fails with `track-in-use` while clips
or ducking reference the track; `remove-bus` fails with `bus-in-use` while any
node outputs to it. `route` sets a track's or bus's `output`; validation rejects
unknown outputs, track outputs and cycles. `processors` replaces a track's filter
list. `ducking` sets the complete ducking object, or removes it with `null`.
Rerouting into a deeper bus chain can exceed the working-memory estimate; the
request then fails with `resource-budget` and nothing is saved.

`tile` (clip, `endSample`, `crossfadeSamples`) fills an ambience or music bed
without looping in the contract: it appends ordinary copies named `<id>-2`,
`<id>-3`, … back to back until `endSample` (exclusive). Each join overlaps by
`crossfadeSamples` with equal-power fades, so uncorrelated material keeps constant
power; at most half the clip may crossfade. The original keeps its fade-in, the
last copy keeps the original fade-out (shortened if it must fit) and is trimmed
to end exactly at `endSample`. Copies drop the anchor and automation points past
their trim. Existing IDs are never overwritten (`duplicate-id`), and the 128-clip
bound still applies. It is one undoable request.

`add-clip` takes every clip field from the contract table, flattened beside
`type`; no defaults are filled in. The clip is appended, so existing clips keep
their summation order and render unchanged. `add-asset` takes `id` and `path`
(relative to the project JSON, like every asset). File-based saves through the CLI
or Lab API hash the source and store its `sha256:` identity; a supplied `sha256`
must match the bytes (`source-checksum`), and a missing or oversized source fails
before anything is saved. The pure library edit requires `sha256`.
`remove-asset` fails with `asset-in-use` while clips reference it, so remove
those clips earlier in the same request. Adding a cue and its source is one
undo step:

```json
[
  { "type": "add-asset", "id": "whoosh", "path": "sfx/whoosh.wav" },
  {
    "type": "add-clip",
    "id": "whoosh-cue",
    "asset": "whoosh",
    "track": "sfx-pouch",
    "sourceStartSample": 0,
    "sourceEndSample": 24000,
    "startSample": 480000,
    "gainDb": -6,
    "fadeInSamples": 0,
    "fadeOutSamples": 2400,
    "automation": { "interpolation": "linear", "points": [] }
  }
]
```

Moving an anchored clip keeps its anchor point, so its `offsetSamples` follows
the move; omit `offsetSamples`, or pass the matching value. A different value, or
an offset on an unanchored clip, fails with `anchor-conflict`. Use `retime` to
follow a changed picture; it saves only when an anchor moved, as one undo step.
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
project inside the checkout. Tracks show overlapping clip bounds, stepped hold or
linear automation with extended endpoint gains (gold), linear or equal-power fade
shapes (blue) and processed-stem waveforms after rendering. Set track
mute/solo/gain or edit a clip's numeric placement, trim, gain, pan, fade lengths
and curves and automation JSON, or remove the selected clip. **Add cue** places a
new clip on a track from an existing source, or registers a new source path
(relative to the project; the server hashes it) in the same undoable request.
Save writes the same file as the CLI. Undo/redo uses persisted project history.
An empty or invalid number field is rejected without saving instead of being read
as zero. After rendering, the status line shows the mix peak and warns when
samples exceed 0 dBFS. Each track row also sets its output and a filters JSON
array; **Mix graph** edits ducking JSON (empty removes it) and adds empty tracks
and buses. Unchanged controls add no history, and every control saves through the
same validated edit. Drag handles, removing tracks or buses, tiling and an
independent browser mixing engine are not provided; use a CLI/API edit for
those.

**Render this revision** generates a fresh checked mix/stems and waveform data.
Play/seek/download use that saved revision's rendered mix. An edit invalidates
preview until re-rendered; stale or different-project preview requests fail.
Lab renders live in `benchmarks/results/soundtrack-api/<project-key>/`, keyed by
the project's real path. A successful render keeps only that project's newest
render, and a successful Lab edit removes all of them, because previews of earlier
revisions can never be served again. Lab renders and edits for one project are queued
through publication and pruning, so concurrent renders retain the last preview and
an edit invalidates a preceding render only after it finishes. A shared artifact lock
protects that directory from a second Lab process. A pruned preview answers `revision-conflict`.
Unpublished render stages and locks are left to their render. CLI and library
render outputs are never pruned.
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
fast checks, runtime tests, four audited audio-only integration suites, depth tests and soundtrack Python
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
