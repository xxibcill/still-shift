# E-commerce atomic components: research and implementation plan

**Date:** 2026-09-26

**Status:** AC-01–07 complete. See [implementation and verification evidence](ecommerce-atomic-components-implementation.md).

**Working branch:** `codex/ecommerce-motion-library` in the isolated commerce worktree.

**Next task:** Release 1 and the authorized effects expansion are complete. See [effects implementation and verification](ecommerce-motion-effects-implementation.md) for the 15 new examples; real-SKU creative validation and Production promotion remain separate. The [AC-08–14 spatial component queue](ecommerce-next-atomic-components-plan.md) is also complete; see its [implementation evidence](ecommerce-spatial-components-implementation.md).

**Evidence:** [Primary-source research](ecommerce-atomic-motion-research.md), [current implementation](ecommerce-motion-implementation.md), [existing Product Float](product-float.md).

## Objective and scope

Build a small reusable vocabulary for e-commerce motion, with a standing implementation queue. The user should be able to request execution of this plan once, then receive completed increments without having to select the next component each time.

The first release proves three capabilities: show a product clearly, direct attention without changing its identity, and connect supplied information to visible product details. It reuses the existing renderer and preparation/export pipeline. A useful library is demonstrated by recombining a few components into several compositions.

**Palm-up Product Float v1.0** is Experimental, scoped to A01 + floating + feed. Its current image, motion, no-contact gap and absence of copy remain the regression baseline. The atomic components are available for use; every complete commerce composition remains Experimental.

This plan replaces the older adoption plan's suggested expansion order. The imported pack remains reference material; its instructions and working format names do not authorize additional work.

## First-principles model

An atomic component has one visual responsibility, takes explicit inputs, and can be reused without importing a particular advertisement's story or layout. “Atomic” does not require a public function for every coordinate or drawing command.

| Layer            | Meaning                                                  | Examples                                           | Owns                                                      |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Asset            | Immutable source content                                 | Approved product PNG, hand photograph, pinned font | Identity, dimensions, hash, provenance                    |
| Visual component | Something visible with one role                          | Product Layer, Shadow, Text Block, Path            | Placement, appearance, intrinsic bounds                   |
| Motion behavior  | A time-dependent change to an existing target            | Float, Translate, Fade, Path Draw                  | Property values and frame intervals                       |
| Composition      | Arrangement and coordination of components               | Product above palm, product with benefit callout   | Canvas, timeline, layer order, clearance, reading holds   |
| Format           | Reusable composition with input and quality requirements | Palm-up Product Float v1.0                         | Brief validation, supported output profiles, registration |

**Correction to our initial terminology:** Product Float is a useful compound component: Product Layer + Float behavior. Keep `buildProductFloat()` as a compatibility convenience function. Internally separate image construction and movement so the same product can float, slide, or remain still without recreating it.

A still product is a valid state. A hold is an interval with no new changes; it does not need its own rendered component. A CTA or price is a content role applied to Text Block, sometimes with a panel. A callout combines a path, label and anchor rule. Hand/pedestal/table are background assets and composition choices. These distinctions prevent redundant component types.

## Research conclusions and their application

