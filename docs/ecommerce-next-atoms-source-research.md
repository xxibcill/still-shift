# Next ecommerce atoms: source research

Research date: 2026-09-26. Research only; no runtime changes.

## Recommendation

The next useful foundation is **a named point on an intact product, resolved into canvas coordinates at any frame**. Pair it with visible product bounds. This lets a connector follow the cap, a detail view frame a label, a product keep a consistent visual size when its PNG has padding, and an attachment remain correct through translation, scale, rotation, and parent transforms.

The recommendation and order below are project-specific engineering judgments. The cited documentation establishes the underlying capabilities and distinctions; it does not claim a measured ecommerce conversion benefit.

## What is already present

An audit of the current worktree found substantial support below the commerce helper layer:

- `packages/scene-contract/src/prepared.ts` already defines parent groups, normalized origins, image source crops, contain/cover/stretch fitting, and rectangular group clipping. `packages/renderer-core/src/illustrated-renderer.ts` renders these using nested transforms and Canvas clipping. Basic parenting, pivot, crop, and rectangular clip are **not missing renderer features**.
- `product-layer.ts` preserves the whole asset's aspect ratio and returns its image rectangle. It does not distinguish transparent padding from visible product bounds or expose named product landmarks.
- `commerce-path.ts` creates a static polyline and checks it against one static protected rectangle. It does not resolve an endpoint attached to a moving product point.
- `commerce-text.ts` and `text-layout.ts` already pin fonts, segment English/Thai, wrap text, and reject overflow. They do not automatically choose a bounded font size or lay out several related text roles.
- `commerce-composition.ts` merges fragments into one global timeline and rejects overlapping property tracks. It does not provide local-time clips, automatic sequencing, or a declarative visibility interval. Its fragment type currently includes nodes/assets/fonts/events, but not effects.
- Effects are currently restricted to root targets. Wrapping a product in another group requires deliberate effect integration; blindly adding parenting helpers would break this assumption.

These findings are based on the local source files above, not inferred from external documentation.

## Prioritized additions

| Order | Small component or extension | Concrete use | Scope |
|---|---|---|---|
| 1 | Visible bounds + named anchor + point resolver | Position different SKUs by their actual silhouette; attach to `cap-center`, `label-edge`, or `base-center` | Small geometry/metadata foundation with correct parent matrices |
| 2 | Uniform Scale and Rotate motion helpers | Deliberate push-in or subtle tilt around a named pivot, without stretching the SKU | Reuse existing tracks; helper and validation work |
| 3 | Anchored connector | Keep a benefit label stationary while its line endpoint follows a floating product | Extend Path with dynamic endpoint resolution |
| 4 | Bounded text fitting and placement | Reuse a headline/benefit layout with longer names or Thai copy | Extend existing measured Text Block, not a second text renderer |
| 5 | Local-time clip / sequence helper | Reuse an entrance → hold → detail → exit phrase at another start time | Compile local authoring into the existing global clock |
| 6 | General alpha matte | Allow product/graphics to pass behind an authored foreground or restrict treatment to a supplied material mask | New compositing capability; greater renderer and export burden |
| 7 | Detail viewport | Show a closer view of actual label/cap pixels | Recipe using existing crop/clip plus anchors and layout |

Orders 2–5 can be chosen by the first concrete demo, but should share the foundation from order 1. All new demos remain Experimental. The Production palm-up float keeps its existing constraints.

### 1. Visible bounds, landmarks, and coordinate resolution

Adobe documents rotation/scale around an anchor point and transform inheritance through parenting. Its expression API additionally exposes conversions between layer and composition/world coordinates. A stable attachment point therefore needs both a local definition and a transform into its consumer's space. [Adobe: layer properties](https://helpx.adobe.com/after-effects/desktop/work-with-layers/layer-properties/layer-properties.html), [Adobe: expression language reference](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html).

Project proposal:

- Keep original asset bytes and hash. Store visible alpha bounds and approved landmarks as metadata associated with that hash.
- Author landmarks in source image pixels or an explicitly named normalized source coordinate system. Do not silently treat the full PNG rectangle as the visible bottle.
- Distinguish `visibleBounds`, `sourceBounds`, `protectedRegions`, and `anchors`; a label exclusion region is not a pivot.
- Resolve a point at an arbitrary fractional frame through image crop/fit, node origin, evaluated motion/effects, and all parent matrices.
- Prefer reviewed authored points for semantic features; alpha scanning can find an extent but cannot reliably identify a label, cap, or contact point.

Suggested acceptance: replacing only transparent padding leaves the product's displayed size and base alignment unchanged; transformed landmark matches the rendered feature through nested groups and backward/subframe seeks.

### 2. Scale and Rotate helpers

