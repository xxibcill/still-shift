# Generated preset demo stills

Four original 1672 × 941 PNG stills generated on 2026-09-25 with the built-in
image generation tool for local Still Shift demonstrations. They are **synthetic
demo assets**, not evidence that the intended explainer workflow passes Phase 0.
Do not add them to the frozen evaluation corpus merely because their compositions
were designed to work well with the current presets.

**Review status:** The project owner approved all four images and their three-preset
demo gallery on 2026-09-25 for Still Shift demo use. This approval does not freeze
or expand the Phase 0 evaluation corpus.

| File | Subject | Useful depth structure |
| --- | --- | --- |
| `conservation-studio.png` | Terracotta vessel in a conservation room | Linen, vessel, receding shelves |
| `highland-valley.png` | Farmhouse and winding path in a valley | Rocks, farmhouse, distant hills |
| `geology-lab.png` | Sediment core on a workbench | Notebook, core, shelves |
| `stone-courtyard.png` | Brick arcade around an open passage | Planter, arcade, distant courtyard |

The shared image brief requested a 16:9 landscape still with near, middle, and
far planes; a stable level camera; important details at least 15% inside the
edges; continuous visual room around the subject; coherent lighting; and no
text, logos, transparent foreground objects, or thin protrusions. The four
scenes vary subject and environment while preserving room for `slow_push`,
`horizontal_drift`, and `cinematic_float`.

## Local render check

Each image was exported once through each of the three presets at standard
intensity for three seconds. All 12 clips rendered as 1920 × 1080 MP4s with
90 frames, no warnings, and no 2D fallbacks. Four midpoint frames were visually
checked for exposed borders. The ignored local comparison page is at
`benchmarks/results/preset-demo-renders/index.html`; its MP4s and depth cache are
local generated artifacts.

## Final prompts

### Conservation studio

> Use case: photorealistic-natural. Asset type: 16:9 landscape source still for the Still Shift animation engine, usable with slow push, horizontal drift, and gentle cinematic float. Create a quiet documentary photograph of a museum conservation studio: one substantial matte terracotta vessel on a sturdy worktable in the middle distance, a broad folded linen cloth in the near foreground, softly receding shelves and a daylight window in the far background. Realistic material texture and natural coherent side lighting; restrained warm earth colors. Compose with obvious near, middle, and far depth planes. Keep the vessel and every important detail at least 15% inside the image edges, with continuous background on both sides and above and below for camera movement. Camera level, stable perspective, no extreme wide-angle distortion. No people, labels, writing, logos, watermark, transparent objects, thin protrusions, decorative borders, or collage layout.

### Highland valley

> Use case: photorealistic-natural. Asset type: 16:9 landscape source still for the Still Shift animation engine, usable with slow push, horizontal drift, and gentle cinematic float. Create an editorial landscape photograph of a quiet highland valley at early morning: a broad weathered stone outcrop in the near foreground, a simple low farmhouse beside a winding path in the middle distance, and softly layered hills fading into the far background. Natural atmospheric perspective, coherent warm morning light, muted green and slate colors. Obvious near, middle, and far planes with substantial side-to-side visual room. Place the farmhouse and path junction near the center and keep all important details at least 15% inside the edges. Stable level horizon, realistic photography. No people, text, labels, logos, watermark, thin fences, spindly tree branches, transparent surfaces, dramatic fog banks, or decorative frame.

### Geology lab

> Use case: photorealistic-natural. Asset type: 16:9 landscape source still for the Still Shift animation engine, usable with slow push, horizontal drift, and gentle cinematic float. Create a realistic educational documentary photograph inside a geology laboratory: a thick cylindrical rock core sample with visible sediment layers rests horizontally on a matte workbench in the middle distance; a broad closed field notebook lies in the near foreground; larger rock specimens and simple shelves recede into the far background. The core sample is a single clear subject, opaque with solid edges. Cool daylight balanced by warm task lighting, calm neutral palette, detailed natural textures. Three readable depth planes and generous continuous visual room to the left and right. Keep the sample and notebook at least 15% inside all image edges, with level camera and stable perspective. No hands, people, text, numbers, labels, logos, watermark, glassware, transparent objects, tiny wires, spindly hardware, or border graphics.

### Stone courtyard

> Use case: photorealistic-natural. Asset type: 16:9 landscape source still for the Still Shift animation engine, usable with slow push, horizontal drift, and gentle cinematic float. Create a documentary architectural photograph of a quiet old-city courtyard: a broad stone planter in the near foreground, a simple brick arcade and open passage centered in the middle distance, and a softly receding courtyard wall and trees in the far background. Solid architectural masses, clean depth separation, coherent overcast daylight, realistic stone and brick texture, calm neutral colors. Compose symmetrically but not rigidly, camera level, with the passage as the main focal point at least 15% inside every edge. Leave continuous scene content around the edges and enough visual room to move sideways. No people, text, signs, logos, watermark, narrow railings, glass walls, reflective surfaces, delicate foliage near the foreground, or collage layout.
