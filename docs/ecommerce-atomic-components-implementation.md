# E-commerce atomic components — release 1

Implemented on 2026-09-26 in `codex/ecommerce-motion-library`.

All seven tasks in the [component plan](ecommerce-atomic-components-plan.md) are implemented. The atomic components are available for use. Gallery examples and complete commerce compositions, including Palm-up Product Float v1.0, are Experimental. The palm-up motion and layout remain a regression baseline.

## Try it

Open [Components](http://127.0.0.1:4175/commerce-components.html?demo=studio), also linked from the Commerce workbench. Choose an isolated visual or motion behavior, or one of three composed examples. Edit the visible controls, update the preview, scrub/play, export MP4, or save the source bundle. Changes disable export until successfully prepared.

The gallery contains 12 examples:

- Visuals: Product Layer, Background, Product Shadow, Panel, Text Block, Path + Draw.
- Motion: Float, Translate, Fade.
- Compositions: Studio Float, Product Introduction, Visible-detail Callout.

The existing [experimental palm-up example](http://127.0.0.1:4175/commerce.html?fixture=a01-beauty-feed) remains available from the gallery header.

## Completion evidence

| Task  | Implemented result                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | Shared composition clock, ordered fragment merge, dependency deduplication, ID/hash conflict rejection, overlapping-track rejection, continuous handoffs, static scenes |
| AC-02 | Product Layer and independent Float behavior; original `buildProductFloat()` convenience function preserved                                                             |
| AC-03 | Static soft shadow with deterministic PNG preparation, independent placement, transparent padding and source-bundle settings                                            |
| AC-04 | Translate and Fade helpers used by existing commerce formats and new compositions                                                                                       |
| AC-05 | Text Block used by existing headlines, labels and CTA; pinned fonts and measured English/Thai layout retained                                                           |
| AC-06 | Path and Path Draw used by existing callouts; protected-region checks also cover diagonal segments                                                                      |
| AC-07 | Gallery, controls, 12 prepared examples, three new composition exports, source-bundle reproduction and regression evidence                                              |

## Modules and interfaces

Renderer interfaces are exported from `packages/renderer-core/src/index.ts`.

| Module                                   | Interface                                                                            | Owns                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `commerce-composition.ts`                | `mergeCommerceFragments(clock, fragments)`                                           | Ordered nodes, shared assets/fonts, valid frame intervals and track continuity |
| `product-layer.ts`                       | `buildProductLayer(options)`                                                         | Intact image group, original aspect ratio, target ID and image bounds          |
| `commerce-motion.ts`                     | `buildFloatMotion`, `buildTranslateMotion`, `buildFadeMotion`, `buildPathDrawMotion` | Events on explicit targets and frame windows                                   |
| `product-shadow.ts`                      | `buildProductShadow(options)`                                                        | Independent shadow placement, opacity and padded bounds                        |
| `commerce-shadow.ts` in animation-engine | `prepareCommerceShadow(settings, path?)`                                             | Canonical PNG bytes, hash, asset record and generator settings                 |
| `commerce-text.ts`                       | `buildTextBlock(options)`                                                            | Supplied copy, pinned font dependency and measured-layout parameters           |
| `commerce-path.ts`                       | `buildPath(options)`                                                                 | Connector geometry and optional protected-region validation                    |
| `commerce-component-demos.ts`            | `buildCommerceComponentDemo(options, assets)`                                        | The Experimental example compositions and 4:5 layout                           |

Backgrounds and panels reuse existing scene color/image/rectangle primitives. No new render node type or animation runtime was introduced.

### Compose a product and motion

```ts
const clock = { fps: 30 as const, frameCount: 240 };
const layer = buildProductLayer({
  id: "hero",
  product: approvedProductAsset,
  x: 240,
  y: 220,
  width: 600,
});
const events = buildFloatMotion(clock, {
  target: layer.target,
  restY: layer.bounds.y,
  travel: 18,
  cycles: 2,
  start: 0,
  end: 239,
});
const fields = mergeCommerceFragments(clock, [layer, { events }]);
```

Pass the merged fields into a validated commerce scene with its canvas, metadata and required pinned font. `buildProductFloat()` still accepts its previous seconds/cycles interface and returns the same nodes and events as before.

Translate specifies each owned axis independently, for example `x: { from: -600, to: 240 }`. Fade and Path Draw take `from`/`to` values in `[0, 1]`. A later segment may supply a `from` matching the preceding endpoint; the merger validates continuity and removes that redundant initializer. Only the first initializer becomes the track-wide value. Callers combining helpers should use the merger rather than concatenate repeated `from` events into a prepared scene.

Float begins at the target's resting `y`; the caller passes the same value as `restY`. It does not reposition an unrelated target or create an invisible entrance. Product bounds include transparent padding. Canvas fit, motion clearance and reading holds belong to the composition.

### Prepared shadow

The generator `ellipse-shadow-1` produces an RGBA image with a soft elliptical alpha field. A small canonical PNG encoder uses stored DEFLATE blocks, so Node and browser preparation do not depend on different image encoders. Default texture size is 256×128; all outside edges are transparent.

The ellipse occupies 80% of each texture dimension. Product Shadow compensates for that padding, so its supplied width/height describe the ellipse. Its returned bounds include the padded image rectangle. Softness/color are baked into the texture; opacity is applied once on the image node. Rendering never regenerates the shadow per frame.

The shadow is an authored flat graphic. It does not infer a photographed surface, conform to a palm or simulate physically accurate light. Height-linked shadow motion remains outside release 1.

## Fixtures and reproduction

Prepared fixtures and their editable demo settings live in `benchmarks/fixtures/ecommerce-motion/atoms/`. The source assets remain the supplied fictional SAMPLE 01 image and pinned Noto Sans Thai font. The shadow PNG and its generator settings are local prepared assets.

```bash
pnpm commerce:components:prepare
pnpm test:browser:commerce-components
pnpm test:browser:commerce --profile beauty-feed --renders benchmarks/results/ecommerce-motion
```

The preparation command regenerates the 12 component fixtures; it does not regenerate the product or modify existing format fixtures.

The source ZIP contains `scene.json`, `demo.json`, exact image/font bytes, font license, and shadow preparation settings when used. Render `scene.json` with the existing `animate-scene` CLI. `demo.json` retains editable gallery settings; importing a bundle into the gallery is not implemented.

## Verification

- 49 focused unit tests passed at implementation time, including exact full-scene equality for all 21 existing commerce fixtures and original Product Float compatibility. The later status change updates fixture registration metadata without changing motion or layout.
- All 12 component previews loaded and reproduced sampled frames after backward seeks.
- Studio Float, Product Introduction and Visible-detail Callout exported with 15 preview/MP4 parity samples passing.
- An edited shadow at 24 fps retained correct asset hashes and generator settings in its source ZIP. Rendering that bundle and exporting through the browser both matched the preview.
- Thai text, text overflow rejection, disabled stale exports and a 390-pixel responsive layout passed.
- The existing four beauty-format exports passed all 24 parity samples, source-bundle, upload/export and responsive checks.
- TypeScript, targeted ESLint and whitespace checks passed. Desktop/mobile gallery screenshots and the three composed posters were visually inspected.

Rendered evidence is under `benchmarks/results/ecommerce-motion/atoms/`, including `verification.json`, posters, gallery screenshots and videos. Existing palm-up comparison evidence remains under `benchmarks/results/ecommerce-motion/`.

## Remaining scope

Release 1 uses fictional engineering assets. Real-SKU creative validation still requires an approved real product source. Moving-target callouts, masks, variant crossfades, card layouts, scale/settle and height-linked shadows remain in the plan's subsequent queue. They were not part of AC-01–07.
