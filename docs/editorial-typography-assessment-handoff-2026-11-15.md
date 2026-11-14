# Editorial typography for video: assessment and handoff

Date: 2026-11-15

## Context and goal

The owner shared a [conversation about typography on fashion videos](https://chatgpt.com/share/6af88288-cde0-83ec-8470-8c6b5da18aad) and asked whether Still Shift can do it. The conversation describes an AI-assisted system for designing attractive **editorial title overlays** and kinetic typography on video. The examples were described there as bold serif plus script, layered vintage typography, and minimal italic serif. The owner wants more than generic AI output, including original designs when references are scarce.

The shared conversation proposes turning design principles into a design grammar; generating diverse candidates; rendering them on the real footage; evaluating hierarchy, composition, readability, motion and harmony; and refining or selecting candidates with human input. It also discusses font and typesetting controls, typography and motion principles, video-aware placement, Thai text, and a structured design specification. Treat its suggested architecture and priorities as ideas to evaluate, not as established Still Shift features or approved requirements.

## Conclusions so far

**Still Shift is a promising programmable rendering and composition foundation, but the proposed end-to-end AI title designer is not established as an existing feature.** The assessment was based on the local development checkout, not a fresh audit of the published package. No prototype, render, new implementation, or tests were performed for this discussion, and aesthetic quality has not been demonstrated.

The current documentation describes native video and text layers; supplied, checksummed fonts; styles and spans; font metrics, wrapping and measured fitting; tracking and leading; supported variable-font axes; masks and effects; and keyframed typography animation by glyph/cluster, word or line. Existing lint and specimen workflows can identify some reading-time, framing, contrast and motion issues, subject to their documented scope and measurement limitations. Sources: [user guide](user-guide.md), [typography engine](typography-engine.md), [composition reference](composition-reference.md), and [media guide](composition-media.md).

### Why typography-aware layout was assessed as partial

Still Shift can use authored parameters to measure, wrap, fit and render text. An author can combine multiple separately styled layers. That does not by itself decide which words deserve emphasis, pair fonts, build a balanced arrangement across layers, or adapt the design to a moving subject. For example, creating a convincing layout for “3 Brown Outfits” still requires decisions about the scale and role of each phrase, placement, overlap, timing and relationship to the footage. Existing lint can flag measurable risks; it does not establish visual taste.

Additional work proposed in the discussion, not yet verified as a product plan:

- Curated, licensed fonts and metadata; exact-copy glyph-coverage checks and font identity.
- A measured multi-layer layout system that can adapt structures such as stacked, asymmetric and intentional overlap to different copy, rather than relying on fixed coordinates.
- A design grammar and constraints for hierarchy, font compatibility, proportion, spacing, treatment and motion, with room for creative variation.
- Analysis of relevant frames throughout the title's visibility to account for subjects, video movement, background contrast and platform UI. Intentional overlap should remain possible.
- Candidate generation, deterministic render, measurable diagnostics, visual review, refinement and human selection; possible longer-term preference learning.

Existing controls should be reused when they suffice; these ideas do not imply that every piece needs a new native engine feature. The precise interface and feasibility need investigation.

## Known cautions and open questions

- The [typography motion plan](typography-motion-engine-plan.md) records an observed exact-copy font-coverage gap and source-audited risks involving finer Thai segmentation, script-sensitive tracking and mixed-size masks. It distinguishes observed failures from risks to reproduce. Do not claim Thai animation is universally broken or validated. Use actual copy, font bytes and rendered output to verify.
- The same plan excludes text on a path and per-character 3D extrusion from that scope. Check current source and later evidence before declaring feature availability.
- Existing measured fitting and diagnostics have specific scope; do not assume automatic fitting for arbitrary native multi-layer compositions, comprehensive video-aware contrast analysis, or that lint guarantees a good design.
- The shared conversation's sample JSON is illustrative, not the Still Shift schema. Font IDs in it are examples, not verified assets. Any adopted font must cover the copy, be pinned, and be suitable for the intended use.
- Determine which runtime is intended: this checkout and a published or consumer-pinned package may differ. The checkout was on `codex/roadmap-reconciliation` at HEAD `e6eb7b06` when assessed, with substantial pre-existing uncommitted work; the development log notes a later published 0.2.0 release elsewhere. Recheck rather than assume equivalence.
- Reference images were described in the shared conversation; no original assets or rights were verified during this assessment. Do not promise a close reproduction or visual quality without seeing and reviewing actual assets.

## Suggested next step

Investigate one small, representative proof: a real supplied video, exact title, and available fonts, rendered as three meaningfully different editorial treatments. Review multiple frames over the title's entrance, hold and exit, including at phone viewing size. Record what required manual decisions, what existing tools could validate, and which defects justify new work. If suitable footage, copy, or fonts are not available, inventory existing authorized fixtures and prepare a concrete prototype plan without inventing assets or claiming results.

Separate technical checks from human aesthetic acceptance. A passing render, lint, or AI score is not proof of a good design. The owner has not approved a particular design architecture or requested a release in this discussion.

## Repository and spending constraints

Read the current repository instructions and [development log](dev-log.md) before working. Preserve unrelated dirty edits. GitHub Actions are prohibited; use local checks. Before any ElevenLabs action that spends credits, show the project, action, model/voice, take count and estimated total cost (or disclose uncertainty), and obtain explicit approval for that batch. Do not treat this handoff or a general request to continue as spending approval. No ElevenLabs generation is necessary for the proposed visual proof.

The ready-to-use continuation instruction is [the Opus handoff prompt](editorial-typography-opus-handoff-prompt-2026-11-15.md).
