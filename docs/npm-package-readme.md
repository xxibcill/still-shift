# Still Shift

Author, preview and render deterministic motion from JSON or TypeScript. Combine
illustrations, text, vector shapes, native media, cameras, lights and puppet meshes;
use prepared story/commerce recipes or build a custom composition. Includes the
`still-shift` command, motion authoring API, renderer and optional soundtrack
workflow. Licensed under GPL-3.0-only.

This README describes the current package source. The full
[user guide](./user-guide.md), [composition reference](./composition-reference.md)
and [AI discovery skill](../skills/ask-still-shift/SKILL.md) ship under `source/`.
The published `0.1.0` archive predates this documentation refresh; these added guides
and skills are included in this `0.1.1` candidate. Updating this source does not
update an already published version; publication requires a verified archive.

## Install

Use Node 22.23.1 or a newer Node 22 release. The verified production platform is
macOS on Apple Silicon. Other platforms have not completed release verification.

```sh
npm install still-shift
npx still-shift setup browser
```

Rendering also requires FFmpeg and ffprobe 8.0.1 on `PATH`. Browser installation
downloads the pinned Playwright Chromium separately. Installation does not run
setup scripts, download models or install a Python/audio runtime automatically.

```sh
npx still-shift --help
npx still-shift comp validate --input composition.json
npx still-shift comp preview --input composition.json
npx still-shift comp render --input composition.json --output clip.mp4 --backend webgl2
```

Keep project assets beside the project at its recorded relative paths. Rendering
requires a new output path; preserve the generated manifests alongside the video.

## Choose a workflow

