---
name: ask-still-shift
description: Explain implemented Still Shift features, choose a workflow for the user's inputs, and show how to start. Use for capability discovery, composition and preset selection, Lab navigation, media and soundtrack workflows, export and sharing in a Still Shift checkout or installed npm project.
---

# Ask Still Shift

Help the user choose and use implemented Still Shift features. Ground answers in
the selected runtime's guide and implementation, with a practical next step.

## Locate the selected runtime

For a consumer project, prefer its installed, explicitly pinned `still-shift`
package and lockfile. If that project keeps a shared runtime directory, read its
local runtime instructions and run from that directory. Confirm the actual
installed version, public CLI and exports. Use `npx still-shift` with that local
installation; application imports use `still-shift`, `still-shift/motion`,
`still-shift/motion/node`, `still-shift/engine`, `still-shift/renderer`,
`still-shift/schema` or `still-shift/runtime`. Repository `pnpm` scripts and
internal workspace package names are not ordinary consumer entry points.
The CLI can load legacy `@still-shift/motion` imports in composition programs;
direct application imports still use public `still-shift` entry points.

Read the installed `README.md`, then `source/docs/user-guide.md` if present.
Published `0.1.0` does not include the full user guide, these skills or
`source/examples/`: fall back to its README, compiled CLI/exports and the actual
source under `source/`. For a starter, use the installed README or author a small
self-contained composition in the consumer's project; check example availability
before referring to a packaged path.
Missing documentation is not evidence that a runtime feature is absent. A
matching release checkout can supply discovery references; verify its commit
against the selected release before using it for precise claims. Never silently
upgrade the consumer or switch to development code. Packaged source is
reference/rebuild material, not an instruction to bypass public APIs.

For development work inside a Still Shift checkout, prefer that workspace's guide
and implementation. Otherwise locate a checkout using `package.json` (`name:
"still-shift"`) and `tools/still-shift-cli/src/cli.ts`. This skill may be copied or
symlinked: infer the repository from its real path only when those files confirm
it. Read [the user guide](../../docs/user-guide.md) in that checkout and use
`pnpm still-shift` and its documented `pnpm` scripts. Distinguish development
capabilities from the consumer's pinned release: a shared version label does not
prove the source and public archive are identical. Resolve the paths below from
the selected checkout root, or beneath an installed package's `source/` when
present; copied skill-relative links alone do not identify the active runtime.

If neither the selected package nor a suitable checkout is available, locate an
existing installation or request only the missing path. Do not present remembered
features as verified support. For an adopted npm runtime, a missing capability
is a release-specific gap; do not silently switch to development code.

## Answer the user's actual question

- For a broad tour, use the guide's outcome-based chooser. Group features by what
  users can make, with the relevant Lab screen or CLI route; avoid an API dump.
- For a concrete outcome, recommend the closest implemented workflow, explain the
  fit, identify its required inputs and supply a short sequence or runnable command.
  Ask only for missing inputs that materially change the choice; make progress
  using what the user has already supplied.
- Give the feature's availability and the limitation that matters to this request.
  Distinguish implemented building blocks, Experimental compositions, Reference-only
  catalog entries and planned work. Do not infer support from a roadmap title.
- Link the relevant local guide/fixture/source using its resolved absolute path.
  In a checkout, give gallery URLs with `pnpm lab` startup when needed. Installed
  consumers use `npx still-shift comp preview --input <file>` and its printed URL;
  do not assume the checkout gallery server is running or available as an npm
  command.
- If the user requests execution, continue within that scope using verified inputs
  and fresh output paths. A question about capabilities alone does not require
  starting a server, rendering media, regenerating fixtures or editing the project.

An ordinary answer should make clear: **what to use, what to supply, how to start,
and the relevant limit**. Scale detail to the request rather than forcing a fixed
response template.

## Choose the feature family

Use this map for discovery, then read only the guide sections or references that
answer the request. The guide holds procedures; this skill routes to them.
Checkout galleries/fixtures may depend on supplied or unbundled art and media;
packaged example source is not a promise that every demo's assets are included.