Professional layer animation uses explicit pivots; changing a pivot changes the path of a scale or rotation. [Adobe: layer properties](https://helpx.adobe.com/after-effects/desktop/work-with-layers/layer-properties/layer-properties.html).

Project proposal: expose uniform scaling as one authoring operation that emits matched `scaleX`/`scaleY` tracks, and expose rotation with an explicit pivot. Reuse the existing event validation. These are reusable authoring atoms over implemented renderer channels, not a new renderer. A small rotation of a flat cutout is not a new 3D view. Product perspective and silhouette must not be reconstructed.

### 3. Anchored connector

Adobe's coordinate-space conversion methods establish the mechanism for converting a point attached to one layer into another coordinate system. [Adobe: expression language reference](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html).

Project proposal: a line whose start or end is `{target, anchor, offset}`; the opposite end may be a static label anchor. Start with one straight segment or one authored elbow. Reuse Path Draw and Text Block. Recheck the resulting segment against transformed protected product regions at render time or during bounded preparation. Do not parent the entire label to the product when only the endpoint should follow it.

This is the strongest first demonstration after the geometry foundation: it gives motion a useful relationship while preserving the whole product image.

### 4. Bounded text fitting

Remotion provides separate primitives for choosing a font size within a width and fitting within a maximum number of lines. Its documentation requires the intended font to be loaded before measurement. [Remotion: fitText](https://www.remotion.dev/docs/layout-utils/fit-text), [Remotion: fitTextOnNLines](https://www.remotion.dev/docs/layout-utils/fit-text-on-n-lines).

Project proposal: add an explicit minimum/maximum font size and use the current loaded-font measurement and locale segmentation to solve a fixed box. Return measured bounds and chosen size. Reject copy that cannot fit at the minimum; do not silently rewrite product claims or endlessly shrink them. Headline, price, disclaimer, and CTA are composed presets with semantic roles, not four new rendering atoms.

Test English/Thai, explicit line breaks, long unbreakable names, and font-loading failures. Do not assume Remotion's library is a drop-in dependency for the Canvas implementation; adopt the separation of measurement and rendering.

### 5. Local-time clip and sequence

Remotion Sequence separates a component's local frame from its starting frame in the composition, limits its visible duration, and supports nested offsets. Series arranges sequences successively. [Remotion: Sequence](https://www.remotion.dev/docs/sequence), [Remotion: Series](https://www.remotion.dev/docs/series).

Project proposal: introduce a small authoring layer with `start`, `duration`, local events, and visibility; compile to the existing deterministic timeline. Specify interval semantics before implementation. Apply the same offset to effects as well as events. A hold is a time interval, not another motion effect. Resolve boundary behavior for motion-blur exposure so temporal samples do not show a layer before its intended entrance or blend across a hard cut accidentally.

### 6. General alpha matte

Adobe track mattes derive a fill layer's transparency from another layer's alpha or luminance, including inverted modes. This supports partial transparency and different matte motion. [Adobe: Track Mattes and Traveling Mattes](https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html).

Project proposal: begin with an authored static alpha mask in an explicit coordinate space. Treat the matte and affected layer as a render dependency, with cycle rejection and deterministic intermediate surfaces. Support matte reuse before adding luma, invert, animated shapes, or feathering. Existing rectangular group clips and the cap-specific light-sweep mask do not constitute this general API.

Use cases include a foreground edge passing in front of a moving product, product-reflection confinement, or approved local finish treatment. Matte data should be supplied or prepared and reviewed; this component need not invent a product segmentation. A palm matte is unnecessary for the accepted composition while the product remains entirely above the palm.

### 7. Detail viewport is a composition recipe

Canvas `drawImage` accepts a source rectangle and destination rectangle. Its clipping API constrains the drawing region, and saved/restored state isolates clips. [MDN: drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage), [MDN: clip](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip).

The project's equivalent crop and rectangle clip already exist. Build an ergonomic detail viewport using those capabilities and named feature bounds. Keep a separate whole-product hero if needed; explicitly distinguish a detail crop from the whole-product layer. Do not imply that interpolation can recover detail absent from the source resolution. Magnified label inspection should use a sufficiently high-resolution original.

## Avoid atom inflation

- Benefit callout, price lockup, end card, feature comparison, and detail card are compositions of geometry, text, path, and timing.
- Camera zoom over this 2D setup is a grouped uniform scale/translation recipe; a separate virtual camera system is not necessary yet.
- More blur/glow/particle variants add little foundation after the implemented effects set.
- Spring physics, product spins, decomposition, and generative SKU variants are lower priority for the accepted direction.
- Responsive format presets should consume shared bounds/anchors and explicit layout constraints; one fixed PNG rectangle should not drive all size decisions.

## Suggested next proof

Create one Experimental fixture: an intact product floats, a stationary two-line benefit label sits beside it, and a line endpoint remains attached to an authored cap landmark. Reuse the existing float and path drawing; introduce only the point resolver and attachment. Verify source hashes, arbitrary frame seeking, nested transforms, label exclusion, and preview/export agreement. Then use the same anchor foundation for a gentle detail push-in and reusable text fitting.
