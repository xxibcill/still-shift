# E-commerce motion library adoption plan

**Updated:** 2026-09-26
**Milestone:** v0.14 · **Status:** implemented with technical fixtures; real-product proof pending
**Source:** `Ecommerce_Motion_Library_Pack`, catalog v1.0, checked date 2026-09-24
**Related work:** [product direction](product-positioning.md), [Story Motion implementation](story-motion-implementation.md), [project roadmap](../ROADMAP.md)

## Intended result

Add a commerce collection to Still Shift that lets an operator choose a format, supply product assets and approved copy, preview the result, and export a deterministic MP4 with its prepared scene and provenance. The same text, layout and motion machinery should also support the project's faceless-video direction.

Import all 40 formats as reference content. The first executable release covers **H03 Hand Hero + Kinetic Headline**, **H01 Hand Cutout Reveal**, **H04 Hand + Benefit Callouts**, and their **A01** ten-second sequence. Other catalog entries retain an explicit reference-only status until their complete behavior and asset requirements are implemented and exercised.

Begin with one eight-second H03 preview at 1920×1080 / 30 fps. Expand to H01/H04 and the ten-second A01 sequence, then add portrait and square layouts and the operator workflow. An eight-second proof is a convenient first deliverable; it is not a new duration limit.

The user authorized implementation in a new worktree from the current branch. M0–M4 are implemented there; [implementation evidence](ecommerce-motion-implementation.md) records coverage, verification and M5 follow-up. Real-product creative proof remains outstanding because no product photograph or approved campaign copy was supplied.

## Source assessment

The five supplied files contain 40 formats in six categories, 12 techniques, eight storyboard recipes and 16 external references. Twenty-six formats can begin with one product image, with additional preparation, graphics or factual copy depending on the format. The HTML embeds the same JSON; catalog IDs and cross references are consistent. The workbook adds an 18-field brief template.

The HTML animations are schematic CSS demonstrations. Product images, finished videos, editable video projects, fonts and music are absent. Format names and durations are working suggestions. Preserve those qualifications when importing the content. The pack's usage instructions are documentation being evaluated, not additional user instructions.

Use the JSON as the imported source of truth. Preserve the source README and record hashes of all five supplied files. Keep the original HTML and workbook available as briefing aids; render production clips through Still Shift's frame evaluator. External references remain study links. Their live content and reuse terms have not been independently rechecked during this adoption assessment, and the pack includes no explicit pack-level license file.

## Current implementation and reuse

The implementation has advanced since the initial folder assessment. The eight-second restriction still applies to legacy illustrated and cinematic inputs; the new story route already supports integer frame counts, timed events, conflict detection and longer exports.

| Existing module                                                                                                                                   | Reuse and required change                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Prepared nodes and graph validation](../packages/scene-contract/src/prepared.ts)                                                                 | Reuse image, text, rectangle, path and group semantics, asset hashes and parent validation. Add commerce-specific fields through an additive schema.                                                                         |
| [Story contract](../packages/scene-contract/src/story.ts)                                                                                         | Follow its authoritative frame count and event-window convention. Commerce has its own recipe roles and validation.                                                                                                          |
| [Story compiler](../packages/renderer-core/src/story-scene.ts)                                                                                    | Extract the internal track collector when commerce becomes its second consumer. Preserve sorting, initial values, holds, discrete changes and conflict rejection.                                                            |
| [Prepared evaluator](../packages/renderer-core/src/prepared-scene.ts)                                                                             | Add commerce dispatch and evaluate any frame without depending on playback history. Preserve the legacy millisecond tracks and newer frame tracks explicitly.                                                                |
| [Canvas renderer](../packages/renderer-core/src/illustrated-renderer.ts)                                                                          | Reuse image/group/path drawing. Extend text layout and required clipping behavior. Reuse the pinned-font loader added by Story Motion; extend single-line drawing with measured multiline text.                              |
| [Prepared engine](../packages/animation-engine/src/prepared-animation-engine.ts) and [export worker](../tools/export-worker/src/export-worker.ts) | Extend the scene/result union, versioned manifest and frame-authoritative export handling. Reuse asset integrity checks and encoded-frame validation. Audit the worker's fixed browser viewport when adding portrait output. |
| [Illustrated lab](../apps/lab/src/illustrated.ts) and [asset routing](../apps/lab/illustrated-api.ts)                                             | Add a Commerce collection and bounded asset routes. Use a small collection registry where the existing collection conditionals need extending.                                                                               |

