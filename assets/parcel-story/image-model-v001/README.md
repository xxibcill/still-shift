# Image-model artwork for the parcel story

Eight raster assets generated with the **built-in image_gen tool** on 2026-09-28. These are new model-created illustrations, not SVG-to-PNG conversions. Original direction: warm slice-of-life animation drawings, hand-inked contours, restrained cel shading, gouache/pencil texture, everyday materials and upper-left morning light.

| Asset             | Role                                              | Background                |
| ----------------- | ------------------------------------------------- | ------------------------- |
| `hall.png`        | Empty hallway plate with floor, picture and lamp  | Opaque                    |
| `nora.png`        | Nora, facing right with an extended hand          | Transparent RGBA          |
| `neighbor.png`    | Older neighbor, facing left to receive the parcel | Transparent RGBA          |
| `door-closed.png` | Terracotta apartment door                         | Transparent outside frame |
| `door-open.png`   | Matching open-door state with a dark interior     | Transparent outside frame |
| `door-blue.png`   | Slate-blue companion door                         | Transparent outside frame |
| `parcel.png`      | Separate cardboard parcel                         | Transparent RGBA          |
| `knock.png`       | Three painted knock accents                       | Transparent RGBA          |

The closed door was generated first, then used as the edit reference for its open state and blue companion. Nora was the character/style reference for the neighbor, parcel and knock accent. Each requested asset used a separate image-model call. Original generated PNG bytes and alpha channels are preserved without pixel post-processing.

[prompts.json](prompts.json) contains the exact final prompt set and generation source paths. [manifest.json](manifest.json) records saved dimensions, SHA-256 checksums, alpha bounds and generator provenance. The built-in tool did not expose a model-version identifier, so none is claimed.

## Animation integration

The consuming plan is `benchmarks/fixtures/parcel-story/image-model/parcel-story.json`. Its three templates use PNG image layers and the existing engine's image-state switching, camera movement and cue-linked transforms. Native text still supplies captions and apartment numbers. Character scale, door placement and parcel/hand alignment were adjusted in scene data for the new artwork's proportions; audio and cue timing were retained.

The earlier SVG source assets and rendered proof remain available. The Passage workbench now links to the image-model version.

```sh
pnpm story:passage \
  --plan benchmarks/fixtures/parcel-story/image-model/parcel-story.json \
  --narration assets/parcel-story/narration-v001/narration.wav \
  --output-dir benchmarks/results/my-image-model-parcel
```

Local review: `benchmarks/results/parcel-story-image-model-v001/index.html`. Human approval of the finished visuals remains open; generated art is a candidate, not an approved final production.

## Verification

The rendered video is 1920×1080, 864 frames at 24 fps, exactly 36 seconds. All three templates resolve eight PNG picture assets with verified checksums. The seven isolated assets contain real alpha transparency. Original and updated plans have identical cue frames, bindings, narration alignment and sound settings; decoded exported audio is byte-identical to the accepted SVG-artwork version.

Eight decoded frames across the three scenes were visually inspected for composition, transparency, door-state continuity and parcel alignment. The review directory contains `contact-sheet.png` and `art-verification.json`. The existing `entrance-pop` advisory on Nora's final fade remains; this artwork change does not alter its timing.
