# Rising Vista layer prompts

Source: `../../history-offstage-v2/landscape.png` (existing generated study artwork).

Generated with built-in imagegen on 2026-09-26. PNG outputs copied unchanged.

## Terrain

Use case: background-extraction. Asset type: middle terrain RGBA layer for a 2.5D illustrated landscape. Reference image is the existing landscape master. Preserve EXACT viewpoint, winding pale road, green and ochre fields, fixed print texture, palette and artwork registration of the reference. Keep all terrain and road from the horizontal distant field boundary around y=370 in a 941-high source down to the bottom, opaque through left/right/bottom. Remove sky, distant hills and distant treeline above that boundary to genuine alpha transparency. Make the top silhouette a simple nearly level field boundary with a few small low bushes; avoid tall trees or floating isolated objects. No feather fade, no added objects, text, border or fake checkerboard. Output a wide 16:9 RGBA PNG, same framing as reference, target1672x941 or larger preserving composition. This is a complete middle terrain card, not a montage.

## Near ridge

Use case: illustration-story. Asset type: very near grassy ridge RGBA foreground layer for the referenced landscape. Match the reference's woodcut-like charcoal contours, muted green and ochre colors, fixed screen-print texture, simple cultivated countryside. Generate a broad dark grassy bank occupying the bottom approximately 35 percent of a wide16:9 image. Its irregular natural crest rolls gently down from left to right, with large readable tufts rather than hair-thin blades. Ridge is continuous and fully opaque from its crest to left/right/bottom edges. Above the crest is genuine alpha transparency with no sky, ground, road or background. No trees, buildings, text, frame, fog or gradients; no checkerboard. The bank is an independent near occluder, visually closer and darker than the referenced field. Target1672x941 or larger, high-quality RGBA.
