# Detail to World — research and implementation direction

Researched 2026-09-26 before implementation. This is CI-05, another variation in the shared Cinematic Parallax family. It reuses the existing projection and prepared artwork.

## Findings from primary sources

1. **A dolly-out translates the camera backward through the scene.** Adobe describes dolly in/out as camera movement through space and recommends movement that reveals information with clear subject focus and deliberate framing. For this shot, the reveal should establish the setting around an initially prominent detail. [Adobe: Tracking shots](https://www.adobe.com/creativecloud/video/production/cinematography/camera-shots-and-angles/tracking-shot.html)
2. **Layer separation and painted hidden regions create usable parallax.** Adobe's still-photo workflow separates foreground/background, reconstructs missing background, places layers at different z distances and moves one camera. It also recommends a composition smaller than the photograph. [Adobe: Animate photos with a parallax effect](https://helpx.adobe.com/ph_fil/after-effects/how-to/animate-picture.html)
3. **Source resolution must support the closest framing.** Adobe instructs authors to size source images for their largest appearance in the composition. Actual pixel dimensions determine available detail; changing DPI metadata does not add pixels. [Adobe: Preparing and importing still images](https://helpx.adobe.com/after-effects/desktop/import-files/import-still-images/preparing-importing-still-images.html)
4. **Dolly-zoom is a separate camera treatment.** Adobe describes translating the camera while changing the lens in the opposite direction to hold subject size and alter the background. Detail to World should let its subject shrink; reserve focal compensation for the planned Dolly-Zoom Tension variation. [Adobe: Dolly zoom](https://www.adobe.com/creativecloud/video/production/cinematography/camera-shots-and-angles/dolly-zoom-shot.html)

## Project design choices

The following values are authoring decisions derived from the existing renderer and available art, not universal cinematography rules.

### Camera and composition

- Author the final wide composition at camera z=0. Start closer, at positive z, then retreat to zero while focal scale remains 1. Keep one subject anchor to preserve the viewer's point of attention.
- Use the renderer's existing perspective equation, `scale = depth / (depth - cameraZ)`. Separate near/middle/far depths then produce different shrink rates through one camera. A uniform full-frame zoom does not meet this variation's depth requirement.
- Reuse Kit A's storage chamber, grounded vessel, distant plate and tall doorway posts. Start tightly on the vessel and room; finish with more chamber and doorway context. The landscape kit has no building and its large ridge already approaches the source-density limit, so it is less suitable for a strong pullback without new art.
- Candidate Dramatic staging: start z=0.65; near depth=1.6, room depth=3, far depth=12. End at z=0. At the opening these yield scale factors approximately 1.684, 1.277 and 1.057. Relative to their opening sizes they shrink approximately 40.6%, 21.7% and 5.4% respectively. These differences provide the axial parallax cue.
- A room width near 1930 output pixels starts near 2464 pixels at this scale. Its 1672-pixel source provides approximately 0.679 source pixels per output pixel, just above the existing 2/3 minimum. Verify the complete projection rather than assuming this preliminary calculation is sufficient. The tall post sources have a different pixel budget and require separate checks.
- Four-second proof: brief opening recognition, a single eased retreat, then a held wide ending. Reuse deterministic absolute-frame sampling and the existing strength controls. Keep the endpoint wide composition stable across strengths; strength changes the initial approach distance.

### Specific risks and acceptance checks

- Retreat makes doorway edges move inward. Stage their final positions so they frame the room without concealing the vessel; inspect real alpha overlap as well as geometric bounds.
- Check every frame for painted background coverage, source sampling density, attached cut edges, protected subject bounds and depth clearance. The opening maximizes enlargement; the final frame exposes the widest source area.
- Keep the vessel and its floor/contact shadow on the same prepared card. This preserves their registration as scale changes.
- Verify monotonic subject shrink, a larger fractional size change in the near plane than the middle and far planes, stable subject anchoring, and constant focal scale. Test all strengths at 24/30 fps and inspect sampled lab/export parity.
- Watch the four-second result at full size and thumbnail size. The ending must show recognizable additional surroundings, with a clear change in relative layer size. The available artwork supports a tighter-to-wider chamber study; it does not provide a macro close-up or new sides of the vessel.

No new image generation is planned. The renderer remains a camera over front-facing illustrated planes; its movement does not reconstruct unseen three-dimensional geometry. The initial 1.20→1.00 framing target in the backlog was a provisional project limit. Approximately 1.277→1.00 is a proposed revision subject to actual source and coverage checks.
