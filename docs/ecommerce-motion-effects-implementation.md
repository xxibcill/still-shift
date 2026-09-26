# Commerce effects implementation

**Date:** 2026-09-26
**Status:** Implemented as Experimental after the user requested all researched effects.
**Branch:** `codex/ecommerce-motion-library` in the commerce worktree.

## Delivered

The component gallery now contains **27 examples: 12 existing components/compositions and 15 new effect examples**. Use the Browse filter to select Effects. Every effect has an on/off control, strength control and a synchronized baseline comparison. Motion blur exposes shutter angle and sampling; directional blur exposes sampling; grain and particles expose the random seed. Existing product placement, timing, shadow preparation, MP4 export and source ZIP controls remain available.

| Effect example        | Implementation                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion Blur           | Complete-scene temporal exposure with centered subframe samples, finite-shot boundary clamping, Float32 accumulation and a sharp stationary fast path |
| Directional Blur      | Spatial samples along an explicit direction, averaged using premultiplied color and alpha                                                             |
| Overshoot + Settle    | Bounded additive displacement with a decaying oscillation and exact final hold                                                                        |
| Drift + Rock          | Coordinated sinusoidal sideways displacement and rigid in-plane rotation                                                                              |
| Responsive Shadow     | Scale and opacity derived from the product's evaluated height; authored flat studio receiver                                                          |
| Focus Handoff         | Separate root layers move between authored blur radii; the product finishes sharp                                                                     |
| Layered Parallax      | Different root planes follow a shared clock with explicit depth multipliers; no generated product viewpoints                                          |
| Material Highlight    | Soft white sweep restricted to an authored normalized cap region and product alpha; source-atop preserves cutout transparency                         |
| Highlight Bloom       | Luminance threshold isolates bright source pixels; a blurred screen composite spreads those highlights                                                |
| Echo Trail            | Fading historical poses behind the current product; redundant stationary copies are omitted                                                           |
| Film Grain            | Seeded monochrome grain evaluated directly from frame index                                                                                           |
| Atmosphere            | Seeded particles with periodic paths and smooth opacity at wrap boundaries, behind the product                                                        |
| Moving Studio Light   | Broad animated radial light field behind scene objects                                                                                                |
| Background Distortion | Sinusoidal scanline displacement of background graphics; image and text descendants are rejected                                                      |
| Composed Studio       | Float + responsive shadow + drift + background light                                                                                                  |

FX-01 through FX-05 from the research plan are implemented, together with the remainder of the researched inventory. Each individual example remains independently usable. The composed studio provides one restrained combination; it does not enable every effect simultaneously.

## Contracts and architecture

- `packages/scene-contract/src/commerce-effects.ts` defines the discriminated effect union, bounded controls and example catalog. `CommerceScene.effects` is optional, so scenes without effects retain their existing representation.
- Targeted effects operate on root nodes. Motion effects add explicit offsets to evaluated state. Height-linked shadows require an independent root source; cyclic shadow dependencies and duplicate effect/target pairs are rejected.
- Effect windows use the scene's frame clock. `evaluatePreparedNodeAtTime` supports internal continuous commerce sampling; public preview/render APIs still require integer frame indices.
- `commerce-effect-motion.ts` owns deterministic phase, exposure times, seeded randomness and transform relationships. `commerce-effects-renderer.ts` owns compositing. Both preview and export use the same renderer.
- Motion blur averages complete opaque sample frames in **display sRGB**, preserving foreground occlusion and avoiding repeated source-over alpha loss. It is not a physically linear-light camera simulation.
- Directional blur normalizes premultiplied RGBA samples before compositing. Full-canvas buffers allow effects outside the original node bounds; final output-canvas clipping remains intentional.
- Root image effects compose in declaration order. Temporal exposure wraps the resulting scene. Background light/particles render behind roots and grain renders last.
- Source ZIPs contain scene effect parameters, authored material region, seeds, original product bytes, fonts/license and prepared shadow data. The compiled renderer version is `commerce-canvas-0.15.0`.
- Validation rejects effects on registered Production scenes. Palm-up Product Float v1.0 retains its existing assets, nodes and events.

## Verification

Commands:

```sh
pnpm commerce:components:prepare
pnpm exec vitest run tests/unit/commerce-effects.test.ts tests/unit/commerce-components.test.ts tests/unit/commerce-regression.test.ts tests/unit/commerce-shadow.test.ts tests/unit/product-float.test.ts tests/unit/commerce-scenes.test.ts tests/unit/commerce-catalog.test.ts tests/unit/prepared-scenes.test.ts
pnpm test:browser:commerce-effects
pnpm test:browser:commerce --profile beauty-feed
pnpm exec tsc --noEmit
```

- **63 focused unit tests:** effect bounds and editable extremes, invalid/duplicate targets, Production rejection, independent shadow sources, exposure boundaries, fractional internal sampling, deterministic drift and seed behavior; existing component, scene and catalog regressions.
- **15 browser examples:** visible baseline difference, disabled-effect equality, backward/random seeking, 24 fps four-second source bundles with verified hashes, 15 MP4 exports and **75 preview/export frame comparisons**.
- Independent synthetic pixel references cover stationary translucent color/opacity, exposure with a foreground occluder, directional-blur interior alpha/color, highlight mask containment and blur outside current object bounds. The first four checks passed with errors of 0, 0, 1 and 0 eight-bit channel levels respectively.
- **Four existing 4:5 formats:** 24 additional preview/export comparisons plus source bundle, upload/export and responsive checks passed.
- Desktop/mobile gallery screenshots and per-effect posters were rendered. Still inspection covers composition and containment; the automated evidence establishes deterministic sampled frames, not human creative acceptance.

Evidence is generated under `benchmarks/results/ecommerce-motion/effects/`: `verification.json`, 15 PNGs and MP4s, and desktop/mobile gallery captures. Prepared scenes and editable settings live under `benchmarks/fixtures/ecommerce-motion/atoms/`.

## Practical limits

- High sample counts increase live-preview cost. Controls expose this tradeoff; MP4 exports still render every frame. The correctness implementation uses full-canvas CPU accumulation and does not promise real-time playback for expensive combinations.
- Temporal samples clamp to the shot boundaries. Seamless exposure wrapping across a loop or a cut is not exposed; Float's ordinary loop behavior remains unchanged.
- Parallax is layered 2D motion. Focus uses authored blur radii. Studio light changes the background; it does not relight the photographed bottle.
- The cap mask is authored for the fictional SAMPLE 01 cutout. A different product needs its own material region. Dynamic shadows on hands or curved receivers still require an appropriate authored mask/geometry.
- Grain and bloom can change rendered color/readability even though source bytes stay unchanged. The effects remain Experimental and require visual judgment for a real SKU.

See the [research](ecommerce-motion-effects-research.md), [motion blur technical note](ecommerce-motion-blur-research.md) and [atomic component plan](ecommerce-atomic-components-plan.md).
