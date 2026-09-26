# Next e-commerce atomic components

Date: 2026-09-26
Status: **AC-08–14 complete.** See [implementation and verification](ecommerce-spatial-components-implementation.md). The original research rationale and acceptance criteria are retained below.

## Recommendation

Build **Product Anchor** next: an authored point on the intact product that can be resolved into canvas coordinates at any frame. Add visible bounds and named landmarks as its preparation data. The first useful composition is a floating product with a connector that stays attached to a selected feature while its text remains still.

This recommendation follows the current repository gaps and the user's requirements. The sources establish technical mechanisms, not evidence of conversion uplift or an objectively optimal backlog.

The earlier [AC-01–07 plan](ecommerce-atomic-components-plan.md) and [effects implementation](ecommerce-motion-effects-implementation.md) are complete. This proposal extends their vocabulary. Atomic components are available for use; all complete demonstrations are Experimental. Palm-up Product Float v1.0 remains a visual baseline with its current image, clear air gap and simple motion.

## What already exists

Inspected the actual implementation before selecting additions:

| Capability                                                                       | Current evidence                                                                                | Actual gap                                                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Intact product, float, translate, fade                                           | `packages/renderer-core/src/product-layer.ts`, `commerce-motion.ts`                             | Reusable scale/rotation helpers and spatial relationships                                     |
| Parent groups, pivots, proportional image fit, source crop, rectangular clipping | `packages/scene-contract/src/prepared.ts`, `packages/renderer-core/src/illustrated-renderer.ts` | Named landmarks and shared coordinate evaluation; these render primitives need no replacement |
| Text measurement, English/Thai wrapping, overflow failure                        | `packages/renderer-core/src/commerce-text.ts`, `text-layout.ts`                                 | Bounded fitting and measured panel/layout composition                                         |
| Connector paths and label protection                                             | `packages/renderer-core/src/commerce-path.ts`                                                   | Endpoints following moving product features; existing protection uses a static rectangle      |
| Global clock, fragments, event conflicts                                         | `packages/renderer-core/src/commerce-composition.ts`                                            | Reusable timing offsets/visibility scopes; fragments currently omit effects                   |
| Fourteen effects                                                                 | `packages/renderer-core/src/commerce-effects-renderer.ts`                                       | General reusable alpha matte; cap highlight has specialized masking                           |

## Primary-source findings