The first commerce formats use prepared 2D imagery and text. Layered parallax can later reuse the cinematic mathematics, but the current cinematic schema accepts image planes only and cannot directly express an ad with editable overlays.

## Catalog, brief and scene design

Keep three concepts explicit:

1. **Catalog:** the source's creative suggestions, requirements and references.
2. **Brief:** a specific product, selected format or recipe, prepared assets, copy, layout and timing choices.
3. **Scene:** resolved nodes, fonts, asset hashes and integer-frame events consumed by preview and export.

The preparation module exposes one main interface: `buildCommerceScene(brief, preparedAssets)`. It returns a validated `commerce-scene-1` and actionable issues. The module owns layout, role binding, beat timing, text fitting and capability checks so callers do not have to construct node tracks. File loading and hashing happen in the existing preparation path or its commerce adapter; frame evaluation remains pure.

### Catalog import

- Store the source JSON and README under `catalogs/ecommerce-motion/source/v1.0/`, with a `SOURCE.md` recording the supplied location, source version, import date and file hashes. Runtime behavior must not depend on the Downloads folder.
- Validate unique IDs, references and recipe membership. Preserve Thai descriptions, English working names, cautions, reference scope and the source's checked date. An import date must not imply a fresh reference review.
- Keep typed requirements and implementation support in a separate registry. Map every format explicitly to its compiler, required asset roles, copy fields and supported output profiles. A technique ID or `single: true` is insufficient to establish renderability.
- Store duration suggestions as typed ranges alongside the original wording. Treat those ranges as editorial defaults, not platform specifications or mandatory limits.
- Generate any future CSV/viewer exports from the canonical catalog; avoid maintaining independent edited copies.

### Brief fields

| Field group  | Required information                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selection    | Exactly one format ID or recipe ID, catalog version and locale.                                                                                                    |
| Product      | Stable product/SKU identity, source image, optional prepared cutout/mask, protected label region and focal anchors. Keep hand and held product in one rigid group. |
| Copy         | Headline beats, benefits/callouts, CTA and any qualifiers used by the selected format. Preserve supplied wording.                                                  |
| Evidence     | Source and validity information for claims, offers, reviews or conditions that appear in the output. Missing required facts produce a preparation issue.           |
| Appearance   | Theme, bundled font choice, product scale, layout profile and configurable safe insets. Preserve source product colors and label geometry.                         |
| Timing       | Frame rate, frame count and optional beat overrides. Resolve entrance, reading holds and close to exact frames.                                                    |
| Deliverables | Output name and profile; resolved scene and dependency hashes accompany the MP4.                                                                                   |

Use `commerce-brief-1` for inputs and `commerce-scene-1` for prepared rendering. The resolved scene preserves catalog/format/recipe IDs, copy/evidence references and asset/font versions. It also records the actual implemented treatment. Unsupported selections return a clear issue rather than silently substituting a different motion.

Adopt the existing frame convention: zero-indexed frames, half-open scene ranges, explicit transition endpoints and an end sentinel distinct from a rendered frame. Share the event collector with Story Motion while keeping commerce role rules local. Do not reinterpret legacy time units or relax historical recipe validation to accommodate products.

## Delivery milestones

