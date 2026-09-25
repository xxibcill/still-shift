# Threshold Push — executed image prompts

Built-in `image_gen.imagegen` mode. One original master and four reference-led derivatives. Images were copied unchanged into this kit. The master had no image references; every derivative referenced the master.

## master

```text
Use case: illustration-story. Asset type: master still for Still Shift CI-01 Threshold Push, an authored layered illustration.
Create a detailed high-resolution 16:9 image, ideally 2560 by 1440 or larger, of a modest timeless storage chamber viewed straight through its near doorway. This is an original visual study with no dated historical claim.
Composition: two very near dark rough stone doorway posts occupy the leftmost and rightmost 16 percent of the canvas, extending beyond top and bottom with no connecting lintel visible. They frame a warm ochre ceramic storage vessel in the middle room, slightly right of center (about 64 percent across). The entire vessel is visible, large enough to be the focal point, its rim near 46 percent height and base near 78 percent height. Its compact shadow is attached to a continuous softly textured stone floor. Behind and to the LEFT of the vessel, a simple tall rectangular rear doorway occupies roughly x28–46 percent and y22–73 percent, opening into a quieter distant chamber with a softly lit far wall. Keep the rear opening clearly separate from the vessel silhouette. Floor has sparse irregular texture, no rigid tiled grid. Simple continuous room walls, generous margins and clear silhouettes. The horizon is level and the perspective is restrained.
Style: premium hand-drawn 2D historical editorial illustration, expressive charcoal outlines, warm bone plaster, ochre vessel, muted field green shadows, warm near-black stone posts, subtle fixed print grain and restrained halftone. Diffuse side daylight, rich dark foreground against a lighter room. Serious, intimate, expectant composition. All surfaces sharp, no photographic depth blur.
No people, text, letters, arrows, labels, diagram devices, borders, symbols, loose particles, ornate objects, glass, fog, motion blur or visible action. Render a complete still image, not a sprite atlas. Preserve clear separation of near posts, middle room with vessel and floor, and distant chamber visible through the rear opening.
```

## room

```text
Use case: precise-object-edit and background-extraction. Image 1 is the edit target, the threshold master. Make a registered middle-room animation plate, same exact wide 16:9 canvas and camera. Preserve the ochre vessel, its contact shadow, the entire floor, plaster walls, and the rear doorway frame in their exact original positions, shapes, colors and texture. Remove ONLY the two dark near stone posts at the far left and right; reconstruct continuous plaster wall and floor behind those removed edge posts all the way to every outer image edge. Additionally remove ONLY the distant room visible INSIDE the rear doorway opening: that interior opening must become a genuinely transparent alpha hole, precisely following the inside edges from the top inner lintel to the inner sill. Keep the doorway frame itself opaque. Keep the vessel and all its surroundings unchanged. Every outer canvas edge must remain filled with opaque room painting; only the rear opening is transparent. Do not add another vessel, people, text, checkerboard, white matte, shadow behind the alpha opening, blur, or any new near object. Output PNG RGBA, original wide canvas. This is a middle room with a transparent window to a deeper layer, not an isolated vessel cutout.
```

## far

```text
Use case: illustration-story. Image 1 is a style and lighting reference. Create a seamless full wide 16:9 opaque painting of the quieter DISTANT chamber glimpsed through the rear doorway of that reference. View the interior of this distant chamber without the surrounding doorway frame. A simple receding wall corner, softly lit ochre/bone plaster on the left, muted field-green shadows on the right, a broad continuous stone floor with sparse irregular texture, and a small low unadorned stone storage ledge toward the left. Match the reference charcoal contours, hand-drawn painterly texture, fixed print grain, restrained diffuse side light. Provide a complete room wall and floor to all four canvas edges, so a small moving aperture can reveal any part of it. NO large vessel, no people, no near doorframe, no letters, symbols, windows, bright sky, photographic blur, or black/transparent areas. Full opaque RGB background plate.
```

## left

```text
Use case: background-extraction. Image 1 is the edit target and texture reference. Extract and faithfully redraw ONLY its leftmost near dark stone doorway post as a high-detail tall PORTRAIT PNG with genuine alpha transparency, ideally 1024 by 1792 or larger. This is a close-up of that same post, not the whole wide scene. The dark masonry extends from the LEFT canvas edge and covers approximately the LEFT 62 percent of this portrait; the remaining RIGHT 38 percent is fully transparent. Stone texture extends beyond the top, bottom and left boundaries. Its right silhouette is the same nearly vertical irregular chipped stone edge as the reference, no taper, no base, no lintel. Preserve material, charcoal contours, stone blocks, warm greenish-black shadows and the faint lit inside-facing right edge. No vessel, room, floor, distant wall, cast shadow outside the post, checkerboard, white matte, extra pillar, border or text. Leave right-side negative space fully alpha, not painted. Keep the post's aspect and stone-block shapes believable at this closer resolution.
```

## right

```text
Use case: background-extraction. Image 1 is the edit target and texture reference. Extract and faithfully redraw ONLY its rightmost near dark stone doorway post as a high-detail tall PORTRAIT PNG with genuine alpha transparency, ideally 1024 by 1792 or larger. This is a close-up of that same post, not the whole wide scene. The dark masonry extends from the RIGHT canvas edge and covers approximately the RIGHT 62 percent of this portrait; the remaining LEFT 38 percent is fully transparent. Stone texture extends beyond the top, bottom and right boundaries. Its left silhouette is the same nearly vertical irregular chipped stone edge as the reference, no taper, no base, no lintel. Preserve material, charcoal contours, stone blocks, warm greenish-black shadows and the faint lit inside-facing left edge. No vessel, room, floor, distant wall, cast shadow outside the post, checkerboard, white matte, extra pillar, border or text. Leave left-side negative space fully alpha, not painted. Keep the post's aspect and stone-block shapes believable at this closer resolution.
```