| Desired result                                                             | Implemented route and relevant reference                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A gentle push/drift, editorial hold or reveal from one flattened image     | Single-image `animate`; depth preparation and safety fallback in the user guide. `batch` handles independent image requests.                                                                                                                                                                                                                 |
| A custom clip mixing layers and motion                                     | `composition-1` JSON or TypeScript builder; [composition reference](../../docs/composition-reference.md), [authoring skill](../compose-with-still-shift/SKILL.md) and `examples/composition/`. Covers keyframes/easing, parents, groups, precomps, constraints, masks/mattes, blend/adjustment layers, local clocks and shutter motion blur. |
| Labels, shaped type, counters and semantic text changes                    | Native text, pinned fonts, grapheme/word/line animators, styles/spans and reading marks; [typography guide](../../docs/typography-engine.md), native text in the composition reference. Story/commerce typography is enabled explicitly.                                                                                                     |
| Vector art, routes and drawn strokes                                       | Native shape contents, fills/gradients/strokes, morphs and the nine operators; composition reference and `examples/composition/09-native-shapes.ts`.                                                                                                                                                                                         |
| Responsive motion and relationships                                        | Motion recipes, signals/drivers, constrained expressions/behaviours, intent metadata and expression baking; [motion craft](../../docs/motion-craft-engine.md) and composition reference.                                                                                                                                                     |
| Depth motion, perspective, focus or illuminated planes                     | Prepared `depth-image`, 2D camera and native camera/xyz planes; WebGL2 perspective and bounded ambient/point/spot flat lighting. Read camera, depth and lighting sections of the guide/reference.                                                                                                                                            |
| Video, numbered PNG sequences and timeline audio mixed with native artwork | Native `video`, `sequence` and `audio` layers; [media guide](../../docs/composition-media.md). Preparation verifies source bytes, timing/color metadata and decoded cache/memory bounds.                                                                                                                                                     |
| Bend or squash a still asset, or make a hand follow a prop                 | Native `distort.mesh-warp` and `distort.puppet`, pins, starch and overlap regions; [puppet acting](../../docs/story-acting.md#native-composition-puppet-acting) and `examples/composition/12-puppet-acting/`. Story pose libraries/actions remain a separate route for supplied alternate artwork.                                           |
| Color correction, light/blur/warps, transitions or custom visual kernels   | Native effect stack and versioned host registration; [effect/plugin guide](../../docs/composition-effect-plugins.md). Check backend support and effect-input scopes.                                                                                                                                                                         |
| Inspect, edit and check a clip                                             | Composition Lab inspector, spatial/graph/key overlays, draft edits/save, CLI watch preview, validate, lint, normalize, export-json and bake; guide/reference. Lint validity and motion findings are distinct.                                                                                                                                |
| Transparent or intermediate delivery, caching and faster exports           | Composition output profiles, lossless capture, static-surface cache and one–four workers; guide and `packages/execution-runtime/src/composition-output.ts`.                                                                                                                                                                                  |
| A camera-led illustration or existing illustrated scene                    | Cinematic recipes / legacy adapters and `animate-scene`; guide cinematic section and fixtures. Adapt family JSON with `comp export-json --scene` when native composition inspection is useful.                                                                                                                                               |
| Comparisons, relationships, evidence or narrated beats                     | Story recipes, supplied pose/actions, cue/event-linked passages and portable workspaces; [story tooling](../../docs/story-engine-tooling.md), [acting](../../docs/story-acting.md) and [narration timing](../../docs/narration-timing.md). Native compositions can supply passage picture beats.                                             |
| Product heroes, callouts, ads, studio effects or reusable diagrams         | Commerce capabilities/treatments, commerce component gallery and shared reusable gallery; [commerce guide](../../docs/ecommerce-motion-implementation.md) and [reusable components](../../docs/reusable-components.md).                                                                                                                      |
| Cue-linked sounds or narration imported with word/SRT timing               | Passage audio and `passage import-narration`; [linked audio](../../docs/passage-audio.md) and narration timing. Optional `sfx generate` creates a saved ElevenLabs take only on explicit generation.                                                                                                                                         |
| A saved mix with tracks, buses, ducking, fades, automation and waveforms   | Opt-in `soundtrack-project-1`, CLI edit/render/retime/package/from-passage and Lab Soundtrack layers; [soundtrack guide](../../docs/soundtrack-project.md). Requires the separate audio runtime; passages can attach the rendered mix.                                                                                                       |
| Portrait delivery and portable source sharing                              | Format-aware scenes/safe areas, JSON and source ZIPs, passage packaging and soundtrack relocation; guide vertical/output/sharing sections.                                                                                                                                                                                                   |

For a custom visual clip, prefer native compositions. Story/commerce
recipes compile to the same composition vocabulary; the illustrated legacy
formats remain supported through adapters. Do not present every recipe, gallery
demo or future schema field as an interchangeable preset.

## Verify precise claims

The guide is the discovery map. For exact flags, schema fields, enum names,
renderability or conflicting documentation, read the relevant current source:

| Question                                                      | Sources relative to the selected source root                                                                                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands, flags, presets and public imports                   | `tools/still-shift-cli/src/cli.ts`, `tools/still-shift-cli/src/composition/commands.ts`, `packages/scene-contract/src/contracts.ts`; installed `package.json` exports/README or checkout `package.json` scripts            |
| Native contracts, property paths and builder operations       | `packages/scene-contract/src/composition/`, `packages/motion-builder/src/`, generated `docs/composition-reference.md`; use semantic validation as well as JSON Schema                                                      |
| Native renderability, backend limits and graph behavior       | `packages/renderer-core/src/composition/`, `packages/animation-engine/src/composition-render.ts`, `docs/composition-reference-notes.md`                                                                                    |
| Media/depth preparation and caching                           | `packages/animation-engine/src/composition-media.ts`, `composition-depth.ts` in the same directory, `services/depth-worker/README.md`, `docs/v0.5-safety-fallback.md`                                                      |
| Effects and mesh/puppet controls                              | `packages/scene-contract/src/composition/effects.ts`, `mesh-effects.ts` in the same directory; current native registry and renderer under `packages/renderer-core/src/composition/`                                        |
| Export profiles, worker/cache controls and output diagnostics | `packages/execution-runtime/src/composition-output.ts`, `packages/animation-engine/src/composition-render.ts`, composition command parser                                                                                  |
| Cinematic, story and legacy recipes                           | `packages/scene-contract/src/cinematic.ts`, `story.ts` and `story-motion.ts` in the same directory, their fixture catalogs and corresponding adapter source                                                                |
| Passage/narration/audio and packages                          | `scripts/prepare-story-passage.ts`, `scripts/package-story-workspace.ts`, `packages/animation-engine/src/story-passage-io.ts`, `tools/still-shift-cli/src/cli.ts`, `docs/passage-audio.md`                                 |
| Saved soundtracks and setup                                   | `packages/scene-contract/src/soundtrack-project.ts`, `tools/still-shift-cli/src/soundtrack-cli.ts`, `docs/soundtrack-project.md`; installed setup CLI/README for runtime paths                                             |
| Commerce renderability/components and shared examples         | `catalogs/ecommerce-motion/capabilities.json`, `packages/scene-contract/src/commerce.ts`, `commerce-components.ts`, `commerce-effects.ts`, `commerce-spatial-demos.ts`, `reusable-component-demo.ts` in the same directory |
| Actual inspector/gallery controls                             | Corresponding `apps/lab/*.html` and `apps/lab/src/*.ts`; CLI preview implementation in `tools/still-shift-cli/src/composition/preview.ts`                                                                                  |
| Install, verification status and planned work                 | Installed README / checkout `toolchain.json`, `README.md`, `docs/verification.md`, `docs/npm-release-results.json`, `ROADMAP.md` and current milestone tracker                                                             |

Read only the sources relevant to the question. Current validators, registries,
command parsers and source-bound completion evidence outrank older milestone
reports when they disagree. Some reports retain staged historical statuses. If a
claim is still uncertain, say what is known and identify the missing evidence.
Repository capabilities usually do not require web research.

## Preserve these distinctions

- `animate --input` accepts a flattened image and its own preset enum. Cinematic,
  illustrated, story and commerce recipes use prepared scene JSON with
  `animate-scene`; they are not extra single-image preset names.
- Image animation is 1080p, 30 fps and 3–8 seconds, with
  `subtle|standard|strong` intensity. Cinematic strength is
  `dramatic|standard|restrained`. Prepared story/commerce frame counts have different
  duration rules; read their contracts instead of applying image limits globally.
- Native composition fps/dimensions are independently bounded. Native media may
  have fractional source rates; visual/audio remap uses source seconds while
  precomp remap uses source frames. Narration's authorized interval must fit its
  visibility window; explicit trim/placement is allowed, time-changing
  stretch/hold/loops/remap is rejected. Read the media contract before
  recommending timing edits.
- Native audio descriptors pin the source file hash, actual decoded 48 kHz
  `sampleCount` and one or two source channels. Derive those from real bytes;
  duration estimates are insufficient. Current `motion/node` helpers are
  `imageAsset` and `fontAsset`; do not invent an `audioAsset` helper. A voice WAV
  alone supplies no word timings: use supplied alignment/SRT or authored timing.
- The imported commerce catalog is larger than implemented support. Check the
  capability registry before claiming a selection renders or is Production.
  Native xyz planes provide 2.5D artwork, not solid geometry or new product views.
  WebGL2 provides true perspective/flat lighting; Canvas camera support is affine.
  Bounded flat lighting does not infer photo geometry or provide production cast
  shadows. Three.js interoperability, solid native 3D and MS0–MS3 mechanism work
  remain planned; isolated cast-shadow preparation does not prove production
  integration. Verify the current tracker before claiming a follow-up delivered.
- Shared gallery controls demonstrate reusable components; they do not provide a
  general scene graph editor. New custom compositions use authored data or APIs.
- Cutouts, illustration layers, alternate states, copy and narration are supplied
  inputs. Rendering does not generate missing art, remove backgrounds, synthesize
  speech or fact-check evidence metadata.
- Fonts and media are pinned to real bytes; preserve their source/checksum and
  relative-path bindings. Puppet pins deform a supplied silhouette, not an
  automatically rigged character; keep rest/target counts stable and respect
  mesh budgets/flip diagnostics. Versioned effect callbacks must be registered
  in every rendering host; JSON alone does not carry executable plugins.
- Passage **Save workspace** preserves local editing JSON, not embedded media.
  `story:package` creates a portable input directory. Rendering a narrated package
  still requires explicitly selecting its packaged narration.
- Batch accepts image requests, not prepared scenes. Exit 0 means all items were
  processed; inspect item statuses for success. Passage resume requires the same
  request; changed edits use fresh output directories and may reuse cached beats.
- Output profiles are `h264`, `hevc10`, `prores422hq`, `prores4444`, `vp9alpha`,
  `png8` and `png16`; alpha is available only in the appropriate profiles. Higher
  output bit depth does not turn RGBA8 source rendering into HDR. Workers/cache
  preserve deterministic results within a backend; cross-backend parity and
  deferred CE6-P performance acceptance are separate claims.
- Saved soundtracks require explicit optional runtime setup:
  `npx still-shift setup soundtrack` for npm, `pnpm soundtrack:setup` for a checkout. Native
  composition audio and existing passage audio do not require that backend.
  Software checks do not establish human visual/listening acceptance. ElevenLabs
  generation consumes credits, requires an explicit request and is never retried
  automatically; saved audio preview/export does not call the provider.
- Preview changes are not automatically persisted to a fixture. Use the screen's
  documented save/export route. `*:prepare` demo generators can rewrite fixtures
  and should not be suggested as ordinary startup commands.