1. Adobe defines layer-to-composition point conversion evaluated at a specified time. This is the relevant model for a connector attached to a moving feature. Our inference is to expose the renderer's own transform calculation through a small shared resolver. [Adobe layer-space transforms](https://helpx.adobe.com/after-effects/using/expression-language-reference.html#layer_space_transforms_methods_expression_reference)
2. Adobe documents scale/rotation around an anchor and transformations inherited through parenting. Our renderer already implements these concepts; we should build validated authoring helpers on top. Our Canvas groups also inherit opacity, so Adobe's precise parenting semantics should not be copied wholesale. [Adobe layer properties](https://helpx.adobe.com/after-effects/desktop/work-with-layers/layer-properties/layer-properties.html)
3. Alpha mattes use another layer's alpha to control visibility; they can be transformed independently. This supports a reusable compositing primitive beyond our rectangular clip. [Adobe track mattes](https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html)
4. Canvas drawing supports source and destination rectangles. A detail window can therefore reference the original product asset. Enlargement filters existing pixels; it does not supply additional photographic detail. [HTML Canvas specification](https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-drawimage)
5. Remotion's text-fitting utilities measure text using the selected font, which must be loaded. We can reuse our pinned-font measurement and add explicit minimum/maximum sizes. [Remotion fitText](https://www.remotion.dev/docs/layout-utils/fit-text)
6. Remotion separates time offsets and visibility duration through Sequence; Series arranges successive segments. These inform an authoring utility compiled to our existing clock, without requiring a renderer migration. [Sequence](https://www.remotion.dev/docs/sequence), [Series](https://www.remotion.dev/docs/series)

Additional source review: [next-atoms research](ecommerce-next-atoms-source-research.md). Its independent utility ranking places text and timing earlier; the delivery queue below brings the detail-window proof forward to demonstrate reuse before the larger matte/timing work. Both agree on the first three additions.

## Implemented queue

The queue distinguishes atomic behaviors from preparation data and composed components. We should not label every reusable advertisement fragment an atom.

| Task      | Deliverable and category                                                                     | Small input/output contract                                                                                                    | Proof and acceptance criteria                                                                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AC-08** | **Product Anchor**, supported by product geometry metadata                                   | Asset hash; authored visible bounds, named source-image points and protected regions; target node + time → canvas point/bounds | A marker stays on the cap through translation, scale, rotation and nested parenting. Account for fit/crop and effect offsets. Random and fractional frame evaluation agree with rendering. Reject invalid landmarks, cycles and incompatible metadata. Source pixels unchanged. |
| **AC-09** | **Scale** and **Rotate**, two motion behaviors                                               | Target, fixed pivot, endpoints, frame interval, easing → ordinary events                                                       | Uniform positive scaling preserves product proportions; rotation is explicitly 2D. Small zoom and tilt around an authored pivot; existing property conflict/continuity checks apply. No new inferred view or deformation.                                                       |
| **AC-10** | **Point Attachment**, a relationship primitive; **Following Callout**, its first composition | Target landmark + follower endpoint + offset; path and existing Text Block                                                     | Endpoint follows a floating product while label remains still. Derive at the same time as motion-blur samples. An authored route must avoid transformed protected regions throughout motion; fail clearly if it cannot. Automatic route planning deferred.                      |
| **AC-11** | **Detail Window**, a composition of existing image crop/clip/transform                       | Original asset + authored source rectangle + destination box + fit policy                                                      | Show an actual cap/label detail beside the complete hero. Same asset hash, no synthesized texture. Validate crop bounds and effective resolution. Start with a fixed rectangle; movement uses existing transforms.                                                              |
| **AC-12** | **Measured Layout**, preparation utility; text/panel compound                                | Exact copy + pinned font + min/max size + available box + padding                                                              | English and Thai examples fit at square, 4:5 and 9:16. Panel follows measured copy; minimum size failures remain explicit. Preserve all copy. Start with a simple stack and box placement, not a constraint solver.                                                             |
| **AC-13** | **Alpha Matte**, compositing primitive                                                       | Content target + authored mask asset/shape + coordinate space + inversion                                                      | Soft-edge matte and independent moving mask render correctly over contrasting backgrounds. Specify pre/post-effect mask order, prevent dependency cycles, hash/bundle mask. Rectangular clipping continues using existing support.                                              |
| **AC-14** | **Time Window / Sequence**, timing utility                                                   | Fragment, start, duration, visibility policy; list of windows → one global scene                                               | Entrance → feature hold → close, with explicit visibility outside each window. Shift motion and effect windows consistently. Preserve delayed-event initial semantics; reject conflicts and timeline overflow. Exact cuts and subframe exposure policy must be defined.         |

Dependencies: AC-08 → AC-09/10/11; AC-12 reuses existing Text Block; AC-13 reuses existing compositing and AC-08 coordinates; AC-14 integrates the completed examples. Execute sequentially for a predictable release, although not every task is a technical prerequisite for the next.

### Product geometry details

Use source-image coordinates as the authoritative space, associated with the source hash. Convert through crop/fit into node space, then through the complete parent transform chain into canvas space. Distinguish an attachment landmark (e.g. cap center) from the pivot used to rotate an object.

Visible bounds should be authored initially, with optional alpha-derived suggestions during preparation. A low-opacity shadow or stray pixel can inflate alpha bounds; they are not semantic segmentation. Preserve the original image and its padding. The existing palm-up clearance calculation must not silently change when new metadata becomes available.

### Integration decisions to resolve during implementation

- Reuse the renderer's exact transform order, including effect offsets, in the anchor resolver. Never maintain a visually approximate second transform model.
- Effects currently require root targets. Avoid silently wrapping an effect target inside a new parent; either preserve root structure or explicitly extend and validate that contract.
- Extend fragment dependency merging to include effects before promising general composition. Keep current duplicate-target and conflicting-property checks.
- Keep connections acyclic. A follower reads a source pose; a source must not depend on its follower.
- Start with alpha masks only. Matte image hashes establish asset identity, not receiver geometry: masking a shadow to a palm still does not make it physically conform to the hand.
- Resolve text/layout during preparation after fonts load. Resolve animation directly from time. Do not use frame-history state or wall-clock callbacks.
- New relation/matte representations require explicit source-bundle and renderer-version support. Preview and export must evaluate the same contract.

## Release demonstrations

1. **Feature annotation:** complete product floats; one line stays attached to an authored cap landmark; supplied feature text remains still. Tests whether motion maintains an informational relationship.
2. **Product detail:** complete hero plus a crop from the same source; gentle scale directs attention to a real visible detail.
3. **Offer card:** supplied title/price/CTA use measured text and panels with entrance, reading hold and close. These are compositions of text, layout and timing, not separate price/CTA render atoms.
4. **Matte proof:** an authored foreground shape occludes a background graphic, then an Experimental product composition demonstrates the same primitive. Do not alter the palm-up baseline scene.

Use technical checks at module boundaries, random seeks and fractional sampling for relations, source-bundle round trips, and representative preview/export frame comparisons. Retain the palm-up visual regression. Visual inspection must assess label readability, useful detail resolution, pointer attachment and clearance; deterministic pixels alone do not establish creative quality.

## Deferred

Defer 3D turntables from one image, product decomposition, mesh deformation, physics collisions and procedural reflections. These need additional approved assets or geometry and do not solve the immediate composition gaps. Also defer audio sequencing and a general timeline editor to a distinct scope.

**Completed milestone:** AC-08 through AC-14, including the 4:5 following callout and all eight new examples. See the implementation note for evidence and explicit limits.
