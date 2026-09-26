# Atomic e-commerce motion: research

Research date: 2026-09-26. Scope: reusable components for deterministic still-image animation. This note informs a plan; it does not authorize new implementation or change the approved palm-up format.

## Conclusion

Use four distinct concepts: **asset**, **visual primitive**, **motion behavior**, and **composition**. Product Float remains a convenient component built from an intact product image plus one motion behavior. A palm-up format is a composition that supplies the hand background, placement, clearance, and output profile.

This taxonomy is our engineering recommendation. The primary sources below support the timing, compositing, fidelity, and rendering principles; they do not prescribe a universal list of e-commerce components.

## Primary-source findings and implications

### 1. Separate timing from property values

**Finding:** W3C Web Animations defines separate timing and animation models. Timing converts an input time into iteration progress; the animation model converts that progress into target property values. Its core timing model is stateless: previous samples do not determine the next sample. It also defines explicit ordered composition operations: replace, add, and accumulate. [W3C Web Animations, model overview](https://www.w3.org/TR/web-animations-1/#model-overview), [stateless timing](https://www.w3.org/TR/web-animations-1/#stateless), [effect composition](https://www.w3.org/TR/web-animations-1/#effect-composition).

**Our recommendation:** Keep the existing exact-frame engine as the only clock. Initially reject overlapping writers to the same node/property over the same interval. Nest explicitly named groups when two independent transforms are intended. A single-writer rule is our simplification, not a W3C requirement. Share a frame-derived progress value for related effects instead of giving each effect a timer.

### 2. Derive animation from the requested frame

**Finding:** Remotion describes animation as changing properties over time, maps frame ranges to values through interpolation, and warns that animation not driven by the current frame can flicker during rendering. [Remotion: Animating properties](https://www.remotion.dev/docs/animating-properties).

**Our recommendation:** Every primitive and behavior must render correctly when seeking directly to any frame, including backwards. Test a few arbitrary frames against sequential evaluation, plus loop boundaries and minimum durations. This is a design precedent; it is not a recommendation to migrate this Canvas renderer to Remotion.

### 3. A Canvas shadow is a 2D image operation

**Finding:** The HTML Canvas standard specifies shadow generation by copying source alpha, offsetting it, applying Gaussian blur, and applying shadow color/alpha. Shadow offset and blur do not follow the current transformation matrix; blur values do not map directly to coordinate-space units. [WHATWG HTML: Canvas shadows](https://html.spec.whatwg.org/multipage/canvas.html#shadows).

**Our recommendation:** A soft ellipse can provide a controlled depth cue on a simple surface. It cannot infer the hand's curved receiving surface, light direction, or occlusion. Do not call it a physically accurate cast shadow. Keep shadow position in composition space; do not attach it to the floating product group. Prove a static shadow in an Experimental neutral-surface fixture first. A shadow on the palm needs visual review and potentially a supplied mask or authored shadow asset. Adding it must not silently change Production v1.0.

### 4. Cache expensive repeated drawing only when useful

**Finding:** Google's Canvas performance guidance recommends pre-rendering repeated expensive drawing to an offscreen surface, keeping that surface tightly bounded, and avoiding repeated expensive shadow blur. This article is historical guidance, not a current benchmark of our browser or renderer. [web.dev: Improving HTML5 Canvas performance](https://web.dev/articles/canvas-performance).

**Our recommendation:** Start with a deterministic procedural shadow and profile its actual cost. Cache by validated visual parameters if blur is expensive. Include blur padding in cached bounds; otherwise the shadow can be clipped. Do not add a cache framework before measuring a concrete issue.

### 5. Preserve the product's distinguishing appearance

**Finding:** Google Merchant Center asks main product images to accurately show the entire product and the correct variant, including distinguishing color, pattern, and material. These are requirements for Merchant Center product-feed images, not general rules for promotional video. [Google Merchant Center: Image link](https://support.google.com/merchants/answer/6324350?hl=en).

**Our recommendation:** The asset contract should retain the approved source, hash, dimensions, and provenance. Render placement may resample pixels, but must preserve source content and aspect ratio. Motion components must not invent packaging, replace labels, split a real SKU into generated parts, or infer unseen sides from a flat image. Approval is a supplied workflow fact; a hash proves file identity, not visual correctness. Feed-image compliance and video composition should remain separate concerns.

### 6. Components do not supply the complete choreography

**Finding:** IBM Carbon distinguishes component microinteractions from the larger choreography that teams must design. It reserves strong expressive motion for meaningful moments and recommends motion that guides attention rather than arbitrary decoration. This guidance concerns interfaces, so applying it to commerce films is an analogy. [IBM Carbon: Motion overview](https://carbondesignsystem.com/elements/motion/overview/).

**Our recommendation:** Give each component a visible job: recognize the product, indicate separation from a surface, reveal a supplied message, or connect a supplied claim to a feature. A float loop communicates suspension or emphasis; it does not independently establish a product benefit or narrative. Story order belongs in a composition with supplied content and deliberate timing. No retention or conversion benefit is established by these sources.

## Candidate component boundaries

The following is our proposed inventory, not a source-derived standard. Reuse existing renderer nodes where they already satisfy the contract.

| Layer       | Small reusable unit     | Responsibility                                | Boundary                                                         |
| ----------- | ----------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Asset       | Approved product source | Source identity, dimensions, provenance       | Does not generate or approve the SKU                             |
| Visual      | Product image           | Intact image and aspect-preserving placement  | No background or movement                                        |
| Visual      | Background              | Static color or supplied image                | No hand-specific behavior                                        |
| Visual      | Soft shadow             | Ellipse, color, opacity, softness, extent     | Art-directed 2D cue; no inferred receiving geometry              |
| Visual      | Text                    | Measured supplied copy with pinned font       | No invented claims or timing                                     |
| Visual      | Anchor and connector    | Attach a supplied label to a supplied point   | The combined feature callout is a composition                    |
| Behavior    | Float                   | Bounded periodic vertical offset              | Existing Product Float composes this with product image          |
| Behavior    | Translate               | Move a group between explicit positions       | May share the existing event engine; avoid duplicate clocks      |
| Behavior    | Fade                    | Change opacity over a bounded interval        | Reusable for text or graphics; optional for product compositions |
| Composition | Sequence and layout     | Layer order, timing, clearances, output frame | The place for narrative order and format restrictions            |

Uniform scaling and 2D rotation already belong to renderer transforms; expose them as public motion components only when a concrete composition needs them. Defer masks, camera moves, generated reflections, simulated lighting, particles, and 3D turns until simpler components have demonstrated a need.

## Suggested implementation order

1. Confirm the common output contract and naming against existing Product Float. Document frame timing, coordinate space, ownership of properties, asset references, and swept bounds without building a second scene graph.
2. Establish independent Product Image and Background composition using existing nodes; preserve Product Float output and the approved palm fixture exactly.
3. Add an optional static Soft Shadow with a neutral-surface fixture. Evaluate visual quality and rendering parity before coupling it to Float.
4. Expose only the missing general behaviors needed by a second real composition, beginning with Translate and Fade. Reuse existing timeline events.
5. Add reusable measured Text and then Anchor/Connector when supplied copy demonstrates the need. Compose these into callouts; do not present a callout as an indivisible atom.
6. Build small Experimental compositions from the same pieces to prove reuse. Apply Production status only to an explicitly approved complete format.

For every increment, the useful exit evidence is one standalone example, one second composition proving reuse, deterministic seeks, input/bounds validation, preview/export parity, and no visual regression in Production v1.0. Test only the new behavior and affected integration; avoid blanket performance or framework work without a measured need.
