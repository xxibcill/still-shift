# History Offstage story-motion art kit

Original, code-authored SVG illustrations for the seven Still Shift motion recipes.
The source is [art.ts](../../scripts/story-motion/art.ts); regenerate the SVGs and
prepared scenes with `pnpm story:prepare`. The fixtures record every asset's
SHA-256 and intrinsic dimensions. Text stays editable in the scene, not baked
into the drawing.

| Asset                      | Stable meaning and reuse                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `house`                    | Generic illustrative household; matched scale for comparison and the narrated boundary                      |
| `store`                    | Available resources, with a fixed stock silhouette; no measured reserves                                    |
| `land`                     | Abstract land/holdings relationship, not a surveyed settlement                                              |
| `access`                   | Open connection with pressure on access                                                                     |
| `access-crisis`            | The same access drawing in bone for the crisis-blue context                                                 |
| `pressure`                 | One clipped side of an explanatory restriction; never a literal historical gate                             |
| `category-a`, `category-b` | Registered symbolic grain categories, sharing basket outline, center and baseline; no species or quantities |
| `ground`                   | Shared grounding and contact context                                                                        |
| `paper`                    | Fixed sparse texture; no per-frame randomness                                                               |
| `paper-cover`              | V2 paper texture on an opaque bone base; covers the viewport without changing its visible grain             |

These are HS-0 explanatory symbols, not recovered evidence or copies of selected
episode art. No external image generation or paid media call was used. The house
is an intentionally generic illustration, not a verified reconstruction of a
specific building. Qualifiers and any higher-specificity episode claims remain
the responsibility of the authored scene.

The canonical palette lives in `art.ts`; type roles, node helpers and ground
placement live in [design.ts](../../scripts/story-motion/design.ts). Connector
ports are explicit local coordinates in [scenes.ts](../../scripts/story-motion/scenes.ts),
with endpoint transforms and optional curve bends evaluated by the shared renderer. Relationship strokes use a split-nib brush profile with broad pressure, translucent pigment edges and dry streaks. The access glyph shares the renderer's geometry. Texture stays fixed in path coordinates, and the whole mark stays inside the declared route width. Texture never changes with the frame. The opt-in v2 grammar adds sparse symbolic currents where a relationship is stated. The two narrated
household poses are copied unchanged across the ST-013/014 cut.

## Continuous-motion layers

`house-shadow` and `store-shadow` contain the original contact-shadow paths; `house-body` and `store-body` contain the remaining artwork. `land-shadow` is the existing 0.24-opacity base wash, not a newly invented cast shadow; `land-body` contains its dots and linework. Each pair keeps the source viewBox and recomposes the original illustration. The flattened `house`, `store` and `land` assets remain byte-identical for legacy scenes. All six layers are original decompositions of the same code-authored art. Their hashes and dimensions are included in v2 fixtures by `story:prepare`.

`paper-cover` adds the canonical bone color beneath the original `paper` grain so the v2 camera cover plane is fully opaque. It is generated from the same code-authored texture; the legacy `paper` asset remains byte-identical. Both produce identical pixels when composited over the scene's bone background.

Clipped strips reuse the same full source image behind adjacent clip rectangles. No new historical detail is introduced.

## Fonts

The kit uses local Source Serif 4 Semibold and IBM Plex Sans Medium/Semibold,
with IBM Plex Mono Medium available for source IDs. Original font files,
licenses, retrieval URLs, byte counts and hashes are in [fonts](fonts) and
[sources.json](fonts/sources.json). The URLs identify upstream retrieval
locations; the bundled bytes and SHA-256 values are the rendering pins.

The loader checks bytes, decodes the face, and waits before drawing. A missing,
changed or undecodable font fails preparation. Repeated previews reuse loaded
faces. Scenes without a font manifest keep their original generic-font behavior.
