# Kit A — The threshold

Original authored art for CI-01 Threshold Push. Created with the built-in image generation tool after [primary-source research](../../../docs/threshold-push-research.md).

- `threshold-master.png`: composition reference.
- `threshold-room.png`: room, vessel, contact shadow, and floor together; the rear opening is alpha-transparent.
- `threshold-far.png`: complete opaque distant chamber revealed through that opening.
- `threshold-left.png` and `threshold-right.png`: separate tall near posts, providing enough source pixels during magnification.

All PNGs are unchanged generated outputs. Room/far are 1672×941; posts are 948×1659 and 948×1660. The fixture preserves each source aspect ratio. Small saturated RGB values inside nearly transparent pixels have alpha at most 2/255; inspect the composited render, not transparent RGB alone.

The vessel and floor share one transform, preserving their painted contact. The room remains a flat illustrated stage with fixed internal perspective. No unrestricted room reconstruction or orbit is implied. Actual sampling density and all projected bounds are validated every frame.

See [exact prompts](prompts.md), [provenance](provenance.json), and [asset inspection](asset-inspection.json). These are study assets outside the frozen corpus.
