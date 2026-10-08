# Still Shift product direction

**Recorded:** 2026-09-24

**Source:** Project-owner discussion

**Purpose:** Preserve the intended product positioning when planning work beyond the original Phase 0 experiment.

**Roadmap revision, 2026-10-08:** The owner archived Phase 0 and removed speculative
expansion from active priorities. The [active roadmap](../ROADMAP.md) now centers
complete explanatory-video production, with composition completion followed by a
portable mechanism proof. Historical acceptance remains unverified.

## Owner-stated intent

- Reduce the cost of producing faceless YouTube videos by reducing reliance on expensive AI video generation.
- Produce videos programmatically, without manual editing.
- Mix animated 2D still images and moving text or graphics with selected high-quality AI video clips.
- Animate still images with multiple approaches. Depth-based parallax is one option, not the definition of the product.

## Product framing

Still Shift aims to produce complete faceless videos at a lower cost per finished minute by choosing an appropriate treatment for each shot, then assembling the results automatically. It should reserve AI video generation for moments where genuine generated motion is worth the cost and use animated images or text where those treatments serve the story.

The intended value is in the finished video and its production workflow: visual variety, reliable automated decisions, low manual repair, and measured cost savings. A parallax renderer alone does not establish that value.

## Candidate shot treatments

These are approaches to evaluate, not a claim that they are already implemented or all committed to Phase 0:

| Treatment                                  | Potential use                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 2D pan, zoom, reframing, and reveals       | Flat artwork, diagrams, documents, and images that do not benefit from depth.                            |
| Depth-based camera motion                  | Images with usable depth and safe room for camera movement.                                              |
| Separated foreground and background layers | Images where a clear subject can move independently of its background.                                   |
| Local or procedural motion                 | Subtle movement in selected regions, such as light, water, clouds, or fabric, when it improves the shot. |
| Animated text and graphics                 | Facts, quotes, labels, emphasis, and transitions.                                                        |
| Generated video                            | Selected shots that need genuine action or a stronger visual moment.                                     |

An eventual automated workflow would plan timed shots, choose among these treatments, generate or prepare assets, align them with narration and text, assemble the timeline, and export the complete video. The choice should account for visual suitability, failure risk, variety across the whole video, and cost. This workflow is a product direction; its detailed design is still open.

## Relationship to existing tools

- **AI video generators** can supply the selected generated-video shots. Still Shift's proposed savings come from using them selectively rather than generating every second of footage.
- **[Remotion](https://www.remotion.dev/)** is a possible composition and rendering tool for an automated timeline. It does not by itself decide which shot treatment is appropriate or whether the resulting video meets this workflow's quality and cost targets.
- **[DepthFlow](https://github.com/BrokenSource/DepthFlow)** already provides depth-based still-image animation, previews, export, and scripted batch use. It is a direct baseline for the parallax portion of the work. Still Shift should not claim depth-to-video conversion as unique; it should compare build-versus-use options on representative inputs.

These are positioning hypotheses, not established competitive advantages. Compare alternatives on the same images and finished-video workflow before claiming superior quality, speed, or cost.

## Current scope versus product direction

The [archived Phase 0 roadmap](./archive/roadmap-phase-0-2026-10-08.md) and
[historical implementation plan](../Phase_0_Implementation_Plan.md) tested a local
still-image animation engine. Their scope emphasized depth-based motion, included
a deterministic 2D fallback, and assembled one explainer for evaluation. Script
analysis, narration, text, shot planning and automatic timeline assembly were
outside the original Phase 0 scope.

That narrower experiment provides historical component evidence; its retired
corpus and unfinished product gates do not establish acceptance. The active
roadmap treats multiple animation methods, narration-linked authoring and mixing
supplied media as foundations for complete-video production. Phase 0's original
gate requirements remain in the archive and are not marked passed by this revision.

## Measures that matter for the full product

- Total cost per finished video minute, including AI generation, image preparation, rendering, and human labor.
- AI-generated video seconds per finished minute and the quality gained from those seconds.
- Percentage of complete videos produced unattended and minutes of manual editing or repair required.
- Technical completion rate and visual defects by shot treatment.
- Editorial quality and motion variety across a complete video, rather than isolated clips alone.

The archived Phase 0 gates describe the earlier experiment. In particular, its 80%
clip acceptance without repair is not the same as the longer-term goal of
producing a complete video without manual editing.
