# E-commerce motion implementation

**Updated:** 2026-09-26

**Current status:** Atomic components are available for use. All complete e-commerce motion formats, including Palm-up Product Float v1.0, are Experimental.

**Branch:** codex/ecommerce-motion-library, based on codex/v0.10-evaluation-release.
**Plan:** [Adoption plan](ecommerce-motion-adoption-plan.md).

**Component foundation:** [AC-01–07 implemented and verified](ecommerce-atomic-components-implementation.md); [standing queue](ecommerce-atomic-components-plan.md).

## Format registration

**Palm-up Product Float v1.0 is now Experimental**, scoped to A01 + `floating` + `feed` (1080×1350 / 4:5). The user previously designated it Production, then revised the status while accepting the atomic components for use. Its composition preserves one intact approved product cutout, a stationary palm-up background and camera, a no-contact gap and a gentle vertical hover without copy or additional actions.

The [capability registry](../catalogs/ecommerce-motion/capabilities.json) has no Production registrations and defaults every treatment to Experimental. Entries with no renderer also retain the Reference only indicator; classification does not imply implementation.

The workbench provides Experimental and renderability filters and loads the palm-up example when A01 is selected. The selection badge, prepared scenes, source bundles and fixture catalog carry Experimental status.

## Available now

The Commerce workbench imports 40 formats, 12 techniques, eight recipes and 16 references. The source JSON and README retain their original bytes; the [manifest](../catalogs/ecommerce-motion/source/v1.0/source-manifest.json) records hashes of all five supplied files. Runtime assets live in this repository.

| Selection | Implemented treatment                                   | Inputs                                                 |
| --------- | ------------------------------------------------------- | ------------------------------------------------------ |
| H03       | Product hero, measured headline entrance, held CTA      | One photo or cutout, headline, CTA, image/copy sources |
| H01       | Rigid hand/product slide and settle, headline, held CTA | Prepared cutout plus copy and sources                  |
| H04       | Two staggered draw-on callouts, labels and held CTA     | Cutout, two image targets and sourced callouts         |
| A01       | Slide/settle hook, two-callout body, CTA close          | Complete H01/H04 inputs; default ten seconds           |

All four support landscape 1920×1080, portrait 1080×1920, square 1080×1080 and 4:5 portrait 1080×1350, at 24 or 30 fps. Coverage is **3/40 formats and 1/8 recipes**, across sixteen selection/profile combinations. The other 37 formats and seven recipes are reference only. P08 does not acquire 3D turntable support from a 2D orbit demo.

