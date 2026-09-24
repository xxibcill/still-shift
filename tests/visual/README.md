# Visual regression tests

The five original SVG source/depth pairs in `golden-scenes.ts` cover portrait,
environment, architecture, illustration, and difficult edges. They were created for
this repository and are dedicated to the public domain under CC0 1.0. They test
rendering semantics and regression detection; they are not evidence that the engine
works on real explainer images.

`pnpm test:golden` loads each pair in the browser lab, captures frames 0, 75, and
149 at 1920×1080, exports the same resolved scene through the PNG and JPEG pipes,
and compares decoded RGB samples at 64×36. It also compares the preview against
`golden-baseline.json`. Motion checks compare the direction and amount of change
across frames 0–75 and 75–149 against the saved preview and both export pipes,
so a frozen clip fails even when individual frames remain within color tolerance.
The baseline records browser, GPU, renderer, and FFmpeg
versions. To deliberately refresh the baseline after inspecting a renderer change,
run `pnpm exec tsx tests/browser/golden-parity.ts --write-baseline` and review the
diff.
