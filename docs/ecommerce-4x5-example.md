# 4:5 editorial product example

Created on 2026-09-26 with the built-in image generation tool, then animated through the Commerce H03 renderer.

The fictional SAMPLE 01 concept uses a generated editorial photograph: translucent glass, a brushed metal cap, warm stone and a natural hand pose. The headline and CTA are editable renderer overlays. The image has no baked-in headline or CTA.

- Output: 1080×1350, exact 4:5, 8 seconds, 30 fps, 240 frames.
- [Video](../benchmarks/results/ecommerce-motion/h03-beauty-feed.mp4)
- [Finished poster](../benchmarks/results/ecommerce-motion/h03-beauty-feed-poster.png)
- [Generated artwork](../assets/ecommerce-motion/beauty-editorial-v1.png)
- [Exact image prompt](../assets/ecommerce-motion/beauty-editorial-v1.prompt.txt)
- [Generation provenance](../assets/ecommerce-motion/beauty-editorial-v1.provenance.json)
- [Editable brief](../benchmarks/fixtures/ecommerce-motion/h03-beauty-feed.brief.json)
- [Prepared scene](../benchmarks/fixtures/ecommerce-motion/h03-beauty-feed.json)

Open [the photo example](http://127.0.0.1:4175/commerce.html?fixture=h03-beauty-feed), or use **Try the photo example · 4:5** in the Commerce workbench. It opens on the finished composition; press Play to see the headline entrance and CTA close.

The new **Portrait · 4:5** output is available for H03, H01, H04 and A01. The **Editorial photo** composition is currently specific to H03 / 4:5 and requires a matching photo with space above the product for copy. The standard layout reserves separate regions for products and callouts.

Verification uses the four standard 4:5 fixtures and this photo example. The browser suite compares six frames per export, checks backward seeking and exercises the new example button. It also retains upload, source-bundle and export checks. Run:

```bash
pnpm test:browser:commerce --profile feed --renders benchmarks/results/ecommerce-motion
```

The generated photo is copied into the project, so previews and exports do not depend on the image tool's output directory. Fixture preparation reuses the saved image and does not invoke image generation again.

Final verification: five 4:5 exports and all 30 preview/export frame comparisons passed, with five exact backward seeks. The example button, source bundle, upload/export flow and mobile layout passed. Ten focused catalog/scene unit tests, TypeScript and ESLint passed. The finished poster was visually inspected for typography, product detail and CTA placement.

## H01, H04 and A01 companion examples

The polished example now switches between all four ready selections. H03 uses the full editorial photograph; H01/H04 use an AI-derived transparent cutout with a studio composition. A01 uses an intact product PNG over a separate palm-up background. Changing the selection loads its matching asset, coordinates and layout, while preserving edited headline, CTA, copy source and product name. A01 has no overlay copy or callouts; its product placement and hand clearance load from its own brief. Uploaded user files retain their own asset requirements.

| Selection | Motion                                                        | Preview                                                                 | MP4                                                                     |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| H01       | Hand and product slide in and settle; headline and held close | [Open H01](http://127.0.0.1:4175/commerce.html?fixture=h01-beauty-feed) | [H01 video](../benchmarks/results/ecommerce-motion/h01-beauty-feed.mp4) |
| H04       | Two draw-on callouts identify visible cap and glass details   | [Open H04](http://127.0.0.1:4175/commerce.html?fixture=h04-beauty-feed) | [H04 video](../benchmarks/results/ecommerce-motion/h04-beauty-feed.mp4) |
| A01       | Intact product hovering above a stationary open palm          | [Open A01](http://127.0.0.1:4175/commerce.html?fixture=a01-beauty-feed) | [A01 video](../benchmarks/results/ecommerce-motion/a01-beauty-feed.mp4) |

All are 1080×1350 / 30 fps. H01 and H04 are eight seconds; A01 is ten.
The cutout was made with the built-in image model using the existing generated photograph as an edit reference. [Saved asset](../assets/ecommerce-motion/beauty-cutout-v1.png), [exact prompt](../assets/ecommerce-motion/beauty-cutout-v1.prompt.txt) and [provenance](../assets/ecommerce-motion/beauty-cutout-v1.provenance.json) are retained. This is a visually matched fictional concept, not a guaranteed pixel-identical extraction. The PNG has an actual alpha channel; hand and bottle animate as one rigid image.

The format-switching regression test starts on H03, edits copy, selects H01 → H04 → A01 → H03, checks enabled export and compatible assets, and exports the selected A01. It also verifies the H04-to-A01 switch loads the floating controls and matching sources.

## A01: basic palm-up float

**Experimental · v1.0.** The user previously registered this floating 4:5 composition as Production, then revised its status. It remains a simple visual baseline; all e-commerce motion formats are Experimental. Its underlying atomic components are available for use.

The current direction is deliberately simple: an open palm faces upward without touching the complete product floating above it. The hand and camera are stationary. The product moves vertically through an 18-pixel range, twice over ten seconds, returning to its initial position for looping. There is no headline, CTA, zoom, rotation, opening action, or product decomposition.

### Product consistency

The renderer consumes the complete product cutout as one image. The cap, label and body stay in that image; the only animated property is the containing group's y position. Preview, MP4 export and source bundles use the same checksummed image bytes. A real SKU must use its supplied approved transparent cutout unchanged. Generating or reconstructing a real product is not part of this workflow.

The bundled SAMPLE 01 product is fictional and was generated for this demonstration. It is not a pixel-identical extraction from the earlier product-in-hand picture. The hand/background was generated independently with no product present.

- [Intact demo product](../assets/ecommerce-motion/beauty-floating-product-v1.png), [exact prompt](../assets/ecommerce-motion/beauty-floating-product-v1.prompt.txt), [provenance](../assets/ecommerce-motion/beauty-floating-product-v1.provenance.json).
- [Open palm background](../assets/ecommerce-motion/beauty-floating-palm-v1.png), [exact prompt](../assets/ecommerce-motion/beauty-floating-palm-v1.prompt.txt), [provenance](../assets/ecommerce-motion/beauty-floating-palm-v1.provenance.json).

Both were created using the built-in image model. For real-product work, generate only the empty palm background and supply the product asset separately.

### Basic controls

Select `Floating above an open palm · 4:5`. Upload the product as the main image and declare it a prepared cutout. The separate palm background has its own upload and source. Product placement is x, y and width as fractions of the canvas. Set the highest hand point as normalized y; the compiler reserves at least 40 pixels between that boundary and the full product image box throughout the hover. The current background uses a conservative boundary at 0.71. Changing the product preserves the independent background, then rechecks fit and clearance. Background framing and all product pixels remain unmodified.

The basic mode uses A01 / feed and requires at least six seconds. It has no copy fields or custom entrance timeline. Existing headline-and-callout layouts retain their original requirements.

### Verification

Twelve focused unit tests include every-frame checks at 24/30 fps for a fixed hand, unchanged product asset, no scale or rotation, a bounded 18-pixel hover, no contact, no overlay text and matching first/last poses. The browser suite checks source-bundle checksums for both images, preview/MP4 parity, backward scrubbing, example switching and export. The final composition is visually inspected for the palm-up pose and clear air gap.

[Basic floating video](../benchmarks/results/ecommerce-motion/a01-beauty-feed.mp4)
