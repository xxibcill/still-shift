---
name: ask-still-shift
description: Explain Still Shift's available animation, storytelling, commerce and reusable-component features, recommend a workflow for the user's inputs, and show where and how to use it. Use for feature discovery, capability questions, preset selection, Lab navigation, export and sharing guidance in the Still Shift project.
---

# Ask Still Shift

Help the user choose and use implemented Still Shift features. Ground answers in
the checkout's user guide and actual implementation, with a practical next step.

## Locate the project

This skill ships in `skills/ask-still-shift` inside the Still Shift repository.
Resolve the skill directory's real filesystem path if it is installed via symlink;
the repository root is two levels above that directory. If the current workspace
is another Still Shift checkout, prefer that workspace's guide and sources.
Confirm the root using `package.json` (`name: "still-shift"`) and
`tools/still-shift-cli/src/cli.ts`.

Read [the user guide](../../docs/user-guide.md) from the selected repository.
If only a copied skill is available, locate a Still Shift checkout in the current
workspace or ask for its path. Do not present remembered features as verified
current support when the repository is unavailable.

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
  Give a Lab URL only with the instruction to run `pnpm lab` if needed.
- If the user requests execution, continue within that scope using verified inputs
  and fresh output paths. A question about capabilities alone does not require
  starting a server, rendering media, regenerating fixtures or editing the project.

An ordinary answer should make clear: **what to use, what to supply, how to start,
and the relevant limit**. Scale detail to the request rather than forcing a fixed
response template.

## Verify precise claims

The guide is the discovery map. For exact flags, schema fields, enum names,
renderability or conflicting documentation, read the relevant current source:

| Question                                       | Sources relative to the repository root                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Commands, presets and single-image constraints | `tools/still-shift-cli/src/cli.ts`, `packages/scene-contract/src/contracts.ts`, `package.json`                                       |
| Depth preparation and fallback                 | `services/depth-worker/README.md`, `docs/v0.5-safety-fallback.md`                                                                    |
| Cinematic variations and preview options       | `benchmarks/fixtures/cinematic-illustrated/catalog.json`, `scripts/preview-cinematic.ts`, `packages/scene-contract/src/cinematic.ts` |
| Story recipes and older illustrated scenes     | `docs/story-motion-implementation.md`, `docs/history-offstage-motion-implementation.md`, their linked fixtures                       |
| Passage editing, rendering and packages        | `docs/story-engine-tooling.md`, `scripts/prepare-story-passage.ts`, `scripts/package-story-workspace.ts`, `apps/lab/passage.html`    |
| Commerce renderability and profiles            | `catalogs/ecommerce-motion/capabilities.json`, `packages/scene-contract/src/commerce.ts`, `docs/ecommerce-motion-implementation.md`  |
| Commerce components/effects/spatial examples   | `packages/scene-contract/src/commerce-components.ts`, `commerce-effects.ts`, `commerce-spatial-demos.ts` in the same directory       |
| Shared examples and authoring                  | `packages/scene-contract/src/reusable-component-demo.ts`, `docs/reusable-components.md`, `packages/renderer-core/src/index.ts`       |
| Actual UI controls                             | The corresponding `apps/lab/*.html` and `apps/lab/src/*.ts`                                                                          |
| Toolchain/install                              | `toolchain.json`, `README.md`                                                                                                        |

Read only the sources relevant to the question. Current validators, registries and
command parsers outrank older implementation reports when they disagree. If a
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
- The imported commerce catalog is larger than implemented support. Check the
  capability registry before claiming a selection renders or is Production.
  A 2D rotation/parallax example does not imply 3D product views.
- Shared gallery controls demonstrate reusable components; they do not provide a
  general scene graph editor. New custom compositions use authored data or APIs.
- Cutouts, illustration layers, alternate states, copy and narration are supplied
  inputs. Rendering does not generate missing art, remove backgrounds, synthesize
  speech or fact-check evidence metadata.
- Passage **Save workspace** preserves local editing JSON, not embedded media.
  `story:package` creates a portable input directory. Rendering a narrated package
  still requires explicitly selecting its packaged narration.
- Batch accepts image requests, not prepared scenes. Exit 0 means all items were
  processed; inspect item statuses for success. Passage resume requires the same
  request; changed edits use fresh output directories and may reuse cached beats.
- Preview changes are not automatically persisted to a fixture. Use the screen's
  documented save/export route. `*:prepare` demo generators can rewrite fixtures
  and should not be suggested as ordinary startup commands.
