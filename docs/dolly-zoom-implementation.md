# CI-08 Dolly-Zoom Tension

**Status:** Implemented as a prepared Cinematic Parallax variation, 2026-09-29. The landscape proof uses the existing Kit B courtyard art. The planned Kit D room was not prepared; reusing Kit B follows the later iteration policy in the [cinematic plan](./cinematic-template-plan.md).

The camera moves toward the scene while its focal scale decreases. With subject depth `d = 4` and camera position `z`, the renderer sets `focal = (d - z) / d`. The projected subject scale is therefore `focal × d / (d - z) = 1` at every frame. The far plate at depth 8 contracts and the near masonry at depth 2.6 expands around the stationary figure. This is an illustrated three-plane approximation, not a reconstructed or rotatable 3D scene.

The [prepared fixture](../benchmarks/fixtures/cinematic-illustrated/ci-08-dolly-zoom-tension.json) has a seven-second timeline. It establishes the opening for one second, moves from roughly 1 to 4.8 seconds, then holds. All intensities keep the distant scale change inside the 3–6% proof envelope. The four-second quick preview preserves those proportions.

## Technical proof

For the seven-second Dramatic fixture at 1920×1080 and 24 fps, the compiler validates all 168 frames:

| Check                             |                    Result |            Limit |
| --------------------------------- | ------------------------: | ---------------: |
| Subject size change               |            effectively 0% |              ≤1% |
| Subject anchor travel             |          effectively 0 px | protected anchor |
| Distant plate scale reduction     |                     4.08% |             3–6% |
| Maximum near edge displacement    |        49.93 px (2.60% W) |  ≤57.6 px (3% W) |
| Minimum painted rear-plate margin |                  21.13 px |            ≥0 px |
| Minimum source sampling density   | 0.767 source px/output px |           ≥0.667 |

The compiler also checks the protected subject polygon, near-plane overlap, painted coverage, attached foreground cut edges and sampled resolution at every frame. Tests cover 24 and 30 fps, all three strengths, and rejection when the camera move is absent, the distant change misses its range or the near plane exceeds its travel bound.

Generate the fixture with `pnpm cinematic:prepare`. Render one short review with:

```bash
pnpm cinematic:preview --scene benchmarks/fixtures/cinematic-illustrated/ci-08-dolly-zoom-tension.json --duration 4 --strength dramatic --output /tmp/still-shift-ci08.mp4
```

A 96-frame preview was rendered and frames at the opening, midpoint and settled composition were inspected. The figure remains registered while the distant architecture contracts and the near masonry advances. The visual effect is restrained by the 3–6% distance-scale and 3% near-displacement limits; it is best used for a short pressure beat rather than a large camera reveal.
