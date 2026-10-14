# Still Shift CLI

The CLI handles native compositions, image animation, prepared story/cinematic/
commerce scenes, image batches, narration timing and soundtrack projects. This
reference covers the current checkout; the published `0.1.0` archive keeps its
original documentation until a new version is verified and published.

Examples below use `pnpm [--silent] still-shift` from a repository checkout. For an
installed npm project use `npx still-shift` with your own inputs. Repository-only
commands such as `pnpm story:passage`, fixture maintenance scripts and `pnpm lab`
need the checkout and its assets. The installed program preview is available through
`npx still-shift comp preview`.

Use the [full user guide](../../docs/user-guide.md) to choose a workflow and find
the local Lab workbenches. The [ask-still-shift skill](../../skills/ask-still-shift/SKILL.md)
provides feature discovery; [compose-with-still-shift](../../skills/compose-with-still-shift/SKILL.md)
provides composition authoring instructions.

| Route                                       | Commands                                                                                | Inputs                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Custom compositions                         | `comp validate`, `preview`, `render`, `lint`, `export-json`, `normalize`, `bake`        | `composition-1` JSON or `.ts`/`.mts`/`.cts` program |
| One image                                   | `animate`                                                                               | A supplied still and chosen preset                  |
| Prepared illustration/story/cinematic scene | `animate-scene`                                                                         | Verified scene, layers and assets                   |
| Commerce                                    | `prepare-commerce`, `animate-scene`                                                     | Brief, product imagery, copy and sources            |
| Multiple independent images                 | `batch`                                                                                 | JSONL manifest                                      |
| Passage timing and portrait checks          | `passage import-narration`, `passage lint`                                              | Passage plan and measured word/SRT timing           |
| Saved audio project                         | `soundtrack validate`, `inspect`, `edit`, `render`, `retime`, `package`, `from-passage` | `soundtrack-project-1`, optional passage/narration  |
| Optional provider SFX                       | `sfx generate`                                                                          | Prompt and configured ElevenLabs key                |
| Installed optional runtimes                 | `setup browser`, `setup depth`, `setup soundtrack`                                      | npm package, `uv` for Python runtimes               |

