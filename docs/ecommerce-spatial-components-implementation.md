# Commerce spatial components — AC-08–14

Implemented 2026-09-26 on `codex/ecommerce-motion-library` in the commerce worktree.

## Delivered

All seven tasks in the [next-components plan](ecommerce-next-atomic-components-plan.md) are implemented. Eight new examples bring the gallery to **35 examples**. Every addition remains Experimental; the existing Palm-up Product Float v1.0 Production format retains its source assets, nodes and motion.

| Task  | Delivered API / contract                                                                                                                      | Gallery demo      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| AC-08 | Source-hashed product geometry, authored visible bounds, named landmarks, `resolveProductAnchor`, `resolveProductBounds`, `fitVisibleProduct` | `anchor`          |
| AC-09 | `buildScaleMotion`, `buildRotateMotion`; Product Layer accepts a fixed `pivot`                                                                | `scale`, `rotate` |
| AC-10 | Point attachments to either path endpoint, including canvas-space offsets and transformed protected regions                                   | `attachment`      |
| AC-11 | `buildDetailWindow`, validated crop and explicit maximum source enlargement                                                                   | `detail`          |
| AC-12 | `buildFittedTextPanel`, `stackBoxes`, pinned-font fitting and measured panel height                                                           | `layout`          |
| AC-13 | Root-level alpha mattes from an image or shape, inversion, independent mask motion                                                            | `matte`           |
| AC-14 | `timeWindow`, `sequenceCommerceFragments`, scoped effects and explicit visibility                                                             | `sequence`        |

Open the gallery at `http://127.0.0.1:4175/commerce-components.html?demo=attachment`.

## Geometry and attachments

`packages/scene-contract/src/commerce-spatial.ts` defines optional `geometry`, `attachments`, `mattes`, `visibility`, and `textFits` fields on Commerce Scene. Missing fields leave old scenes unchanged. New spatial fields are rejected on Production scenes.

Geometry references exactly one image state and the matching asset hash. Bounds, landmarks and protected rectangles use original image pixels, including transparent padding. Landmarks are authored data; no semantic detection or generative reconstruction occurs. Geometry is stored in the source scene alongside its asset dependency.

`node-transform.ts` provides the shared affine matrix and crop/fit calculation used by image drawing and coordinate resolution. A point moves through source crop/fit, its node pivot, its evaluated pose (including effect offsets), and every ancestor. Anchor resolution rejects points outside the visible image crop. `resolveProductBounds` returns the transformed corners of the authored source bounds; it is conservative geometry, not segmentation or a pixel-accurate silhouette.

A path's start and/or end can read a named image landmark. Its other points remain authored in path coordinates. The resolver converts through canvas space and back to the path's own space, so the label can remain stationary. Image landmarks cannot depend on path endpoints; attachment feedback cycles are excluded by the contract. Caller-supplied offsets are canvas pixels.

Protected source rectangles become transformed convex polygons. Connector centerlines crossing them fail with a useful error. Preview preparation checks every displayed frame and the exposure samples used by motion blur; arbitrary render calls also check the route. The check covers the authored centerline, not a padded envelope around a thick stroke. Automatic rerouting is intentionally not part of this release.

Uniform Scale emits matched positive scaleX/scaleY tracks. Rotate changes the two-dimensional cutout orientation around a fixed node pivot. The engine's existing conflict and continuity rules still apply. Neither operation creates a new product view.

## Detail, text and layout

Detail Window uses the original asset hash and an explicit source rectangle. Default fitting is contain with at most 1:1 source enlargement; callers can explicitly change `maxUpscale`. The gallery keeps a complete product hero alongside the detail crop.

Text fitting runs once when the renderer is prepared, after checksum-verified fonts load. It selects the largest integer size within the supplied range that fits every supplied text state using the existing English/Thai measurement. The panel follows the tallest measured state. The original scene and exact copy remain unchanged; resolved drawing nodes belong to that renderer instance. This preparation occurs identically in preview and export, using the same pinned font.

`stackBoxes` lays out explicit heights and gaps within a bounded region; it is a small placement utility. The gallery's layout example supports 4:5, square and portrait. It fails when text cannot fit at the minimum size. It does not rewrite copy or silently shrink below that size.

## Matte order and dependencies

Mattes operate on independent root nodes in canvas space. The mask can be any supported root drawing tree, including an image with soft alpha. Mask roots are hidden from ordinary scene painting and may be shared by multiple targets. Target effects render first, then the matte applies through destination-in (or destination-out when inverted). The resulting layer participates in full-scene temporal exposure.

