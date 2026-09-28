# Illustrated sequence artwork

Original symbolic artwork for the [three-shot example](../../docs/illustrated-sequence.md).
These assets represent access and pressure; their geometry does not measure
historical quantities, household reserves or actual transport capacity.

| Asset ID            | Exact source                    | Meaning and inspection                                                                                                                                | Used in                                      |
| ------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `house`             | `../story-motion/art/house.svg` | Existing 600×440 illustrated cottage. Ochre roof, ink outlines, door/window and ground shadow. No suitable copy space inside the artwork.             | All three shots                              |
| `store`             | `../story-motion/art/store.svg` | Existing 600×520 full grain basket. Grain mound, basket hatching and ground shadow. Keep its contents unchanged across the cut; no copy inside it.    | All three shots                              |
| `access-open`       | `access-open.svg`               | New 800×240 route. Two green rails, tinted open band and dashed directional center. Endpoints register with the restricted variant.                   | Detail; action before frame 96               |
| `access-restricted` | `access-restricted.svg`         | New 800×240 route with a narrowed center. A visible gap remains. Rust contact bars reinforce the restriction.                                         | Action from frame 96; consequence throughout |
| `pressure`          | `pressure.svg`                  | New 240×160 rust wedge with ink outline and fixed hatching. Used twice, with the lower copy rotated 180°. Contact approaches the center of the route. | Action; consequence                          |

The new SVGs are authored in `scripts/illustrated-sequence/art.ts`, with no external
image generation or anime assets. Regenerate with `pnpm story:sequence:prepare`.
Template records contain hashes of the actual image and font bytes.

The existing house and basket were visually inspected at their original aspect
ratios before composition. The new route states and wedges were inspected in the
rendered contact sheet and decoded close-up. Their empty margins separate the
symbols; copy stays in the surrounding bone-colored scene space, never over the
house, basket or action. Captions remain fixed as the illustrated world moves.

Inspection status: agent-reviewed source art and sampled export frames on
2026-09-28. This is a standalone technical/visual proof, not approved episode
footage or a historical source. Existing font lineage remains in
`../story-motion/fonts/`.
