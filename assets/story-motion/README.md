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

These are HS-0 explanatory symbols, not recovered evidence or copies of selected
episode art. No external image generation or paid media call was used. The house
is an intentionally generic illustration, not a verified reconstruction of a
specific building. Qualifiers and any higher-specificity episode claims remain
the responsibility of the authored scene.

The canonical palette lives in `art.ts`; type roles, node helpers and ground
placement live in [design.ts](../../scripts/story-motion/design.ts). Connector
ports are explicit local coordinates in [scenes.ts](../../scripts/story-motion/scenes.ts),
with endpoint transforms and optional curve bends evaluated by the shared renderer. Relationship strokes use a split-nib brush profile with broad pressure, translucent pigment edges and dry streaks. The access glyph shares the renderer's geometry. Texture stays fixed in path coordinates, and the whole mark stays inside the declared route width. No random per-frame texture or traveling tokens are added. The two narrated
household poses are copied unchanged across the ST-013/014 cut.

## Fonts

The kit uses local Source Serif 4 Semibold and IBM Plex Sans Medium/Semibold,
with IBM Plex Mono Medium available for source IDs. Original font files,
licenses, retrieval URLs, byte counts and hashes are in [fonts](fonts) and
[sources.json](fonts/sources.json). The URLs identify upstream retrieval
locations; the bundled bytes and SHA-256 values are the rendering pins.

The loader checks bytes, decodes the face, and waits before drawing. A missing,
changed or undecodable font fails preparation. Repeated previews reuse loaded
faces. Scenes without a font manifest keep their original generic-font behavior.