| Milestone                                    | Work and deliverable                                                                                                                                                                                                                      | Completion evidence                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Import and define the first brief**   | Snapshot the JSON/README, validate the catalog and add the explicit capability registry. Create the H03 brief and prepared asset manifest.                                                                                                | All 40 formats, 12 techniques, eight recipes and 16 references reconcile; no dangling IDs; source bytes remain traceable. Reference-only selections cannot accidentally enter the export path.                                                           |
| **M1 — Prove H03**                           | Add the commerce schema, shared event collector and compiler. Add font loading, measured text boxes, line breaks and overflow handling. Render one eight-second 1080p/30 fps image-and-headline sequence through `animate-scene`.         | A readable product hero, timed text and held CTA appear in a 240-frame MP4. Preview/export samples and random/backward seeks agree. The asset and copy survive without distortion or silent truncation.                                                  |
| **M2 — Add H01, H04 and A01**                | Add product-group slide/settle, anchored callout paths, staged labels and a shared close. Compile A01's hook, two-callout body and close into one ten-second scene.                                                                       | Product and hand retain registration; path endpoints remain attached; callouts avoid the label/protected region; 300 frames at 30 fps and 240 frames at 24 fps export correctly. The full sequence contains reading holds rather than only entrances.    |
| **M3 — Add output layouts**                  | Support 1080×1920 and 1080×1080 alongside 1920×1080 for commerce scenes. Resolve product/text positions per profile and configurable safe insets. Audit browser viewport, canvas size, export transport and result metadata together.     | H03 and A01 remain readable in each aspect ratio, at phone viewing size, with exact encoded dimensions/frame counts and no unintended product crop. Existing scene dimensions remain governed by their own contracts.                                    |
| **M4 — Make the workflow usable**            | Add a Commerce collection with catalog search/filtering, source requirements, brief inputs, readiness messages, preview/scrubbing and prepared-scene download. Add a CLI preparation command feeding the existing `animate-scene` export. | A second authorized product and different copy can be supplied through a brief without editing renderer code. Catalog-only formats are visibly distinct from formats ready to render. Saved input reproduces the same resolved scene and sampled frames. |
| **M5 — Record reuse and expand selectively** | Record supported formats/recipes/profiles, asset preparation time, repair effort, export time and defects. Select the next shared technique using actual production demand and the table below.                                           | Deliver a compact implementation note and working examples. Broad catalog import is reported separately from executable coverage.                                                                                                                        |

M0–M4 define the first usable release. M5 establishes the next increment. Technical and visual checks are implementation work; they do not create a separate permission checkpoint for every milestone.

### First H03 proof

Use one authorized product-in-hand photo with enough clear space for copy, one approved headline and one CTA. Preserve the source composition where possible; this format can establish typography without first requiring a product cutout.

Proposed 30 fps schedule: establish the image and introduce the headline during frames 0–44; hold the main composition during 45–149; introduce the close during 150–179; hold the product and CTA during 180–239. These are initial creative timings, adjustable after playback inspection.

For Thai, animate complete phrases or words; do not split combining marks into separate letter animations. Resolve line breaks, check actual glyph bounds and wait for the pinned font to load before rendering any preview/export frame. A long headline should produce an explicit fitting issue or a documented layout change, never an unnoticed crop.

## Technique adoption order

The pack assigns one primary technique to each format. The table identifies reusable mechanics; it does not promise that implementing a technique automatically implements every associated format.

| Technique                  | Catalog formats                   | Adoption decision                                                                                                                                                                                  |
| -------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T05 Kinetic Typography** | H03, B01, B03, O01, O06, S01, S04 | Start with H03 in M1. Reuse text layout and beat sequencing for later formats. S04 additionally needs a factual numeric-counter treatment; ordinary text entrances do not complete it.             |
| **T01 Slide & Settle**     | H01, H08, P05, P07, O03, C01      | Implement H01 in M2. Crop/detail tours, bundles and carousels require their own asset roles and staging. P07 remains deferred until accurate component assets are available.                       |
| **T06 Callout Draw-on**    | H04                               | Implement in M2 using existing path drawing and anchor geometry.                                                                                                                                   |
| **T02 Pop / Overshoot**    | H05, P02, O04, C05                | Next candidate after M4. Add bounded overshoot and a visible settle. Pair H05 with O01 for recipe A02 once real offer fields are bound.                                                            |
| **T11 Card Stack**         | B02, B05, S02, S03, S06, C04      | Follow with reusable card layout and staggered sequencing. Real steps, reviews and policy copy remain per-format inputs.                                                                           |
| **T04 Mask Reveal**        | P03, B06, O02, O05, S05           | Add explicit clipping/reveal geometry after the core layouts. Comparison and price semantics need separate validation. S05 requires genuine comparison images; a reveal effect cannot supply them. |
| **T09 Variant Crossfade**  | H07, C02, C06                     | Add with a multi-image brief: paired opacity tracks, registered images and synchronized SKU/copy. Existing discrete image states alone do not implement a crossfade.                               |
| **T08 Stepped style**      | H06, C03                          | Reuse discrete tracks with authored poses and exact hold frames after card/multi-asset support.                                                                                                    |
| **T12 Hero Float**         | P01                               | Add a bounded product motion and attached shadow with a settled close.                                                                                                                             |
| **T03 2.5D Parallax**      | H02, P06                          | Reuse the cinematic projection when prepared backgrounds/layers exist. Resolve composition with editable text and protected label geometry before marking these formats supported.                 |
| **T07 Light Sweep**        | P04                               | Later masked overlay: requires a suitable surface mask and visual inspection of product material appearance.                                                                                       |
| **T10 Orbiting Graphics**  | B04, P08                          | B04 can use anchored decorative graphics. P08 is a true turntable requirement and stays outside this 2D implementation; the source's orbit demo does not establish 3D support.                     |

