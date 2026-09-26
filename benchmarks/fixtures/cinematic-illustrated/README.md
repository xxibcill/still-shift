# Cinematic scene fixtures

The first four Cinematic Parallax variations are: **CI-09 Layered Parallax**, **CI-01 Threshold Push**, **CI-02 Lateral Track**, and **CI-03 Foreground Reveal**, each with two seven-second Dramatic compositions. Parallax uses the courtyard kit; its alternate changes positions, depth spacing and camera direction. Threshold Push uses the storage-room kit; its alternate narrows the opening, changes both near depths, and tightens the room composition. Lateral Track reuses the grounded room for sustained sideways travel; its alternate changes room framing, post positions, direction, and depth spacing.

```bash
pnpm cinematic:prepare
pnpm cinematic:render --output-dir benchmarks/results/cinematic-illustrated/my-review
pnpm test:browser:cinematic --renders benchmarks/results/cinematic-illustrated/my-review
pnpm threshold:render --output-dir benchmarks/results/cinematic-illustrated/my-threshold-review
pnpm test:browser:threshold --renders benchmarks/results/cinematic-illustrated/my-threshold-review
pnpm lateral:render --output-dir benchmarks/results/cinematic-illustrated/my-lateral-review
pnpm test:browser:lateral --renders benchmarks/results/cinematic-illustrated/my-lateral-review
pnpm reveal:render --output-dir benchmarks/results/cinematic-illustrated/my-reveal-review
pnpm test:browser:reveal --renders benchmarks/results/cinematic-illustrated/my-reveal-review
```

Use a new output directory. The generator checks source dimensions/crops and every frame's geometry before writing the scenes. The render script invokes the real `animate-scene` CLI and produces three MP4s: two Dramatic compositions and the primary composition at Standard strength. It also writes metadata, motion measurements, posters, contact sheets, and an original-versus-Dramatic review page.

`cinematic:prepare` writes all twelve fixtures, including one four-second **Rising Vista**, **Curved Approach**, **Detail to World** and **Focus Handoff** scene each. Use `cinematic:preview` for those new paths; see the [path guide](../../../docs/parallax-path-variations.md). `cinematic:render` selects parallax; `threshold:render` selects the forward push and leads its review page with one main shot. `lateral:render` selects the sideways track. The shared renderer and browser verifier accept `--preset threshold_push` and `--preset lateral_track`.

These use the experimental `illustrated-scene-2` contract. Each root image binds one depth plane. The recipe identifies foreground, anchored subject, and background. The background declares an opaque painted rectangle; the subject declares a nonzero protected polygon in local coordinates. Foreground `edgeAttachments` prevent cropped source edges from entering the frame. Camera travel is measured in the projection's authored scene units, with output displacement checked against the preset envelope. `dramatic`, `standard`, and `restrained` strengths are supported.

The source assets are original proof material, outside the frozen corpus. See the [implementation and QA report](../../../docs/cinematic-parallax-implementation.md) for limits and the current review clip.

Threshold Push additionally requires `camera.push`, zero lateral travel, a distinct `foregroundRight`, and attached left/right door edges. Sampling is checked after magnification on every frame. Its protected polygon and anchor describe the vessel inside the larger room image. See the [Threshold Push guide](../../../docs/threshold-push-implementation.md) for exact geometry and limitations.

Lateral Track requires nonzero horizontal travel and zero vertical/axial travel. It omits subject anchoring and keeps scale fixed. Both room fixtures declare all four outer cut edges so the distant plate cannot conceal a room coverage failure. See the [Lateral Track guide](../../../docs/lateral-track-implementation.md).

Foreground Reveal requires a semantic `recipe.revealRegion` on the subject, nonzero horizontal travel and zero vertical/axial travel. Actual decoded alpha must conceal 10–35% of that region initially, clear to at most 1% by settling, and stay clear. Both fixtures reuse the room kit with enlarged near posts. See the [Foreground Reveal guide](../../../docs/foreground-reveal-implementation.md).

Detail to World uses `camera.pullback` and zero lateral travel to retreat from a close opening to the authored wide composition. The lens stays fixed and each plane shrinks according to depth. Near cards cannot overlap the protected detail. See the [research and implementation guide](../../../docs/detail-to-world-implementation.md).

Focus Handoff requires `camera.focus` to set maximum layer blur and normalized transfer timing. It transfers sharpness from the foreground to the subject with tiny optional horizontal travel. See the [focus guide](../../../docs/focus-handoff-implementation.md).
