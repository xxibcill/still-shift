# Courtyard parallax — executed image prompts

Mode: Codex built-in image generation. Four calls on 2026-09-25. The master was generated first; each derivative used that original master as its edit target. All files were copied unchanged into this directory.

## master

Reference: none.

```text
Use case: illustration-story. Create a finished wide 16:9 environment keyframe for a Layered Chronicle illustrated film shot, not a diagram. Expressive hand-drawn 2D forms, strong charcoal contours, controlled halftones and fixed screen-print grain, warm bone #E8DFC9, dark charcoal #211F1B, muted field green #59664D, grain ochre #B47A2A. Mature editorial story illustration, shallow designed perspective. View into a quiet modest courtyard: a substantial dark masonry doorway edge very close to camera frames the far-left 15 percent, including a little overhead lintel; an anonymous adult in simple muted green unadorned work clothing stands still, full body in three-quarter profile at the right-center (about 65 percent across), looking toward a plain recessed passage; feet grounded on a continuous stone floor. Figure occupies roughly the middle 55 percent of image height, with generous space above head and below feet. Keep hands resting, readable, no action, no direct stare. A warm light wall, shallow steps and a plain doorway at far-right form the middle and far architecture; softly layered distant rooftops peek over the rear wall. Near masonry, person, and far architecture must be clearly separated in silhouette, scale and value. Calm diffuse side daylight, quiet observing mood, strong asymmetry, no heroic grandeur. Entire image painted edge to edge with generous room around all important subjects. No writing, labels, arrows, borders, diagrams, floor grid, logos, watermark, thin railings, glass, intricate foliage, flying fabric, fog, particles, photorealism, glossy 3D, photographic blur, fake parchment, fantasy castle or identifiable historical insignia. All illustration layers sharply drawn. The scene must work as an immersive finished film composition with no on-screen copy.
```

## background

Edit target: `master.png`.

```text
Use case: precise-object-edit. Edit target: the supplied original illustrated courtyard master. Produce its COMPLETE CLEAN BACKGROUND PLATE. Remove the whole near dark stone doorway framing on the left including its overhead lintel, and remove the standing person plus only their cast/contact shadow. Seamlessly paint the courtyard floor/wall/sky hidden behind those removed objects. Keep the existing far wall, bench, door and steps on right, terracotta pots, tree, roofline, lighting, perspective and every other visible feature at exactly its existing image position and scale. Maintain the full original wide 16:9 canvas and framing, no crop or camera change. Fill the entire removed left area with plausible continuation of the same courtyard architecture and ground. Preserve the original illustrated charcoal contours and controlled grain. No new people, near framing object, text or transparency. This must be an opaque finished continuous environment with no holes or duplicate figure.
```

## subject

Edit target: `master.png`.

```text
Use case: background-extraction. Edit target: the standing person in the supplied courtyard master. Isolate ONLY this exact person and their compact grounding contact shadow as a genuine transparent-alpha PNG layer. Keep the same face/profile, hair, muted green clothing, resting hand, full body, shoes, stance, viewing angle, charcoal contours and colors. Preserve their pixel size and position within the same wide 16:9 canvas as the reference; the figure remains right-center. Remove absolutely everything else: wall, floor, masonry, tree, pots, bench, doorway, sky. Outside the person and small contact shadow must be truly transparent, not warm paper, white, checkerboard or a rectangular matte. Do not add or redraw another pose or move the person to center. Keep shoes and hair complete, no cutoff. No text.
```

## foreground

Edit target: `master.png`.

```text
Use case: background-extraction. Edit target: ONLY the very near dark masonry doorpost and overhead lintel at the left edge of the supplied courtyard master. Isolate that exact L-shaped stone framing as a genuinely transparent-alpha PNG foreground layer. Preserve stone forms, contours, colors, top/left/bottom edge alignment, and its original proportions and pixel position on the same wide 16:9 canvas. Remove the person and all courtyard architecture, ground, sky, tree, pots, and plants. The open area to the right and beneath the lintel must be genuinely transparent, with no paper, white rectangle, checkerboard, haze, fringe or fill. The doorpost legitimately touches the left and bottom image edges and the lintel the top edge. No new objects, no changes in perspective, no writing.
```