| Goal                                                          | Input and command                                                                                             | Feature guide                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build a custom clip with editable layers                      | `composition-1` JSON or a TypeScript program; `comp validate`, `comp preview`, `comp render`                  | [Compositions](./composition-reference.md)                                                                                                        |
| Move one still image                                          | `animate --input still.png`; three depth presets and four flat editorial presets                              | [Image animation](./user-guide.md#animate-one-image)                                                                                              |
| Animate prepared illustration layers and camera moves         | `animate-scene --scene scene.json`; legacy illustrated and cinematic recipes                                  | [Cinematic scenes](./user-guide.md#cinematic-scenes)                                                                                              |
| Explain comparisons, routes, relationships and change         | `story-scene-1`; `animate-scene`                                                                              | [Story recipes](./story-motion-implementation.md)                                                                                                 |
| Coordinate visual beats, narration cues and character actions | Linked `story-passage-2` plan; narration import/lint commands, checkout Passage workbench and passage scripts | [Storytelling](./user-guide.md#storytelling), [acting](./story-acting.md)                                                                         |
| Create product heroes, callouts and short ads                 | Commerce brief; `prepare-commerce`, then `animate-scene`                                                      | [Commerce](./ecommerce-motion-implementation.md)                                                                                                  |
| Reuse labels, counters, connectors, masks and timing          | Component definitions in story/commerce scenes; native builder presets                                        | [Reusable components](./reusable-components.md)                                                                                                   |
| Shape multilingual type and animate text meaning              | Pinned fonts, rich typography, selectors, transitions and text presets                                        | [Typography](./typography-engine.md)                                                                                                              |
| Bend supplied artwork or keep regions stiff                   | Native image/solid `puppet` pins, overlap/starch regions and prop-follow constraints                          | [Puppet acting](./story-acting.md#native-composition-puppet-acting), [self-contained example](../examples/composition/12-puppet-acting/README.md) |
| Mix narration, music, ambience and sound effects              | `soundtrack-project-1`; `soundtrack` commands and optional audio runtime                                      | [Soundtrack projects](./soundtrack-project.md)                                                                                                    |
| Animate many independent stills                               | JSONL manifest; `batch --manifest shots.jsonl --output-dir outputs`                                           | [Batch](./user-guide.md#batch-animation)                                                                                                          |

The feature guides include repository examples and Lab workflows. Commands starting
with `pnpm lab`, `pnpm story:*`, `pnpm cinematic:*` or fixture paths require a source
checkout with its supporting scripts and assets. The npm CLI accepts your own project
files; replace `pnpm [--silent] still-shift` with `npx still-shift`. This archive
includes text references and small authoring examples, while benchmark fixtures,
historical measurement JSON, rendered reviews and their artwork collections remain
in the repository. Small release records are retained with the package source. Some examples
also need the checkout's pinned fonts/art; the puppet example includes its own SVGs.

## Composition features and commands

Custom compositions support native image/depth-image, solid, vector shape, text,
group, null, precomp, adjustment, video, PNG sequence, audio, camera and light layers.
Use keys, easing, markers, drivers, expressions, constraints, masks, mattes, blend
modes and effects to coordinate them. Nested precomps have independent clocks,
including time remap, loops, holds and posterization. Native shapes include Bézier
morphs, gradients, brush/ink strokes, trims, repeaters and path operators. Typography
supports pinned OpenType/variable fonts, fitting, spans, glyph/word/line animation,
text containers and state transitions. Motion blur and lint help check moving art
and reading holds before export.

Native 2.5D/3D planes, perspective cameras, depth of field and flat ambient/point/spot
lighting use the bounded composition contract. WebGL2 is required for perspective,
depth displacement and flat lighting; the reference lists backend limits. Prepared
media verifies source hashes, timing and supported color metadata, then shares
decoded frames/audio between preview and export. Puppet meshes deform supplied
artwork using authored pins; automatic character rigging remains future work.

```sh
npx still-shift comp validate --input composition.ts
npx still-shift comp preview --input composition.ts --watch
npx still-shift comp lint --input composition.ts
npx still-shift comp lint --input composition.ts --pixels true --backend webgl2
npx still-shift comp export-json --input composition.ts --output composition.json
npx still-shift comp export-json --scene prepared-story.json --output native.json
npx still-shift comp normalize --input composition.json --output normalized.json
npx still-shift comp bake --input composition.json --output baked.json
npx still-shift comp render --input composition.json --output clip.mp4 --backend webgl2
```

`export-json --scene` compiles supported illustrated, cinematic, story and commerce
inputs to native composition data. `normalize` retains expression source and adds
canonical AST data while preserving authored behaviours;
`bake` samples expressions/drivers into keys. `comp preview` prints its local URL
and provides playback, seeking and the inspector. Watch mode retains the last
valid frame when a rebuild fails. Output writes use new paths.

`comp render --format` supports `h264` (default), `hevc10`, `prores422hq`,
`prores4444`, `vp9alpha`, `png8` and `png16`. Use alpha-capable formats for a
transparent background. PNG output requires a pattern such as `frames/frame.%06d.png`.
Higher-depth formats expand rendered 8-bit samples; they do not add source precision.
Rendering supports `--workers 1|2|3|4`, `--cache-static true|false` and lossless
`--transport png_pipe|raw_rgba`. The legacy MP4 path also supports the recorded
JPEG evaluation transport. The scene, result metadata and checksums
record reproducible inputs and output settings. See the
[output reference](./composition-reference.md#rendering-a-composition)
and [native media guide](./composition-media.md) for exact limits.

## Image, prepared-scene and batch animation

```sh
npx still-shift animate --input still.png --output still.mp4 --duration 5 --preset auto --intensity standard --seed 1842
npx still-shift animate-scene --scene scene.json --output scene.mp4
npx still-shift prepare-commerce --brief brief.json --output commerce-scene.json
npx still-shift animate-scene --scene commerce-scene.json --output ad.mp4
npx still-shift batch --manifest shots.jsonl --output-dir outputs --concurrency 2
```

Single-image depth presets are `slow_push`, `horizontal_drift` and
`cinematic_float`; `auto` selects among them deterministically. Flat presets are
`locked_hold`, `story_settle`, `panel_reveal` and `comparison_step`. Single-image
clips use 3–8 seconds at 30 fps with `subtle`, `standard` or `strong` intensity.
`--format vertical` makes 1080×1920 output; an explicit normalized `--focus x,y`
is required for flat vertical clips. Depth preparation failures can produce a
recorded deterministic 2D fallback. Depth inference requires the opt-in runtime.

Prepared cinematic recipes include `layered_parallax`, `threshold_push`,
`lateral_track`, `foreground_reveal`, `rising_vista`, `curved_approach`,
`detail_to_world`, `focus_handoff` and `dolly_zoom_tension`. They use supplied
planes with authored coverage/framing and 24/30 fps; their intensity vocabulary
is `dramatic`, `standard` and `restrained`. The six earlier illustrated recipes
remain readable. Story recipes include Unequal Margins, Access Constraint,
Relationship Build, Evidence Boundary, Dated System Break, Category Swap and
Motif Resolve. Story and commerce use explicit frame counts rather than the
single-image duration cap.

Commerce implements H03, H01, H04 and A01, including A01 palm-up floating. These
complete treatments remain **Experimental**; catalog entries without renderers
remain **Reference only**. Commerce supports landscape, portrait, square and 4:5
feed. Prepared cinematic/story vertical output uses authored variants or the
documented reframe checks. Custom composition dimensions are authored directly.
Portrait and square output still require an appropriate composition layout.

Batch paths are relative to the JSONL manifest. Rendering continues after an item
failure; a completed batch exits 0 even when individual items failed, so inspect
`batch-summary.json` and `batch-results.jsonl`. Verified checkpoints reuse intact
completed items; changed or damaged outputs are preserved and reported.

## Narration, passages and sound

```sh
npx still-shift passage import-narration --plan passage.json --narration narration.wav --timing words.json --mode match --output timed-passage.json
npx still-shift passage lint --plan timed-passage.json --format vertical
npx still-shift soundtrack validate --project soundtrack.json
npx still-shift soundtrack inspect --project soundtrack.json --json
npx still-shift soundtrack edit --project soundtrack.json --revision 0 --operations edits.json
npx still-shift soundtrack render --project soundtrack.json --output-dir audio-render --stems
npx still-shift soundtrack retime --project soundtrack.json --revision 1 --passage timed-passage.json
npx still-shift soundtrack package --project soundtrack.json --output-dir portable-audio
npx still-shift soundtrack from-passage --passage timed-passage.json --narration narration.wav --output new-soundtrack.json
```

Narration import accepts measured word JSON or SRT, matching existing phrases or
adding cues with `--mode add`. Linked events, poses, supplied character actions and
sound anchors follow cue edits. Passage workbench editing, full passage rendering,
portable picture/audio packaging and review pages use the checkout's workflows;
the npm `passage` subcommands cover narration import and vertical lint.

Saved soundtracks support tracks/buses, sample-accurate clips, fades, gain/pan
automation, built-in filters, narration-driven music ducking, an optional master
limiter, revision-checked edits, range renders and stems. The separate audio
runtime produces the mix; a project package includes source media and history.
Existing passage audio and native composition audio remain available.

Optional `sfx generate --provider elevenlabs` writes a generated asset and its
provenance to a fresh directory. It requires `ELEVENLABS_API_KEY` in the environment,
makes a paid provider request, and consumes account credits. The
[sound guide](./user-guide.md#saved-soundtrack-layers) documents the
complete workflow. Speech generation and transcription/alignment are supplied by
your own narration workflow.

## TypeScript authoring

```ts
import { comp, solid } from "still-shift";

export default comp(
  {
    id: "hello",
    width: 320,
    height: 192,
    fps: 24,
    seconds: 2,
    background: "#fff4df",
  },
  (scene) => {
    scene.add(solid("card", { color: "#305c70", size: [100, 100] }));
  },
);
```

Save as `composition.ts` and use it with the same commands. `still-shift/motion`
also exports the authoring API; `still-shift/motion/node` contains Node asset
helpers. Existing `@still-shift/motion` imports are supported inside programs
loaded by the CLI. For direct imports in your application use the `still-shift`
package names. Additional ESM entry points are `still-shift/engine`,
`still-shift/renderer`, `still-shift/schema` and `still-shift/runtime`.
Type declarations are included. CommonJS `require()` is not a supported API.

The builder provides layers and properties plus `seq`, `par`, `stagger`, `delay`,
`at` and `after` for timelines. `imageAsset`/`fontAsset` pin real image/font bytes.
Motion presets are `settle`, `press`, `recoil`, `handoff`, `breathe`, `drawOn` and
`land`; text presets are `reveal`, `emphasize`, `correct`, `qualify`, `retype`,
`count`, `redact` and `release`. Use `expr`, `ref` and `instance` for the supported
expression/property paths. JSON and `.ts`, `.mts` or `.cts` programs use the same
CLI workflow. See [authoring examples](../examples/composition/) and the
[generated contract](./composition-reference.md#typescript-authoring).

## Optional soundtrack runtime

Install `uv` separately, then explicitly install the pinned audio runtime:

```sh
npx still-shift setup soundtrack
npx still-shift soundtrack --help
```

The default runtime is `~/.cache/still-shift/soundtrack`. To install elsewhere,
set `STILL_SHIFT_SOUNDTRACK_ENV`; use the printed `STILL_SHIFT_SOUNDTRACK_PYTHON`
path when rendering. An existing compatible runtime can be selected directly
with `STILL_SHIFT_SOUNDTRACK_PYTHON`.

DawDreamer, NumPy, SciPy and their native libraries are installed separately;
their binaries are not in this npm package. See `THIRD-PARTY-NOTICES.md`.
Depth preparation is also opt-in: `still-shift setup depth` uses `uv` and the
included Python lockfile. Depth models are obtained separately when requested.

## Lab and AI skills

For the complete local Lab, use a source checkout and run `pnpm lab`. It includes
the composition inspector, image/cinematic/story galleries, Passage and Commerce
workbenches, shared components, vertical variants, preview/edit/undo/redo and
source/export packages. The npm `comp preview` command provides the program preview
without launching that complete gallery/workbench project.

The packaged [ask-still-shift skill](../skills/ask-still-shift/SKILL.md) helps
discover features and select the right route. The
[compose-with-still-shift skill](../skills/compose-with-still-shift/SKILL.md)
covers code authoring; its generated instructions link the matching composition
contract. Install the entire skill folder in your agent's skill directory. Keep
the package's `source/docs/` and examples accessible so the skill can resolve its
references, and tell it whether you are working in an installed project or checkout.

## Source and verification

The complete application source and package build scripts are included under
`source/`. With the pinned toolchain, run `pnpm install --frozen-lockfile` then
`pnpm build:package` from that directory to rebuild the distribution.
Repository verification runs locally; GitHub Actions are prohibited.
See [the release procedure](./npm-release-plan.md) for recorded validation
limits. This documentation refresh does not establish a new verified release or
replace the published `0.1.0` archive/checksum; changed source requires fresh release
verification before publication.