Masks use their raw alpha, transforms, opacity and visibility. Effects on mask roots, matte chains and cyclic dependencies are rejected. A new grouping wrapper is not inserted, preserving the existing root-target effect rule. Mask image bytes are ordinary hashed assets included in the source ZIP. The demo reuses the deterministic soft shadow texture as a mask, with independent motion.

A matte limits visibility; it does not infer a receiving surface, physically conform a shadow to a palm, or relight the product.

## Timing and composition

Fragments now merge effects and spatial metadata as well as nodes, events, assets and fonts. The final Commerce Scene validation checks their references and conflicts. Callers provide unique node IDs; assets/fonts deduplicate only when records agree.

`timeWindow(clock, fragment, start, duration)` shifts local events and timed effect phases. Root visibility is **[start, end)**: start inclusive, end exclusive. Effects gain optional matching active scopes; grain uses local scoped time. Adjacent nonoverlapping scopes may reuse an effect type/target, while overlapping duplicates remain invalid.

`sequenceCommerceFragments` uses an explicit start or the previous segment's end. It rejects timeline overflow and local motion/effects that exceed the segment. Existing initial-value semantics remain intact: visibility hides a layer before its sequence instead of changing event initialization. Parent transforms and local visibility are not overloaded to imply one another.

Motion blur belongs to the complete scene and is added after sequencing. At a visibility/effect-scope boundary, exposure samples clamp to the current segment rather than blend across the cut. Boundaries are therefore explicit cuts. Root visibility also prevents echo trails from leaking beyond a layer's end.

Both source bundles and MP4 exports use `commerce-canvas-0.16.0`. The bundle records geometry, fitting rules, masks, visibility and effects in scene.json and editable gallery settings in demo.json.

## Verification evidence

- **75 focused unit tests** across commerce spatial/components/effects/regression/shadow/catalog/scenes, Product Float and prepared scenes (73 in the combined run, plus two subsequent pivot/effect-anchor tests; the updated 12-test spatial and 5-test Product Float suites passed).
- **Eight new examples:** random/backward seek, source ZIP extraction and SHA-256 checks, 24 fps four-second MP4 exports, **40 preview/export frame comparisons**.
- **Four existing beauty formats:** **24 additional frame comparisons**, source bundle, photo, upload/export and responsive checks passed.
- Independent synthetic pixel checks: 50% content through 50% alpha mask produces channel 64 on black; inverted/outside/hidden mask behavior, independently moving masks, masking after blur, and exact visibility at cuts under 360-degree motion blur all passed. Scoped-off grain equals the untreated pixels.
- English and Thai copy tested in 4:5, square and 9:16. Too-long copy and a connector aimed through the protected label block export with clear errors.
- Existing effect checks passed for stationary color/alpha, foreground occlusion during exposure, directional-blur alpha, cap highlight containment and blur extending beyond object bounds.
- TypeScript and targeted ESLint passed. Desktop/mobile gallery screenshots and product/detail/layout/matte stills were inspected.

Evidence: `benchmarks/results/ecommerce-motion/spatial/verification.json`, eight MP4s/posters, six locale/profile layout images and gallery screenshots. Existing regression evidence remains under its commerce/effects directories. Pixel parity means the existing comparison thresholds passed, not that lossy MP4 pixels are byte-identical.

Commands:

```sh
pnpm commerce:components:prepare
pnpm exec vitest run tests/unit/commerce-spatial.test.ts tests/unit/commerce-effects.test.ts tests/unit/commerce-components.test.ts tests/unit/commerce-regression.test.ts tests/unit/commerce-shadow.test.ts tests/unit/product-float.test.ts tests/unit/commerce-scenes.test.ts tests/unit/commerce-catalog.test.ts tests/unit/prepared-scenes.test.ts
pnpm test:browser:commerce-spatial
pnpm test:browser:commerce --profile beauty-feed
pnpm test:browser:commerce-effects --pixels-only
pnpm exec tsc --noEmit
```

## Practical limits

The first anchor/region data are authored for fictional SAMPLE 01. A real SKU needs matching reviewed landmarks and source resolution. Soft mattes may conceal the product deliberately; these demonstrations are not promoted to Production. Text/route checks establish technical validity, not approval of copy or creative direction. The gallery exposes each component's main controls; it is not a general graph or timeline editor.
