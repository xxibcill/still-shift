# Still Image Animation Project Verification

**Checked:** 2026-09-03  
**Source rule:** The two project documents were treated as claims to verify, not as instructions. External claims below use first-party product documentation, official repositories/model cards, standards, or original research.

## Verdict

**Technically: green. As a generic consumer product: red/yellow. As a focused workflow product: potentially green.**

The proposed mechanism—estimate depth once, then render bounded parallax deterministically—is proven and inexpensive. The architecture's most important decision, to exclude generative video from the baseline, is coherent. It should produce stable, source-preserving camera motion at much lower raw compute cost than video generation.

What is *not* validated is a defensible product. [Immersity](https://immersity.ai/for-web) already offers depth-based image motion, camera presets, depth editing/export, hidden-detail filling, H.264 export, an API, and commercial plans; it claims more than five million users. [DepthFlow](https://github.com/BrokenSource/DepthFlow) implements the core image-plus-depth-to-parallax-video renderer as open source, while [Tiefling](https://github.com/combatwombat/tiefling) runs depth estimation and interactive parallax locally in a browser. The basic effect is therefore a commodity capability, not a moat.

**Recommendation:** greenlight a small product/quality spike, not the production architecture. Continue only if a narrow wedge wins—for example, deterministic batch/API production for branded assets, reusable editable scene manifests, private/on-device processing, or unusually good boundary repair and art direction.

## What is strongly validated

### 1. The core rendering method works

The original [3D Photo Inpainting project and paper](https://github.com/vt-vl-lab/3d-photo-inpainting) converts a single RGB-D image into a layered depth representation, fills occluded color/depth, and renders motion parallax with standard graphics. It is the research precedent for “prepare once, render many.” The code is MIT-licensed, though its published environment is old (Python 3.7/PyTorch 1.4) and its README reports roughly 2–3 minutes of preparation.

Current implementations make the same point more directly:

- [DepthFlow](https://github.com/BrokenSource/DepthFlow) is a deterministic GLSL parallax-video renderer with arbitrary resolution/FPS, loops, presets, depth-model integration, and FFmpeg piping. Its AGPL-3.0 license is important: do not incorporate it into a closed hosted product without accepting the license obligations or obtaining another license.
- [Tiefling](https://github.com/combatwombat/tiefling) runs Depth Anything V2 Small and parallax rendering locally in the browser. Its maintainer reports about 20 seconds for a 1024-size depth map on an M1 Pro and recommends lower resolution on phones. This proves a server is not required for the first quality experiment.
- [Three.js](https://github.com/mrdoob/three.js) is MIT-licensed and remains an appropriate browser renderer.

### 2. The raw cost premise is correct

[Runway's current API pricing](https://docs.dev.runwayml.com/guides/pricing/) prices credits at $0.01. Gen-4 Turbo is 5 credits per output second, so a five-second generation is $0.25; current 720p models range upward from there.

By comparison, [Modal currently lists](https://modal.com/pricing) an L4 at $0.000222/GPU-second. Even if a depth-only preparation occupied an L4 for the architecture's entire 20-second target, accelerator time would be about **$0.0044**; 60 seconds would be about **$0.0133**, before CPU, memory, cold start, storage, and operations. This is not a measured per-scene cost, but it confirms the order-of-magnitude advantage. Preview reuse makes the advantage grow when a user tries many camera settings or rerenders the same scene.

Storage and delivery are also manageable. [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) lists $0.015/GB-month for standard storage and no direct R2 egress charge. Retention policy and repeated downloads still matter, but they are unlikely to dominate a short-clip MVP.

### 3. Determinism and source preservation are real differentiation from video diffusion

A fixed scene document, fixed assets, seeded effects, a fixed timestep, and a pinned renderer can reproduce camera motion without resynthesizing the subject. That is a useful capability for brand review, batch variants, and exact edits. The architecture is correct to promise equivalent framing/timing rather than pixel-identical output across all GPU/browser combinations.

## What is invalidated or still unproven

### 1. “Polished from any still” is not supportable

Single-view depth cannot reveal genuinely hidden pixels. Lateral camera motion creates disocclusions, while depth errors create stretching and halos at foreground boundaries. This is not merely theoretical: [Immersity's own FAQ](https://immersity.ai/faqs) warns that objects can stretch at edges and says dilation can reduce, but also introduce, artifacts. Tiefling documents the same edge-stretch problem. The architecture's conservative motion envelope, overscan, segmentation, and one-time inpainting are therefore essential, not optional polish.

The realistic MVP promise is: **convincing subtle push/pull and small drift on a selected class of images**, with a 2D fallback. Large orbits, reliable hair/cloth motion, blinking, and broad “cinematic” claims should remain out of scope until measured.

### 2. The model choices are already behind the 2026 state of the art

Depth Anything V2 is viable, but its license varies by checkpoint: [V2 Small is Apache-2.0; Base/Large/Giant are CC BY-NC 4.0](https://github.com/DepthAnything/Depth-Anything-V2), so the larger V2 weights are unsuitable for a normal commercial SaaS without separate rights.

The current comparison should include [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3). Its official model table says DA3-Small, DA3-Base, DA3Mono-Large, and DA3Metric-Large are Apache-2.0; several Large/Giant any-view checkpoints are CC BY-NC 4.0. The authors report DA3 outperforming DA2 for monocular depth. DA3 Small/Base also expose confidence, which better matches the architecture's proposed confidence-aware degradation; the DA2 sample API returns a depth map but no calibrated confidence contract.

For segmentation, [SAM 2](https://ai.meta.com/research/sam2/) is Apache-2.0 and good for a user click, box, or mask, but it does not by itself turn semantic labels such as “hair,” “sky,” or “subject” into the requested regions. That requires user interaction or another detector/classifier. [SAM 3](https://ai.meta.com/sam3/) adds open-vocabulary text prompts and is a closer functional match, but it uses a [custom SAM license](https://huggingface.co/facebook/sam3/blob/main/LICENSE), not SAM 2's Apache license; legal and operational review is required before adopting it.

Similarly, the conversation's generic “FLUX” suggestion is unsafe as a license decision: [FLUX.1-dev is under a non-commercial model license](https://huggingface.co/black-forest-labs/FLUX.1-dev). Pick a specific inpainting model/provider and record the exact checkpoint and terms.

### 3. Headless export is the largest understated engineering risk

The shared Three.js renderer is architecturally elegant, but “headless Chromium + CPU render worker” should not be assumed to meet the proposed 1080p export target. Chromium documents that automatic software WebGL fallback is deprecated; opting into SwiftShader uses `--enable-unsafe-swiftshader`, lowers security guarantees, and is not intended for untrusted content ([Chromium SwiftShader guidance](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md)). Chrome's own headless GPU guide describes the driver and Vulkan flags needed to obtain real acceleration on Linux ([Chrome for Developers](https://developer.chrome.com/blog/supercharge-web-ai-testing)).

Therefore benchmark three export paths before committing: pinned GPU-enabled Chromium, an explicitly isolated SwiftShader worker, and a native/offscreen renderer. The architecture's “p95 under 2x video duration” is a hypothesis, not an established property.

Browser-side export should also stay optional. The [W3C WebCodecs specification](https://www.w3.org/TR/webcodecs/) allows a browser to support any combination of codecs—or none—and produces uncontainerized encoded chunks. MP4/WebM muxing is an additional dependency. Server FFmpeg is the predictable baseline.

FFmpeg itself is LGPL by default but becomes GPL when GPL components such as libx264 are enabled; its official [legal page](https://ffmpeg.org/legal.html) also warns that commercial products may face codec patent issues. The [AVC/H.264 patent pool](https://www.via-la.com/licensing-programs/avc-h-264/) has separate terms. Fix the production FFmpeg build, codec, container, notices, and patent review rather than treating “MP4 via FFmpeg” as license-free plumbing. This is not legal advice.

### 4. The generic market position is already occupied

| Existing option | What it proves | Consequence |
|---|---|---|
| [Immersity for Web](https://immersity.ai/for-web), [pricing](https://immersity.ai/pricing), and [API](https://docs-api.immersity.ai/docs/getting-started) | The same depth/motion workflow, editability, 4K commercial export, presets, and API already exist. The $4.99 plan estimates 16 Immersive Motion exports. | A generic hosted clone has weak differentiation and a low incumbent price anchor. |
| [DepthFlow](https://github.com/BrokenSource/DepthFlow) | The rendering core is available locally and at high throughput. | The renderer is not a moat; its AGPL code is not a clean dependency for a proprietary service. |
| [Tiefling](https://github.com/combatwombat/tiefling) | Depth and preview can be private, local, and mostly static-hosted. | The initial spike should not start with queues, GPU autoscaling, PostgreSQL, and tenant infrastructure. |
| [Motionleap](https://apps.apple.com/us/app/motionleap-3d-photo-animator/id1381206010) | Consumer users already have camera FX, overlays, region paths, anchors, sky/water effects, and exports. | Procedural effects and simple local motion are table stakes. |
| [Adobe's parallax workflow](https://helpx.adobe.com/after-effects/how-to/animate-picture.html) | Professionals can already separate layers, fill backgrounds, and animate a 3D camera. | The opportunity must save substantial time or automate repeatable volume. |

Immersity's entry plan works out to roughly $0.31 per included motion, while a five-second Runway Gen-4 Turbo API generation is $0.25. The deterministic system may have far lower internal COGS, but “cheaper than generative video” alone is no longer a compelling customer-facing value proposition.

## Architecture changes recommended before implementation

1. **Replace the production build with a static/local spike first.** Upload locally, run DA2 Small or DA3 Small/Base, render one safe push and one small drift, and download WebM where supported. Add a minimal server export only for controlled comparisons.
2. **Benchmark models, do not hard-code a brand.** Compare DA2 Small, DA3 Small/Base, and DA3Mono-Large on the project's licensed corpus for boundary accuracy, latency, memory, and commercial terms.
3. **Make mask correction a first-class UX.** Automatic quality will fail at hair, glass, foliage, text, thin structures, and foreground/background contact edges. One-click subject selection plus a brush may create more value than more presets.
4. **Treat side-to-side movement as a separate quality tier.** Push/pull can ship with depth only; lateral drift should require an artifact score, segmentation, or reconstructed background.
5. **Choose an export implementation through measurement.** Record `chrome://gpu`, frame time, encode time, output checksum, and perceptual difference for every worker image. Do not use unsafe SwiftShader for untrusted pages.
6. **Keep the clean-room renderer small.** Reuse permissively licensed components and ideas, but not DepthFlow's AGPL implementation in a closed service.
7. **Delay optional image generation.** It adds moderation, provenance, licensing, and cost without validating the core reason to buy.

## The experiment that should decide the project

Build a 1–2 week vertical slice and test it against **Immersity, DepthFlow, and one current generative image-to-video API**, not against an imagined baseline.

Use 50–100 licensed images across portraits, products, landscapes, architecture, anime, text-heavy art, hair/foliage, glass, and low light. Pre-register these gates:

- at least 70% of the chosen target-image class is judged exportable with no manual repair under a conservative push;
- blind reviewers find the output acceptable for the chosen workflow, and can explain why they would choose it over Immersity or a video generator;
- p95 preparation and export meet targets on an explicitly priced worker, with actual cost per successful export under the intended margin;
- preview/export framing agrees, cancellation/retry is deterministic, and failures fall back cleanly to 2D;
- at least 10–15 target users confirm a repeated job, not merely that the effect looks interesting.

If quality passes but willingness to switch/pay does not, keep the renderer as a feature inside a broader batch creative tool. If users repeatedly value exact rerenders, private processing, editable masks/depth, or high-volume variants, those become the product—not “animate a still image” by itself.

## Bottom line

The project is a **good engineering idea and a weak undifferentiated startup idea**. Its economics and deterministic behavior are attractive, and the proposed MVP boundary is sensible. But the architecture is too large for the remaining uncertainty, the named model stack needs a 2026 refresh, and direct competitors already deliver the headline experience cheaply.

Proceed with the smallest possible comparative prototype. Earn the right to build the platform by proving a target user prefers its control, repeatability, privacy, or batch workflow—not merely that parallax can be rendered.