The pinned toolchain is in [toolchain.json](../../toolchain.json). Install the
checkout with the [repository setup](../../README.md#install). In an npm project:

```sh
npm install still-shift
npx still-shift setup browser
npx still-shift --help
```

Video rendering requires FFmpeg/ffprobe on `PATH`; depth and soundtrack Python
runtimes are explicit opt-ins. Installation does not infer or install missing
models, generate art or obtain project assets.

## Native compositions

Use native compositions for a mixed scene: still/depth artwork, solids, vector
shapes, shaped text, groups/precomps, video, image sequences, audio, puppet meshes,
cameras and flat lights. Native features also include keyed/procedural motion,
drivers and constraints, masks/mattes, blend modes, pixel effects, motion blur,
holds/loops/remapping, reusable instances and timeline/text presets. The
[composition reference](../../docs/composition-reference.md) describes the bounded
contracts, backend support and property paths; the
[media guide](../../docs/composition-media.md) describes video/sequence/audio assets.

Builder motion presets are `settle`, `press`, `recoil`, `handoff`, `breathe`,
`drawOn` and `land`; text presets are `reveal`, `emphasize`, `correct`, `qualify`,
`retype`, `count`, `redact` and `release`. Use the
[small programs](../../examples/composition/) for timeline placement, instances,
compositing, masks/effects, pinned text, expressions, cameras, shapes and lighting.

```sh
pnpm --silent still-shift comp validate --input program.ts
pnpm --silent still-shift comp preview --input program.ts --watch
pnpm --silent still-shift comp export-json --input program.ts --output composition.json
pnpm --silent still-shift comp export-json --scene prepared-story.json --output native.json
pnpm --silent still-shift comp normalize --input composition.json --output normalized.json
pnpm --silent still-shift comp bake --input composition.json --output baked.json
pnpm --silent still-shift comp render --input composition.json --output clip.mp4 --backend webgl2
```

`export-json --scene` accepts supported story, commerce, cinematic and legacy
illustrated inputs. It prepares family content and rebases the saved asset paths.
`normalize` retains expression source and adds canonical AST data while preserving
authored behaviours; `bake` replaces expressions/drivers
with sampled keys. Files and pinned assets are checked before rendering. Watch
preview keeps the last valid state when compilation fails. The preview inspector
supports layer/key inspection, eligible property edits, undo/redo, JSON save and
draft export; edits to the live preview do not overwrite the original program.

For perspective cameras, native depth-image displacement and ambient/point/spot
flat lighting, choose `--backend webgl2`. Canvas supports the documented 2D/affine
subset. Cameras project authored xyz planes; lights shade flat surfaces. Supply
your own model/rendered sequences when a scene needs volumetric geometry.

Puppet deformation is available on native images and solids. Supply fixed artwork
and authored pin tracks, then add starch regions to keep parts stiff and overlap
regions for ordering. Start with the self-contained
[puppet acting example](../../examples/composition/12-puppet-acting/README.md);
its separate prop-follow example shows solved constraints driving a hand pin.
Pose/action libraries, walk/knock/offer/receive/react passage actions and caption/
speech/thought containers are documented in [acting](../../docs/story-acting.md).

### Output formats and rendering controls

```sh
pnpm --silent still-shift comp render --input composition.json --output alpha.mov --backend webgl2 --format prores4444 --workers 4 --cache-static true --transport raw_rgba
```

| `--format`      | Delivery                          |
| --------------- | --------------------------------- |
| `h264`          | 8-bit MP4; default video delivery |
| `hevc10`        | 10-bit HEVC MP4                   |
| `prores422hq`   | ProRes 422 HQ MOV                 |
| `prores4444`    | ProRes 4444 MOV with alpha        |
| `vp9alpha`      | VP9 WebM with alpha               |
| `png8`, `png16` | Numbered PNG sequence with alpha  |

Composition dimensions and FPS are authored in the source. Use a suffix matching
the delivery container; PNG delivery requires a filename pattern such as
`frames/frame.%06d.png` and publishes its ordered checksum manifest. H.264 and HEVC require
even dimensions. Higher-depth delivery converts the rendered 8-bit samples; it
does not invent missing source precision. Transparent output requires an
alpha-capable format and a transparent composition background.

`--workers 1|2|3|4` controls bounded parallel frame workers. `--cache-static true|false`
controls eligible static prefix/subtree reuse. Explicit delivery profiles require
lossless `--transport png_pipe|raw_rgba`; the legacy MP4 path also supports the
recorded JPEG evaluation transport. Output/profile/cache/source identities and
checksums are retained in the result and scene metadata. New paths are required;
exports preserve existing files.

## Single-image animation

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

The command writes a 1920×1080 H.264 MP4 by default, or a 1080×1920 MP4 with `--format vertical`, plus `still.mp4.scene.json`. `--silent` keeps pnpm's script banner off stdout, so stdout contains one JSON `AnimationResult` with the output path, scene path, rendered/fallback status, selected preset, stable warnings, source/depth/scene/output SHA-256 checksums, cache status, timings, and tool versions. The output and manifest paths must not already exist. The result's `checksums.source` hashes the original input file. The scene manifest identifies the normalized source and depth by checksum so its bytes and scene checksum do not depend on the local cache directory. The result's `assetPaths` gives the current normalized source and depth paths for local reproduction. Both the result and scene manifest record the depth model ID, revision, and weight checksum, or `null` when depth preparation failed.

Depth, flat and fallback video results include `metrics.renderEnvironment`: the pinned
browser profile, Chromium version, WebGL renderer, raster fingerprint, platform and CPU
architecture. The field is optional when parsing older results or no-op results.

`--preset auto` chooses among the three presets using the normalized source checksum and seed. Durations are 3–8 seconds in whole 30-FPS frames. The default depth model is Depth Anything V2 Small; preparation is cached. Valid images whose depth preparation or safety analysis fails produce a deterministic 2D MP4 with `DEPTH_PREPARATION_FAILED` or `DEPTH_SAFETY_ANALYSIS_FAILED`, respectively. Invalid inputs and export failures are errors. The CLI does not overwrite outputs.

Source-normalization warnings use the stable `SOURCE_NORMALIZATION_WARNING` code and include the depth worker's specific reason in `context.workerCode`.

Set `STILL_SHIFT_CACHE_DIR` to choose another preparation cache. Relative paths are resolved from the CLI caller's working directory, including when the depth worker runs from the repository root.

Four explicit editorial presets—`locked_hold`, `story_settle`,
`panel_reveal`, and `comparison_step`—normalize the source and render in flat
2D without running depth inference. They return a normal rendered result, with
`depth: null` in the scene manifest. Choose a reveal only for a composition
authored for its reading order; see the
[illustrated-motion trial](../../docs/history-offstage-presets.md).

Exit code 0 means a complete result, including a valid 2D fallback. Exit code 2 means invalid command options or request constraints. Exit code 1 means an input, preparation, render, encode, or publication failure; stderr contains one JSON `AnimationFailure`. `--adapter noop` keeps the v0.1 fake path available for compatibility checks. For local fixtures, `STILL_SHIFT_DEPTH_ADAPTER=fake` selects the deterministic fake depth worker.

`pnpm test:browser:cli` exercises an explainer-shaped fixture, cache reuse, repeated checksums, intentional flat 2D, depth-failure fallback, invalid input, and existing-output protection.

For vertical crops, depth motion estimates a focal point when `--focus` is absent.
Pass `--focus 0.55,0.42` to choose a normalized source point explicitly. Flat
presets and source-only vertical rendering require this focus value. The
resolved crop and focal source are recorded in the scene manifest.

## Prepared illustrated scenes

`animate-scene` renders four prepared families: frozen legacy
`illustrated-scene-1`, cinematic `illustrated-scene-2`, `story-scene-1` and
`commerce-scene-1`. Use their actual schema/recipe rather than passing a family
recipe name to the single-image `--preset` option. Their adapters can also compile
to `composition-1` with `comp export-json --scene`.

Story recipes use `story-scene-1` with integer `frameCount`, explicit cue frames
and the same `animate-scene` command. They return `story-result-1` and support
fractional derived milliseconds, including 646 frames at 24 fps. See the
[seven-recipe guide](../../docs/story-motion-implementation.md) and
[fixtures](../../benchmarks/fixtures/story-motion/catalog.json). Legacy v1/v2
contracts retain their duration limits.

The six richer History Offstage presets use a scene JSON containing supplied image
layers, paths, text, and authored states:

```bash
pnpm still-shift animate-scene \
  --scene benchmarks/fixtures/history-offstage-v2/resource-flow.json \
  --output /tmp/resource-flow-new.mp4
```

The scene supplies its preset, duration, and explicit 24 or 30 fps frame rate.
Clips must span 3–8 seconds in whole frames. Assets are resolved relative to the
JSON and checked against their SHA-256 hashes and dimensions. Missing roles,
invalid paths/crops, and missing alternate states produce errors before export.
`animate-scene --format vertical` selects a catalog-declared variant when the
base scene has one. The [Chronicle Reveal portrait fixture](../../benchmarks/fixtures/history-offstage-v2/vertical/chronicle-reveal.json)
is one example. Standalone illustrated scenes require an already resolved
1080×1920 input. A `story-scene-1` file can carry `formats.vertical`; the CLI
resolves that authored override before rendering. Cinematic scenes without a catalog variant run the
automatic vertical reframe; it fails with a coverage or source-resolution report
when the supplied art cannot fill a safe portrait camera path. Story passage
plans use `story:passage --format vertical` to resolve authored template
overrides. `still-shift passage lint --plan <plan.json> --format vertical`
checks the resolved story scene and reports all vertical layout diagnostics.
Passage exports include `metrics.renderEnvironment` in `render-report.json` for both
fresh renders and cache hits, recording the pinned browser profile, Chromium version,
WebGL renderer, raster fingerprint, platform and CPU architecture.

This command writes the MP4, `.mp4.scene.json`, and `.mp4.result.json`; the legacy
illustrated family returns `illustrated-result-1`. Story, cinematic and commerce
inputs return their corresponding result schemas. Output files must not already exist.
Prepared input is separate from `animate --input` and the existing image batch
format. See the [six preset guide](../../docs/history-offstage-motion-implementation.md)
for the lab, reusable examples, and review reel. `pnpm illustrated:render
--output-dir <new-directory>` renders the six prepared fixtures through this CLI.

The prepared-scene command also accepts `illustrated-scene-2` for the cinematic
`layered_parallax` recipe. It supports `dramatic`, `standard`, and `restrained` intensity in
the scene JSON and returns `illustrated-result-2` with camera-validation metrics.
Every frame must satisfy declared background coverage and subject framing;
unsafe or insufficiently separated planes fail explicitly. See the
[cinematic guide](../../docs/cinematic-parallax-implementation.md) for examples.
For coverage or source-resolution failures, the JSON failure's
`error.context.diagnosticsJson` and `error.context.reportJson` preserve the
structured diagnostic and the affected layer, edge, frame and pixel shortage.
`cinematic:preview --format vertical` applies the same catalog selection and
automatic reframe, returning JSON diagnostics and a coverage report on failure.

The same command accepts the `threshold_push` recipe with `camera.push`, two
foreground sides, a subject assembly, and a distant plate. It checks source
resolution after magnification on every frame. Run `pnpm threshold:render
--output-dir <new-directory>` for its two compositions and Standard comparison;
see the [Threshold Push guide](../../docs/threshold-push-implementation.md).

The `lateral_track` recipe uses nonzero X travel, zero Y/Z travel, fixed scale,
and visible subject drift. Run `pnpm lateral:render --output-dir <new-directory>`
for two grounded room compositions and a Standard comparison. See the
[Lateral Track guide](../../docs/lateral-track-implementation.md).

The `foreground_reveal` recipe adds an authored vessel polygon and validates actual
foreground alpha before rendering. It clears the subject and holds the ending.
Run `pnpm reveal:render --output-dir <new-directory>`; see the
[Foreground Reveal guide](../../docs/foreground-reveal-implementation.md).

The complete cinematic recipe set also includes `rising_vista`, `curved_approach`,
`detail_to_world`, `focus_handoff` and `dolly_zoom_tension`. These respectively rise
past cover, approach on a curved path, pull back into context, transfer focus and
combine forward travel with a compensating focal change. All nine choices use
prepared planes and the shared coverage/source-resolution checks. See the
[cinematic gallery route](../../docs/user-guide.md#cinematic-scenes),
[fixture catalog](../../benchmarks/fixtures/cinematic-illustrated/catalog.json)
and [Dolly Zoom guide](../../docs/dolly-zoom-implementation.md).

Story's seven narrative recipes are `unequal_margins`, `access_constraint`,
`relationship_build`, `evidence_boundary`, `dated_system_break`, `category_swap`
and `motif_resolve`. Linked passage authoring, continuous motion and supplied
character poses/actions add coordination across beats; see
[continuous storytelling](../../docs/story-motion-continuous-implementation.md)
and [character acting](../../docs/story-acting.md).

## Commerce briefs

Use **prepare-commerce --brief <brief.json> --output <scene.json>** to resolve a
commerce brief, hash its image and bundled font, and create commerce-scene-1.
Pass the scene to **animate-scene**. The command returns commerce-result-1
with exact frame count, dimensions, checksums and render metrics.

```bash
pnpm still-shift prepare-commerce --brief benchmarks/fixtures/ecommerce-motion/a01-landscape.brief.json --output /tmp/commerce-scene.json
pnpm still-shift animate-scene --scene /tmp/commerce-scene.json --output /tmp/commerce-ad.mp4
```

Selections H03/H01/H04/A01 support 24/30 fps in landscape, portrait, square and
4:5 feed (1080×1350).
The brief controls integer frame count; the legacy 3–8 second restriction does
not apply. Image paths are relative to the brief; prepared dependencies are
relative to the scene. Existing files are never overwritten. Missing sources,
required cutouts, unsupported selections and invalid callout geometry are errors.
Text fitting is checked with the loaded font during preview/export.

The browser source ZIP contains a prepared scene.json, brief and exact dependencies:
unzip and render its scene directly. See the [Commerce guide](../../docs/ecommerce-motion-implementation.md).

H03/H01/H04/A01 remain **Experimental** complete treatments; unimplemented catalog
formats stay **Reference only**. A01 supports an intact cutout floating above a
stationary palm photograph. The reusable atomic components are available, including
product entrance/float, draw-on annotations, counters, detail windows, masks,
light/blur effects and authored spatial paths. See
[atomic components](../../docs/ecommerce-atomic-components-implementation.md),
[effects](../../docs/ecommerce-motion-effects-implementation.md) and
[spatial components](../../docs/ecommerce-spatial-components-implementation.md).

Story and commerce share [reusable components](../../docs/reusable-components.md)
for values, state cuts, path travel, visibility, sequences, pins, fitted text and
alpha masks. [Typography](../../docs/typography-engine.md) adds pinned variable/
OpenType styles, grapheme-safe spans, wrapping, glyph/word/line selectors,
decoration, text transitions and semantic text presets. These are authored scene
features; the CLI renders or compiles their data, while Lab provides galleries and
selected controls.

## Unattended batch

Create a UTF-8 JSONL file with one object per line. IDs must be unique regardless of letter case and use letters, digits, underscores, or hyphens (1–80 characters). Paths are resolved relative to the JSONL file. Blank lines are ignored.

```jsonl
{"id":"shot-001","inputPath":"./stills/first.png","durationMs":5000,"preset":"auto","intensity":"standard","seed":1842}
{"id":"shot-002","inputPath":"./stills/second.png","durationMs":3000}
{"id":"shot-003","inputPath":"./stills/third.png","durationMs":3000,"preset":"locked_hold","focus":[0.5,0.5],"formats":["landscape","vertical"]}
```

```bash
pnpm still-shift batch \
  --manifest ./shots.jsonl \
  --output-dir ./outputs \
  --concurrency 2
```

`durationMs`, `preset`, `intensity`, and `seed` default to the single-image CLI values. Concurrency is bounded to 1–2 renders; it defaults to 1. Each item writes `<id>.mp4`, `<id>.mp4.scene.json`, and a private `.batch-checkpoints/<id>.json` checkpoint. After all items finish, the command atomically writes `batch-results.jsonl` in input order and `batch-summary.json`. Each result record includes line number, ID, input path, request hash, reuse flag, status, and either the full `AnimationResult` (paths, warnings, checksums, timings, selected preset) or an `AnimationFailure`. The summary contains counts, reuse count, success rate, elapsed time, and paths.

`--format vertical` sets a batch-wide default. An item can set `format` for one
render, or `formats: ["landscape", "vertical"]` to render both. The latter writes
`<id>-landscape.mp4` and `<id>-vertical.mp4`, with separate result and checkpoint
IDs. Give flat vertical items a normalized `focus: [x, y]`.

The batch keeps going after an individual item fails. Exit code 0 means every manifest item has a result record, including any per-item failures; check `batch-summary.json` and `batch-results.jsonl` for their status. Exit code 2 means invalid batch configuration, and 1 means batch execution stopped before the results were complete. For a partial failure, fix the source or manifest and rerun the same command. Completed items are reused only when their request, source, scene, MP4, normalized source, and depth hashes match the checkpoint. A changed request or damaged artifact is reported as an item failure to avoid silently overwriting earlier work. An interrupted run leaves an owner lock and per-item progress markers; the next run reclaims a lock whose process has exited and rerenders an uncheckpointed item only when its request and source still match the marker. If an uncheckpointed MP4 or scene manifest exists, the batch preserves it and reports an item failure because the progress marker cannot prove who created it. Inspect and move those files before retrying. To intentionally rerender one ID, move its MP4, scene manifest, and checkpoint out of the output directory before retrying. Concurrent batch commands targeting one output directory are rejected.

The WebGL path uses the lossless in-memory PNG frame pipe by default. `STILL_SHIFT_FRAME_TRANSPORT=jpeg_pipe` selects the faster 95%-quality JPEG evaluation path. The transport is recorded in the scene manifest and result metrics; transport, depth adapter, and requested depth device are included in batch checkpoint identity. `batch-runs.jsonl` preserves each run summary so a fast retry does not replace the full-render wall-time measurement.

`pnpm test:browser:batch` verifies mixed success/failure, bounded execution, retry identity, and artifact tamper detection.

## Composition motion lint

```sh
pnpm --silent still-shift comp lint --input composition.json
pnpm --silent still-shift comp lint --input composition.json --policy policy.json --pixels true
```

Returns structured JSON diagnostics with inclusive frame ranges, severity and
property paths. Errors or failed input/measurement exit 1; warnings alone exit 0.
State checks run without a browser. `--pixels true` measures all frames using pinned
export Chromium and the continuous-motion grayscale-energy gate; it also measures
text bounds. The report distinguishes unmeasured pixels and incomplete text framing.
Use the [composition reference](../../docs/composition-reference.md#motion-linting-ce12)
for configurable thresholds, reading roles, cuts, shot partitions and severity overrides.

## Narration timing and passages

```sh
pnpm still-shift passage import-narration --plan passage.json --narration narration.wav --timing words.json --mode match --output timed-passage.json
pnpm still-shift passage lint --plan timed-passage.json --format vertical
```

`import-narration` accepts measured word JSON or SRT. `--mode match` retimes existing
unique phrases; `--mode add` creates unbound transcript cues. Linked animation,
poses, actions and sound anchors follow their cue IDs. The importer validates real
audio and cue/event ranges, writes a fresh plan and returns timing changes. Supply
aligned timing from your narration workflow; this command does not transcribe or
generate speech. See [narration import](../../docs/narration-timing.md).

Full passage preparation/export uses checkout scripts and the Passage workbench:

```sh
pnpm story:passage --plan timed-passage.json --narration narration.wav --output-dir passage-output
pnpm story:passage --plan timed-passage.json --silent --renderer composition --backend webgl2 --output-dir native-passage
pnpm story:package --plan timed-passage.json --narration narration.wav --output-dir portable-passage
```

Choose exactly one audio mode: `--narration`, `--soundtrack`, `--sound-only`,
`--silent` or `--prepare-only`. `--renderer composition` compiles family beats or
uses authored native composition picture files, sharing the evaluator/renderer
with program preview. `--composition-beats <map.json>` loads a map of beat IDs to
authored native composition picture files;
`--backend webgl2` requires the composition renderer. Range renders use
`--start-frame`/`--end-frame`, or select `--beat`; `--resume` uses verified caches.
Saved output contains the picture, render report and linked source metadata.
The [passage guide](../../docs/user-guide.md#build-a-passage) covers linked events,
revision history, portability, review packages and native beat authoring.

## Soundtrack projects and optional SFX

Use a saved `soundtrack-project-1` for tracks/buses, precise clips, gain/pan/fades,
automation, filters, ducking and optional master limiting. Native composition
audio and legacy passage audio remain separate supported routes.

In the checkout, use `pnpm soundtrack:setup`; in an npm project, install `uv` and run
`npx still-shift setup soundtrack`. Set `STILL_SHIFT_SOUNDTRACK_PYTHON` to the printed
Python path for rendering. `STILL_SHIFT_SOUNDTRACK_ENV` selects another environment
at setup. Audio runtime binaries are installed separately.

```sh
pnpm still-shift soundtrack validate --project soundtrack.json
pnpm still-shift soundtrack inspect --project soundtrack.json --json
pnpm still-shift soundtrack edit --project soundtrack.json --revision 0 --operations edits.json
pnpm still-shift soundtrack render --project soundtrack.json --output-dir audio-render --stems
pnpm still-shift soundtrack render --project soundtrack.json --output-dir audio-range --range 24000:96000
pnpm still-shift soundtrack retime --project soundtrack.json --revision 1 --passage timed-passage.json
pnpm still-shift soundtrack package --project soundtrack.json --output-dir portable-audio
pnpm still-shift soundtrack from-passage --passage timed-passage.json --narration narration.wav --output new-soundtrack.json
```

Edits and retimes require the project's actual revision. Edit operations can also
come from stdin using `--operations -`; updates preserve bounded undo/redo history.
Range positions are 48 kHz sample indices with an exclusive end. Render directories
and package destinations must be fresh. Packaging verifies and includes the original
source bytes; the optional `--stems` export supports later editing. See the
[soundtrack project guide](../../docs/soundtrack-project.md) for the complete schema,
DSP bounds, headroom, memory and package semantics.

```sh
pnpm still-shift sfx generate --provider elevenlabs --id door-knock --prompt "A short wooden door knock" --duration 1 --output-dir new-sfx
```

The provider generator requires `ELEVENLABS_API_KEY` in the server environment and
consumes paid account credits. It accepts 0.5–30 seconds, optional
`--prompt-influence 0..1` and `--loop true|false`, and writes the asset plus provenance.
Each request needs a fresh directory; paid failures are never automatically retried.
Use the generated local asset in a passage or saved soundtrack.