All eight recipes enter the reference catalog at M0. Only A01 becomes executable in the first release. A02 follows offer/overshoot support; A03 needs layered parallax plus light sweep; A04 needs detail crop plus typography; A05 needs bundles plus coupon reveal; A06 needs cards plus real review copy; A07 needs actual variants plus grid-to-hero; A08 needs multi-image composition plus registered montage. Each recipe must express its entire timeline before being advertised as exportable.

## Verification and release evidence

Test through the same preparation/compile interface used by the lab and CLI. Focus automated checks on meaningful behavior:

- Catalog version/ID integrity, explicit support mapping, required asset roles, matching hashes/dimensions and missing factual copy.
- Exact event endpoints, holds, overlap conflicts, unsupported-format errors and deterministic seeking at 24/30 fps.
- Product-group registration, callout endpoints and protected label regions throughout the motion.
- Font readiness, Thai glyphs, line wrapping, long-copy overflow and the three output layouts.
- Preview/export frame agreement, encoded dimensions/frame counts and compatibility of story/illustrated/cinematic inputs touched by shared changes.

For each new behavior, render one short example and inspect temporal playback plus frames around transitions. Check legibility at phone viewing size and source fidelity at full size. Run the existing story and illustrated compatibility tests when extracting shared tracks; broaden regression testing when a concrete shared change requires it. A catalog import alone needs data checks, not a full video regression run.

The first release evidence should include the H03 and A01 MP4s, their briefs/prepared scenes/results, a second product exercising the same compiler, profile checks and a supported-format list. Measure preparation and repair effort separately from render speed. Do not infer sales improvement from successful rendering.

## Inputs and limits

The supplied pack contains no production product image or approved campaign copy. A real H03 proof needs those inputs. If they are unavailable at implementation time, an original unbranded fixture can exercise the technical path; label it as a fixture and keep real-product visual proof outstanding. Existing retired corpus images do not become authorized commerce fixtures merely because they are on disk.

For H01/H04, the implementation prepares or consumes a suitable cutout and verifies hand/product registration. The initial workflow uses explicit prepared assets; automatic segmentation, reconstruction of unseen product surfaces, 3D modeling, audio/music assembly, cloud hosting and publishing are separate work. If redistribution of the source pack is later required, establish its reuse terms at that point.

No platform-specific placement rules are asserted by this plan. Safe insets are configurable input; any later promise of platform compliance requires checking that placement's current specifications.

## Planned file ownership

These are the implementation ownership boundaries established by the plan and used by the v0.14 worktree.

| Area                                  | Intended files                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source catalog and capability mapping | `catalogs/ecommerce-motion/source/v1.0/`, `catalogs/ecommerce-motion/capabilities.json`                                                                                        |
| Brief/catalog/scene validation        | `packages/scene-contract/src/commerce-catalog.ts`, `commerce.ts` and existing scene/result unions                                                                              |
| Preparation and motion                | A commerce preparation module in `packages/animation-engine/src/`, `packages/renderer-core/src/commerce-scene.ts`, a shared frame-track module extracted from `story-scene.ts` |
| Text and rendering                    | Extend `illustrated-renderer.ts` with a shared text-layout module; share the same fonts/layout result in preview and export                                                    |
| Fixtures and assets                   | `benchmarks/fixtures/ecommerce-motion/`, `assets/ecommerce-motion/` with explicit provenance                                                                                   |
| Workflow                              | Commerce lab controls/catalog, bounded asset routes and a preparation command in the existing CLI                                                                              |
| Evidence                              | `docs/ecommerce-motion-implementation.md`, focused unit/browser tests and a small output gallery                                                                               |

M0 imported the source and established the brief. M1 extracted shared tracks when commerce became the second consumer. See the implementation note for the completed fixture workflow and remaining real-product proof.