- The W3C Web Animations working draft separates timing from property evaluation and describes stateless timing. We will retain frame-based evaluation and share a composition clock. This is architectural guidance, not a decision to adopt browser animations. [W3C model](https://www.w3.org/TR/web-animations-1/), [stateless timing](https://www.w3.org/TR/web-animations-1/#stateless).
- Multiple effects on one property require explicit composition semantics. Our first release will retain conflict rejection and sequential handoffs rather than introduce implicit blending. [W3C combining effects](https://www.w3.org/TR/web-animations-1/#combining-effects).
- Remotion documents frame-derived animation and warns against time-based CSS animation in its renderer. Our inference is to retain the project's existing exact-frame engine, with the same prepared scene used by preview and export. There is no Remotion migration in this plan. [Animating properties](https://www.remotion.dev/docs/animating-properties).
- A rendered shadow is a graphic unless receiving-surface geometry has also been supplied. A flat ellipse cannot automatically conform to a photographed palm. The first shadow proof therefore uses a neutral flat surface and manual placement. See the Canvas source and limitations in the [research note](ecommerce-atomic-motion-research.md).
- Product truth comes from the approved asset and supplied facts. Motion cannot invent an unseen product side, disassemble an unknown SKU, substantiate a benefit, or create a before/after result. This is also the user's explicit design constraint.

These sources inform the system design. They do not establish an optimal number of components, ad duration, or sales performance. The priorities below are our engineering and creative judgment, informed by the repository and the supplied catalog.

## Repository assessment

| Existing capability                              | Evidence                                                                                           | Adoption decision                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Product Float                                    | `renderer-core/src/product-float.ts`: intact image group, vertical tracks, swept bounds, 24/30 fps | Preserve public interface and prepared output; extract its two responsibilities |
| Image, text, path, rectangle and group nodes     | `scene-contract/src/prepared.ts`; Canvas drawing in `illustrated-renderer.ts`                      | Reuse these primitives; add no new render node in release 1                     |
| Integer-frame events and conflict rejection      | `commerce.ts`, `frame-tracks.ts`, `compileCommerceScene()`                                         | Keep this clock and evaluator; validate composition inputs before export        |
| Product fitting, text entrances and callouts     | Helpers and construction inside `commerce-scene.ts`                                                | Extract only where responsibilities repeat; retain output parity                |
| Font measurement and English/Thai wrapping       | Prepared font loading and `text-layout.ts`                                                         | Reuse pinned fonts, measured bounds and existing overflow failures              |
| Asset hashing, upload, source ZIP and MP4 parity | Commerce preparation, workbench and browser suite                                                  | Extend dependency lists when adding the shadow asset; reuse export              |
| Shadows                                          | No general commerce shadow component or ellipse node                                               | Prepare one deterministic transparent shadow texture and draw it as an image    |
| Registration                                     | Exact production scope plus Experimental default                                                   | Keep format registration separate from component implementation status          |

Paths above are relative to `packages/` unless an application or test is named. Shared modules also serve other collections; commerce changes must preserve their existing contracts.

## Release 1 component inventory

| ID  | Component or behavior | Small interface                                         | Responsibility and limits                                                                 | State                             |
| --- | --------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| V01 | Product Layer         | Approved asset, unique ID, x/y/width                    | One intact image with proportional height; returns image bounds and product target ID     | Implemented                       |
| V02 | Background            | Existing image node + explicit fit, or scene color      | Stationary environment; cropping allowed only when explicitly selected for the background | Already available; reuse directly |
| V03 | Product Shadow        | Center, ellipse width/height, softness, opacity, color  | Separate soft graphic placed on an authored surface; static first                         | Implemented                       |
| V04 | Text Block            | Exact copy, pinned font, measured box, style, locale    | Whole readable text block; fails on overflow; no built-in entrance or claim generation    | Implemented                       |
| V05 | Path                  | Explicit points, stroke style, unique ID                | One connector or emphasis line; no label or automatic story                               | Implemented                       |
| V06 | Panel                 | Existing rectangle node + fill/border/radius            | A backdrop for text or information                                                        | Already available; reuse directly |
| B01 | Float                 | Product target, resting y, travel, frame window, cycles | Repeated vertical motion only                                                             | Independent behavior implemented  |
| B02 | Translate             | Target, x/y endpoints, frame window, easing             | One rigid displacement followed by a hold                                                 | Implemented                       |
| B03 | Fade                  | Target, opacity endpoints, frame window, easing         | Visibility change only                                                                    | Implemented                       |
| B04 | Path Draw             | Path target, reveal endpoints, frame window             | Changes visible path length                                                               | Implemented                       |

Product Float and Slide-and-settle remain convenient combinations of this vocabulary. The inventory is a conceptual model; existing nodes do not need redundant wrappers. New public modules must remove repeated validation or construction logic from actual callers.

### Initial shadow decision

Implement a deterministic prepared RGBA texture with a soft elliptical alpha field. Define softness explicitly in its preparation options; bake it into the texture. Hash and bundle the texture like every other image. Render it through the current image node, with opacity applied once. Position and scale it independently of the product.

This avoids introducing a general blur system or changing shared node schemas for one effect. It costs an extra prepared asset; preparation records generator version, dimensions, color and softness, and includes sufficient transparent margin to prevent clipped edges. Reuse the prepared asset within a render; add persistent caching only if repeated preparation becomes a measured cost. Start with normal alpha compositing. No procedural work runs per playback frame.

Show the first proof on a light, flat background. Do not infer the location or orientation of a palm from the photograph. Conforming shadows on hands or curved surfaces need an authored receiving mask/geometry and belong to a later task.

A height-linked shadow is a later compound treatment, not part of the first static shadow. Its opacity/scale must derive from the same float progress if introduced. Perspective and light geometry determine real shadow behavior, so any mapping must be described as art direction and visually checked.

## Common composition contract

These decisions are implemented; the linked implementation note documents the concrete interfaces.

1. **One composition clock.** The composition supplies `fps` and `frameCount`; core behaviors accept integer `start` and `end` frames with `0 <= start < end < frameCount`. Seconds convert once at the outer interface. Static components own no duration.
2. **One property owner at a time.** Allow Fade + Float on the same product because they write different properties. Reject simultaneous Float + vertical Translate on the same target. Sequential handoffs must share the same endpoint value. An intentional parent/child transform can be introduced explicitly when a real composition needs it.
3. **Initial values are track-wide.** In the current compiler, `event.from` initializes the whole property track, even when that event starts later. The new helpers must not emit a fresh `from` for every segment. Resolve one initial value per property and require later segments to continue from their predecessor. Test delayed entrances and repeated fades.
4. **Stable IDs and dependencies.** Caller-supplied prefixes identify component instances. Composition merges nodes and dependencies, rejects duplicate node IDs and mismatched asset/font identities, and preserves explicit drawing order. Same-ID dependencies may deduplicate only when their records match. No silent renaming or asset substitution.
5. **Use the current scene representation.** The small internal fragment contract carries existing `nodes`, `events`, `assets`, `fonts` and bounds as needed. Resolve it into `CommerceSceneSchema` before preview/export. Avoid a second scene language, plugin framework, component registry or separate animation runtime.
6. **Bounds have a clear space.** Visual bounds are in scene pixels for the first release. A product's image bounds include transparent padding; they are conservative geometry, not segmentation. Swept bounds include the motion range. Composition owns canvas fit, safe margins and object clearance.
7. **Holds and visibility are explicit.** Tracks hold their endpoint outside an event interval. A later-starting motion does not make a layer invisible automatically; an entrance uses an explicit initial opacity or Fade. No hidden wall-clock timers.
8. **Preserve the existing loop.** Product Float currently rounds half-cycle boundaries across frames `0..frameCount-1` and repeats the endpoint pose. Keep this exact behavior in the compatibility wrapper. Do not silently change loop sampling to make the arithmetic cleaner.
9. **Source integrity is separate from rendering.** Keep approved source bytes and hashes unchanged. Proportional display transforms are allowed. Real-world preparation, copy approval and visual cutout quality remain input requirements; a PNG extension or declaration does not prove a valid cutout.

## Ordered implementation queue

Execute tasks in this order once the user requests implementation. Complete the acceptance criteria and evidence for each task before moving on. Status changes belong here, so the next task is always explicit.

| Task      | Deliverable                                                                        | Depends on       | Acceptance criteria                                                                                                                                                                                                                       | Status   |
| --------- | ---------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **AC-01** | Minimal fragment/composition contract and fixture harness                          | Current renderer | Reuse current scene schema; explicit global clock; merge two instances; reject ID/hash conflicts and overlapping property writes; delayed-event initial values and endpoint continuity verified; existing Product Float remains exact     | Complete |
| **AC-02** | Product Layer + independent Float behavior; preserve `buildProductFloat()` wrapper | AC-01            | Same asset and aspect ratio; static layer emits no motion; float targets the existing layer; all existing production nodes/events match; narrow, wide and tall products and 24/30 fps pass                                                | Complete |
| **AC-03** | Static Product Shadow with deterministic prepared asset                            | AC-01–02         | Neutral-surface proof; editable position/size/softness/opacity; no clipped texture edge or product changes; changing geometry does not alter product hash; preview and MP4 agree; ZIP contains the exact texture and preparation settings | Complete |
| **AC-04** | Translate and Fade behaviors extracted from existing formats                       | AC-01–02         | Delayed entrance, hold and fade-out work; motion units are explicit; x-translation + float can coexist; overlapping y writes fail; sequential y handoff is continuous; no hidden opacity behavior                                         | Complete |
| **AC-05** | Reusable Text Block; H03 and CTA consumers adopt it                                | AC-01, AC-04     | Exact supplied copy retained; measured English/Thai text and font dependency handling; overflow produces a useful error; typography can remain static or use Fade/Translate; existing fixture output preserved                            | Complete |
| **AC-06** | Path + Path Draw; existing H04 callout built from Path and Text Block              | AC-04–05         | Supplied path, label and protected-region checks remain; no inferred benefit; settled product target remains aligned; collision rejected; callout to moving product is explicitly deferred                                                | Complete |
| **AC-07** | Finish composition examples, regression checks and documentation                   | AC-02–06         | Isolated component demonstrations plus three composed proofs; palm-up visual regression unchanged; preview/export parity, source-bundle round trip and backward seek pass; queue updated with evidence                                | Complete |

### Files and ownership

- Renderer modules: `packages/renderer-core/src/product-float.ts`, a new `product-layer.ts`, a small commerce composition helper and focused motion helpers. Extract text/path construction only as it gains real consumers. Export intentional public interfaces from `index.ts`.
- Integration: `commerce-floating.ts` and `commerce-scene.ts` remain format composers. They own layout, provenance, input requirements and registration.
- Shadow preparation: `packages/animation-engine/src/commerce-preparation.ts` and a focused texture preparation helper. A browser preview adapter may call the same deterministic preparation logic or load the prepared texture; both must produce the same pixels and asset record.
- Contracts: reuse `prepared.ts` and `commerce.ts`. Static demonstration scenes may need commerce `events` to allow an empty list; make that a narrow, tested change if the fixture harness requires it. Existing font requirements remain until independently justified.
- Lab: extend the existing commerce workbench with a component demonstration section. Show the selected component, only its controls, a neutral background and scrub/play. Keep format selection recognizable. This is a test and authoring aid, not a new general editor.
- Fixtures: add component examples under `benchmarks/fixtures/ecommerce-motion/atoms/`; place rendered evidence under the existing ignored results directory.
- Tests: component behavior and contract tests under `tests/unit/`; targeted additions to `tests/browser/commerce.ts` for new assets and rendering risks. Use existing export and bundle machinery.

Final filenames may follow repository conventions found during implementation. Module responsibilities and acceptance criteria above are the stable part of the plan.

## Proofs and definition of done

Each component needs an isolated demonstration plus reuse in a composition. Reuse supplied synthetic assets for engineering tests. Test different source proportions and transparent padding; no new image-generation campaign is needed for this release.

1. **Existing palm-up float:** unchanged visual regression reference; its current status is Experimental.
2. **Studio float:** intact product + optional static shadow + plain background. Proves independent product and shadow placement; Experimental.
3. **Product introduction:** intact product + Translate + Text Block/Fade + reading hold, using the existing H01/H03 treatments as references; Experimental.
4. **Visible-detail callout:** settled product + Path Draw + Text Block, using a factual description of a visible feature; Experimental.

For each increment, record the fixture and exported preview, what changed, focused tests, and remaining limitations. Check identity/aspect ratio, motion endpoints and holds, relevant bounds, backward/random seeks, and 24/30 fps. New raster or text effects require preview/export comparisons and source-bundle reproduction. Pure extractions may use exact prepared-node/event equality plus existing render checks instead of repeatedly encoding every fixture.

Visually inspect the proofs at 4:5 and phone viewing size. Unit-test layout-independent components against landscape, square and portrait canvas sizes; new format/profile support remains a separate decision. Acceptance means the intended product relationship is readable and the product remains consistent. It makes no claim about audience retention or sales.

The first release is complete when AC-01–07 are done and all four proofs meet their criteria. Do not expand the first release to the whole source catalog.

## Subsequent queue — deliberately outside release 1

The following is the earlier general candidate list. For the new effects investigation, use the ordered [motion effects exploration](ecommerce-motion-effects-research.md#ordered-experimental-queue), beginning with Translate motion blur and a height-linked studio shadow. That effects exploration is now implemented as Experimental; see its implementation note.

| Order | Candidate                           | Prerequisites and reason to wait                                                                                                                       |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Clip/Mask Reveal                    | Explicit crop/occlusion contract and accurate mask; reuses prepared groups, but moving mask geometry needs renderer design and label-visibility checks |
| 2     | Registered Variant Crossfade        | Two approved, aligned SKU images with matching copy; prevent interpolation that invents product features; treat as two image layers with paired fades  |
| 3     | Panel/card arrangements and stagger | Two real compositions needing shared layout; reuse rectangle and Text Block, avoid a public card system before those needs exist                       |
| 4     | Bounded Scale/Settle                | Existing translate/fade compositions established; proportional scale, legible label and quiet hold; no perpetual bouncing                              |
| 5     | Height-linked shadow                | Static shadow accepted in a suitable experimental composition; single shared progress with Float; explicit art-directed mapping                        |

Light sweep, 2.5D camera motion, orbit, reflection, particles, product decomposition, fake 3D rotation and automatically generated claims are deferred. Revisit only for a supplied brief whose intent requires them. The pack's technique count is not a completion target.

Catalog connection: Translate supports the mechanics of T01, Text Block with motion supports part of T05, Path Draw supports T06, and Float supports part of T12. These are reuse opportunities, not automatic implementation claims for every format tagged with those techniques.

## How work continues without “what's next?”

- This file is the canonical component queue. The research note contains evidence; the older adoption plan contains historical context.
- Research preceded implementation. The user then requested sequential execution of AC-01–07, which is now complete.
- AC-01–07 were executed in the listed order. For future authorized work, update status and evidence as work completes and choose the next ready task without asking the user to prioritize again.
- Continue useful tasks when one item lacks an external input. Use the existing synthetic fixtures for technical verification and record real-SKU visual validation separately.
- Ask only when a missing asset or decision materially blocks the requested work, or when a requested change would alter the accepted palm-up visual baseline. Do not add an approval checkpoint for each component.
- Stop at the release-1 definition of done. Future enhancements remain in the subsequent queue until their implementation is requested.
