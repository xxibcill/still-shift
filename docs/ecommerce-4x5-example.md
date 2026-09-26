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

The polished example now switches between all four ready selections. H03 uses the full editorial photograph; H01/H04/A01 use an AI-derived transparent cutout with a studio composition. Changing the selection loads its matching asset, coordinates and layout, while preserving edited headline, CTA, copy source and product name. Moving directly between H04 and A01 preserves edited callouts too. Uploaded user files retain their own asset requirements.

| Selection | Motion                                                        | Preview                                                                 | MP4                                                                     |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| H01       | Hand and product slide in and settle; headline and held close | [Open H01](http://127.0.0.1:4175/commerce.html?fixture=h01-beauty-feed) | [H01 video](../benchmarks/results/ecommerce-motion/h01-beauty-feed.mp4) |
| H04       | Two draw-on callouts identify visible cap and glass details   | [Open H04](http://127.0.0.1:4175/commerce.html?fixture=h04-beauty-feed) | [H04 video](../benchmarks/results/ecommerce-motion/h04-beauty-feed.mp4) |
| A01       | Reveal, staggered callouts and CTA across ten seconds         | [Open A01](http://127.0.0.1:4175/commerce.html?fixture=a01-beauty-feed) | [A01 video](../benchmarks/results/ecommerce-motion/a01-beauty-feed.mp4) |

All are 1080×1350 / 30 fps. H01 and H04 are eight seconds; A01 is ten.
The cutout was made with the built-in image model using the existing generated photograph as an edit reference. [Saved asset](../assets/ecommerce-motion/beauty-cutout-v1.png), [exact prompt](../assets/ecommerce-motion/beauty-cutout-v1.prompt.txt) and [provenance](../assets/ecommerce-motion/beauty-cutout-v1.provenance.json) are retained. This is a visually matched fictional concept, not a guaranteed pixel-identical extraction. The PNG has an actual alpha channel; hand and bottle animate as one rigid image.

The format-switching regression test starts on H03, edits copy, selects H01 → H04 → A01 → H03, checks enabled export and compatible assets, and exports the selected A01. It also verifies callout edits survive the H04-to-A01 switch.