A01 also supports a `floating` composition: one intact product cutout hovers above a separate, stationary palm-up photograph. It uses no overlay copy and never decomposes the product. See the [basic float and product-consistency contract](ecommerce-4x5-example.md#a01-basic-palm-up-float).

The two bundled hand-and-container illustrations and the generated editorial product photograph are fictional technical fixtures. The [4:5 examples](ecommerce-4x5-example.md) demonstrate the built-in image model with editable ad copy across H03, H01, H04 and A01; format selection loads the matching photograph or cutout. They establish rendering behavior and reuse with different inputs. They do not establish real-product quality or sales results.

## Workbench

Run **pnpm lab** in this checkout and open [Commerce](http://127.0.0.1:4173/commerce.html).

1. Choose an Experimental treatment or filter to renderable entries. Reference-only entries remain unavailable for rendering.
2. Upload a PNG, JPEG or WebP under 20 MB. Add a headline, CTA and sources.
3. Set the output shape, duration and frame rate. Declare whether the image is a photo or prepared transparent cutout.
4. Set the protected label region as fractions of the image: x, y, width, height. H04/A01 also need two callout targets and sources.
5. **Update preview**, scrub or play, then **Export MP4**.
6. **Save source bundle** for the editable brief, prepared scene, exact image/font bytes, font license and reproduction instructions.

Edits disable export until the updated preview is valid. Reference selections cannot export. Oversized copy produces a fitting error. Uploading clears sample copy and sources. Files remain in the browser during preview and go to the local worker for export; its temporary directory is removed afterward. This is a local development tool.

Safe insets are composition margins, not a promise of compliance with every advertising placement. Declaring a cutout does not perform segmentation. Check the asset and protected region before using the result.

## CLI

Start with [the H03 brief](../benchmarks/fixtures/ecommerce-motion/h03-landscape.brief.json) or [the A01 brief](../benchmarks/fixtures/ecommerce-motion/a01-landscape.brief.json). Image paths are relative to the brief.

```bash
pnpm still-shift prepare-commerce \
  --brief benchmarks/fixtures/ecommerce-motion/h03-landscape.brief.json \
  --output /tmp/my-commerce-scene.json

pnpm still-shift animate-scene \
  --scene /tmp/my-commerce-scene.json \
  --output /tmp/my-commerce-ad.mp4
```

Choose new output paths; both commands preserve existing files. Rendering writes an MP4, a .mp4.scene.json manifest and a .mp4.result.json result. Image dimensions and image/font SHA-256 hashes are verified.

Briefs support one to three headline beats and optional integer-frame timing overrides: entranceEnd, bodyStart, closeStart and closeEnd. The workbench edits one headline block and overall duration; use the brief for multiple beats or individual cue overrides. New lines preserve phrase groupings.

**pnpm commerce:prepare** deliberately regenerates the two fixture PNGs and twenty-one known fixture briefs/scenes. This is a fixture maintenance command.

## Architecture

- **Catalog and support:** commerce-catalog.ts validates IDs and links. capabilities.json separates requirements and duration suggestions from implemented support.
- **Preparation:** commerce.ts defines brief, scene and result contracts. buildCommerceScene resolves layout, motion, source bindings and protected-region geometry.
- **Timing:** frame-tracks.ts extracts the existing story track collector for both consumers. Commerce uses integer frames; legacy scenes retain their time units.
- **Typography:** text-layout.ts measures actual loaded-font bounds and wraps English/Thai words with Intl.Segmenter. It preserves combining marks, manual line breaks and text-state layouts. Overflow rejects the preview/export.
- **Fonts:** reuse the pinned-font loader with Noto Sans Thai. Its [source/hash](../assets/ecommerce-motion/fonts/sources.json) and [OFL license](../assets/ecommerce-motion/fonts/OFL.txt) accompany the assets.
- **Rendering:** preview and export share compiled events and Canvas drawing. The export worker derives its viewport from scene dimensions.
- **Local export:** the Commerce API accepts the exact scene/dependency bytes, checks same-origin requests and verifies dependency integrity through the existing engine.

The hand and product share one image inside a rigid group. Callouts appear after the group settles, terminate at source-image coordinates and reject lines crossing the protected label. Layouts reserve separate copy regions and preserve the product asset's proportions and colors.

## Verification and examples

**Final Commerce result: 13/13 fixtures, 78/78 parity samples, 13 backward seeks and all workflow checks passed.** A01 also exported 240 frames at 24 fps through the CLI.

The fixture suite renders all twelve selection/profile combinations plus a Thai H03 with the second product at 24 fps. Six frames per fixture cover entrance, body and close; decoded MP4 samples are compared with preview samples at 96×96. This is a tolerance check for lossy encoding. Backward seeks compare full canvas PNG bytes exactly.

```bash
pnpm build
pnpm exec eslint .
pnpm exec vitest run tests/unit tests/integration
pnpm test:browser:commerce --renders benchmarks/results/ecommerce-motion
pnpm test:browser:story
pnpm test:browser:illustrated
pnpm test:browser:cinematic
```

Commerce checks include 24 fps A01 through both CLI commands, 257 frames at 24 fps, playback/pause, reference-only entries, long-copy rejection, fresh upload, browser MP4 download, ZIP integrity and source reproduction, same-origin enforcement, and a 390 px workbench without horizontal overflow.

Compatibility: **171 unit/integration tests**, **98 story comparisons**, **42 illustrated comparisons** and **31 cinematic comparisons** passed. TypeScript and repository ESLint passed. Python/depth and retired-corpus release gates were not rerun.

Local generated evidence is ignored by Git; regenerate with the command above:

- [H03 landscape MP4](../benchmarks/results/ecommerce-motion/h03-landscape.mp4)
- [A01 landscape MP4](../benchmarks/results/ecommerce-motion/a01-landscape.mp4)
- [A01 portrait MP4](../benchmarks/results/ecommerce-motion/a01-portrait.mp4)
- [H04 square MP4](../benchmarks/results/ecommerce-motion/h04-square.mp4)
- [Thai H03 / second fixture](../benchmarks/results/ecommerce-motion/h03-thai.mp4)
- [Verification JSON](../benchmarks/results/ecommerce-motion/commerce-verification.json)

Workbench screenshots and canvas captures accompany these outputs. Manual frame inspection covered landscape H03, portrait A01, square H04 and Thai H03, including label fidelity and line routing. Automated playback checks establish transport behavior; real-product temporal/creative approval remains outstanding.

## Effort and next increment

The fixture kit and layouts were authored once. One shared safe-inset correction was made during implementation; the thirteen examples needed no per-example image repair. Real-product photography, segmentation, preparation and repair minutes remain unmeasured.

Final local run: **13 clips / 110 seconds of footage**, **59.44 seconds total render wall time**, median **4.42 seconds per clip** (range 3.62–5.42 s), or **1.85× real time** in aggregate. One H03 CLI preparation took **0.48 seconds including Node startup**, with an existing PNG; this excludes image authoring and cutout preparation. Measured on Apple M5 Pro, Node 22.23.1, Chromium 151 and FFmpeg 8.0.1. These are local fixture observations, not production cost estimates. See [metrics JSON](../benchmarks/results/ecommerce-motion/commerce-metrics.json).

The next candidate remains **T02 Pop / Overshoot**, followed by **T11 Card Stack**. First use a real product to measure preparation effort, label fidelity and operator feedback. Add H05/A02 when offer fields and the full sequence are available. Multi-image variants, actual 3D, segmentation and audio remain future work.

## Reusable Product Float component

The palm-up format now composes the reusable [Product Float](product-float.md) component with a stationary background. The component owns the intact product image, aspect-preserving placement and vertical loop. The format owns the canvas, hand clearance and source attribution. Extraction preserves the established scene's product nodes and motion events exactly.
