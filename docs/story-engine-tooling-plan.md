# Story engine and authoring tools — implementation plan

- **Updated:** 2026-09-26
- **Status:** E1–E6 implemented and verified together; supported boundaries are recorded below and in the usage guide.
- **Baseline:** `adc374e` — `feat(story): add purpose-led passage planning and review`
- **Working branch:** `codex/story-beat-planning`

## Objective and scope

Improve Still Shift as a reusable, deterministic render engine for story-driven motion graphics. Make its existing capabilities easier to author, combine, debug, reuse and export.

The owner clarified this scope on 2026-09-26. This plan supersedes the earlier recommendation to polish a narrated resource passage or produce additional episode sequences in this task. Existing scenes and passages are regression fixtures. Small synthetic fixtures may be added to verify engine behavior; producing artwork, refining episode choreography, assembling S01E01 and obtaining creative acceptance are outside this work.

This is the engineering work tracker. The [main roadmap](../ROADMAP.md) retains broader release and episode history. E1–E6 are engineering milestones, distinct from the episode's M0–M6. No new release number or delivery date is assigned by this plan. Existing creative-review checkpoints remain recorded for their content work and do not block independent engine or tooling improvements that preserve those fixtures.

## Baseline before implementation

- [Passage contracts](../packages/scene-contract/src/story-passage.ts) and the [passage compiler](../packages/renderer-core/src/story-passage.ts) already support beat plans, template selection, exact durations, cue references and evidence qualifications.
- [Passage preparation](../scripts/story-motion/passage-files.ts) and [render orchestration](../scripts/story-motion/passage-render.ts) lived in scripts. Rendering concatenates independently rendered beats.
- Camera motion, choreography, text reveals, flows and deterministic evaluation already exist. See the [continuous engine implementation](./story-motion-continuous-implementation.md).
- [Lab story controls](../apps/lab/src/story-controls.ts) expose scene-level recipe timing and scene downloads. Passage editing and linked retiming were not yet available.
- [Quality analysis](../packages/renderer-core/src/story-quality.ts) already reports timing, text-size and motion findings. Extend these checks rather than replacing them with another analyzer.
- The baseline passage contract fixes one style identity and requires evidence metadata. Templates contain scene-specific assets, copy and geometry. Focus and intensity describe author intent; they do not automatically generate choreography.
- Existing batch infrastructure supports artifact hashing and retries. Passage rendering should reuse applicable mechanisms rather than create an unrelated job system.

See [purpose-led passage authoring](./story-beat-planning.md) for the baseline workflow and its recorded verification. Baseline test counts and measurements are historical evidence, not verification of future milestones.

## Milestone tracker

Status: `[ ]` planned, `[~]` in progress, `[x]` complete, `[!]` blocked with a recorded reason.

| ID  | Deliverable                                       | Depends on        | Status | Completion evidence                                                                                                               |
| --- | ------------------------------------------------- | ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Shared passage authoring module and event index   | Existing compiler | `[x]`  | [Shared interfaces](./story-engine-tooling.md#shared-interfaces), shared CLI/browser compilation and structured diagnostics       |
| E2  | Cue-based timing and safe retiming                | E1                | `[x]`  | [Timing contracts](./story-engine-tooling.md#timing-and-event-identity), linked network fixture and atomic editor tests           |
| E3  | Reusable templates, text roles and style profiles | E1–E2             | `[x]`  | [Template contracts](./story-engine-tooling.md#templates-styles-and-text), two-content/two-style tests and font/layout validation |
| E4  | Explicit continuity between beats                 | E1–E2             | `[x]`  | [Handoffs](./story-engine-tooling.md#handoffs), root-pose and camera-velocity checks, encoded join parity                         |
| E5  | Passage authoring and debugging in the Lab        | E1–E4             | `[x]`  | [Workbench](./story-engine-tooling.md#open-the-workbench), editing/undo/save/reload and desktop/phone browser checks              |
| E6  | Incremental rendering and regression checks       | E1–E5             | `[x]`  | [Render workflow](./story-engine-tooling.md#render-preview-and-resume), cache/cancellation/resume/media verification              |

The owner requested all six milestones as one integrated implementation. Implementation is recorded in `2907a6f` (contracts/compiler), `84db091` (render jobs/cache) and `6a5e7be` (Lab/browser checks) on `codex/story-beat-planning`. `adc374e` remains the earlier baseline.

## First implementation slice

**Deliverable:** Move a narration cue once, update every explicitly linked animation correctly, inspect conflicts, and export the same evaluated result from the Lab and CLI.

- [x] Establish E1's shared interface, event index and structured diagnostics.
- [x] Implement E2's cue-relative timing and dependency resolution.
- [x] Add a minimal Lab control to move a cue, preview the resolved timing and save the plan.
- [x] Use a small fixture containing a linked connector draw, subject response and label reveal. Include conflicting and out-of-range variants.
- [x] Verify exact frame timing, unchanged locked passage boundaries, deterministic backward seeking, saved-plan round trips and preview/export parity.
- [x] Record commands, results, limitations and implementation references in this document before marking the slice complete.

The first slice is complete. The same workbench also includes the E3–E5 template, style, handoff and inspection controls.

## E1 — Shared passage authoring module

**Outcome:** CLI and Lab use one passage contract and compilation path.

- [x] Define a small shared interface for loading, validating, compiling and inspecting passages. Keep file access and export side effects behind the appropriate adapters; browser callers must not require Node filesystem imports.
- [x] Move reusable preparation and orchestration behavior out of command scripts into the existing packages where it belongs. Keep scripts as entry points and preserve existing commands.
- [x] Build a typed event index covering recipe events, choreography, camera keys, text reveals and explicit cuts. Define event identity, frame coordinates and timing ownership.
- [x] Return structured diagnostics with stable codes, severity, message and applicable beat, node, event and frame references.
- [x] Version new behavior explicitly and preserve existing scene formats and rendered behavior by default.

**Acceptance:** The same plan and resolved inputs produce identical compiled results and diagnostics through CLI and Lab. Existing fixture behavior remains compatible.

**Verification:** Shared-interface contract checks, missing/ambiguous event references, structured error locations and legacy compilation/render regressions relevant to the refactor.

## E2 — Cue-based timing and safe retiming

**Outcome:** Authors adjust timing through explicit relationships instead of manually coordinating individual windows.

- [x] Allow an event to reference a cue with an offset and duration while retaining explicit absolute timing for existing inputs.
- [x] Support declared dependencies such as starting after another event finishes. Reject missing references and dependency cycles.
- [x] Resolve linked entrances, moves, paths, text reveals and camera timing together. Retime only declared links; preserve authored independent timing.
- [x] Detect incompatible animations targeting the same property, impossible ordering and events outside a beat. Make edits atomic: invalid timing does not partially update the saved plan.
- [x] Keep integer frames authoritative. Document beat-local, passage-local and source-frame conversions, endpoint conventions, and explicit 24/30 fps conversion and rounding rules.
- [x] Preserve locked beat/passage boundaries. Reject an edit that cannot fit rather than silently clipping events or extending delivery duration.

**Acceptance:** Moving one cue updates its dependent events predictably and produces actionable errors for conflicts before rendering.

**Verification:** Linked-event retiming, dependency cycles, positive/negative offsets, property conflicts, exact cuts, locked durations and boundary cases at both supported frame rates.

## E3 — Reusable templates, text roles and style profiles

**Outcome:** Templates accept different subjects and styles without renderer changes.

- [x] Declare template slots for assets, text, subjects, relationships and timing parameters, including required values and compatibility constraints.
- [x] Add explicit text roles such as heading, label and qualification. Preserve legacy behavior while removing the need for new inputs to infer roles from font sizes.
- [x] Add versioned style profiles for fonts, colors, strokes, spacing and motion defaults, with documented override precedence.
- [x] Add text measurement, wrapping, overflow policies and output safe areas. Preview and export must share resolved layout and pinned font inputs.
- [x] Make evidence requirements selectable through a content policy while preserving the existing historical profile and its validation rules. Existing plans must not silently lose their safeguards.
- [x] Support template parameter changes in prepared outputs and manifests so rendered results remain reproducible and inspectable.

**Acceptance:** One template accepts two distinct content sets and two style profiles without renderer edits. Incompatible slots, missing fonts and text overflow produce clear diagnostics.

**Verification:** Parameter/role validation, deterministic text layout, style overrides, long-copy cases, profile compatibility and legacy fixture behavior. Use test assets; a new art kit is not required.

## E4 — Explicit continuity between beats

**Outcome:** The passage engine understands authored state handoffs as well as cuts.

- [x] Map persistent subject identities between beats and validate those references.
- [x] Declare whether each subject carries state, resets, enters or exits. Specify which state properties participate in a handoff.
- [x] Validate position, scale, opacity and camera continuity in defined coordinate spaces. Include camera endpoint/tangent behavior where supported.
- [x] Support intentional cuts and context resets as explicit operations; never infer them from story text.
- [x] Define transition ownership and timing so overlap does not silently shorten the passage or shift delivery slices.
- [x] Evaluate joins deterministically from absolute frame position, including backward seeks without prior playback.

**Acceptance:** A compact multi-beat fixture demonstrates a continuous subject/camera handoff and an intentional reset, both with exact total duration.

**Verification:** Frames immediately before/at/after each join, missing identity mappings, incompatible state transfer, explicit resets, duration invariants and preview/export parity.

## E5 — Passage authoring and debugging in the Lab

**Outcome:** Authors can edit Still Shift's contracts through a focused interface.

- [x] Load, validate and save passage plans with usable asset/template references and lossless round trips.
- [x] Display beat, narration-cue, event and camera tracks with clear frame coordinates.
- [x] Edit declared template parameters and linked timing with undo/redo; expose invalid edits without corrupting the valid preview.
- [x] Preview narration when supplied and seek across the passage using the shared evaluator.
- [x] Inspect an individual node's evaluated state at any frame.
- [x] Add optional bounds, anchors, safe-area and diagnostic overlays.
- [x] Jump from a diagnostic to the affected beat, frame and object.
- [x] Expose E3's parameters and E4's handoff declarations as those contracts become available.

**Acceptance:** An author loads a plan, changes a cue and template parameter, previews the result, undoes/redoes the changes and exports a reproducible plan without manually editing JSON.

**Verification:** Browser flows for editing, validation recovery, undo/redo, save/reload, cue seeking, diagnostic navigation and parity with CLI compilation. This remains a Still Shift authoring tool rather than a general-purpose video editor.

## E6 — Render iteration and regression tooling

**Outcome:** A small change requires only the necessary rendering work, with visible job state and trustworthy verification.

- [x] Reuse unchanged beat renders using identities that include resolved content, asset/font hashes, renderer version, style/layout settings and export options.
- [x] Account for continuity dependencies when invalidating cached beats; a changed incoming state must invalidate affected downstream renders.
- [x] Add beat/frame-range previews, progress reporting, cancellation and resumable jobs using applicable existing infrastructure.
- [x] Reassemble when only sequencing or audio changes and beat images remain valid. Verify narration inputs and prevent stale audio reuse.
- [x] Distinguish complete verified artifacts from interrupted/partial output. Resume only when request and artifact identities match.
- [x] Produce technical before/after comparisons and measured preparation, render, assembly and cache timings.
- [x] Integrate passage and continuous-motion regression coverage into normal project verification, with documented fixture preparation.

**Acceptance:** An unchanged retry reuses valid work; an isolated edit rerenders only affected beats; cancellation leaves recoverable state; cached and fresh renders produce equivalent decoded output under the pinned environment.

**Verification:** Cache hits and invalidation for text, assets, fonts, renderer/export settings, audio and handoffs; interrupted jobs; exact frame counts, frame rate, dimensions, audio presence/synchronization and complete media decoding. Record performance measurements before claiming an improvement.

## Engineering rules and completion criteria

- Reuse existing rendering primitives and validators. Add a module only when it hides meaningful shared behavior behind a small interface.
- Keep results deterministic from resolved inputs and absolute frame index. Preserve legacy output by default; make migrations and new behavior explicit.
- Distinguish hard correctness failures from configurable readability and motion advice. Pixel movement and heuristic warnings do not establish comprehension or storytelling quality.
- Preserve authored focus and intensity as intent unless an explicit, inspectable policy defines how they affect rendering.
- Use existing fixtures or compact synthetic scenes to verify engine behavior. Technical fixture work must not expand into episode production or a creative overhaul.
- Run targeted tests during implementation and the relevant broader project checks before completing an integrated milestone. Include browser and encoded-output checks whenever shared evaluation, layout or export changes.
- Keep original inputs and previous review outputs intact. Use fresh output directories until E6 supplies an explicit, validated resume path.
- Do not mark a milestone complete solely because code compiles or an MP4 exists. Its acceptance behavior and verification evidence must be recorded.

## Completion record — 2026-09-26

The [usage and contract guide](./story-engine-tooling.md) documents the delivered interfaces. The [machine-readable verification record](./review/story-engine-tooling/verification.json) records fixture hashes, measured renders and browser comparisons. Reproduce the checks with the commands in the guide.

- E1–E2: new versioned authoring contracts, shared compiler/IO, typed event index, explicit cue/event dependencies and structured failures. The network fixture links one cue to a connector, subject movement/visibility and label; negative timing, cycles, duplicate ownership and conflicting node properties are rejected.
- E3: declared content/asset/subject/relationship/timing slots, style profiles, explicit roles, pinned fonts and measured text boxes. The general policy permits nonhistorical work while legacy and historical evidence constraints remain enforced.
- E4: explicit cuts, resets and root-subject handoffs materialize incoming state in each prepared scene. Camera continuation checks endpoint position and actual velocity. Absolute seeking preserves the same joins without prior playback.
- E5: `/passage.html` loads plans, edits linked timing and parameters, exposes style/handoff controls, retains valid undo/redo, inspects state, displays overlays and downloads reloadable plans/workspaces. File imports use the same preparation path as the CLI.
- E6: verified beat caching, incoming-state invalidation, exact range/beat previews, progress, cancellation/resume and technical comparison reports. Cache and job locks reuse existing stale-process recovery. New authoring and existing continuous-motion browser checks are part of `pnpm test`.

Verification completed:

- TypeScript build, ESLint, corpus schema, project Prettier and Python Ruff lint/format checks passed. The Python checks were rerun with access to the existing uv cache after the sandbox blocked that cache read.
- 235 unit/integration tests passed across 47 files, including 13 authoring and four cache/recovery tests.
- The authoring browser suite passed nine preview/encoded-frame comparisons, including both joins; exact backward seeking; shared CLI/browser compilation; valid/invalid edits; undo/redo; plan/workspace round trips; playback; overlays; and 390 px layout.
- Fresh and cached 576-frame outputs decoded identically. A title edit rerendered only its beat. A 24-frame range spanning a join, cancellation/resume and narrated assembly passed media verification.
- Existing story QA passed 98 parity comparisons, 14 backward seeks, timing controls, phone layout, the 646-frame proof and 30 fps CLI export.
- Existing continuous-motion checks passed exact strip recomposition, complete text reveal equivalence and backward seeking.
- Existing export-worker QA passed 150 frames at 1080p, 90-frame transport equality, 2D fallback and failed-output cleanup.

Single local fixture measurements, including render/assembly verification:

| Request            | Frames | Render time | Cache behavior                |
| ------------------ | -----: | ----------: | ----------------------------- |
| Fresh              |    576 |     12.25 s | Three rendered beats          |
| Unchanged retry    |    576 |      2.12 s | Three reused beats            |
| One title edited   |    576 |      5.48 s | One rendered, two reused      |
| Range `[180, 204)` |     24 |      0.79 s | Two intersecting beats reused |
| Narration added    |    576 |      2.18 s | Three silent beats reused     |

These are individual local test runs, not a production throughput or cost benchmark. Preparation, beat work and assembly timings are retained separately in the verification record.

## Supported limits and remaining work

- This implementation retains 1920×1080 at 24/30 fps. Arbitrary output formats remain outside E1–E6.
- Text layout supports root text with pinned fonts and authored boxes. It checks wrapping, overflow and box safe areas; automatic spatial layout, animated collision detection and multilingual shaping policies need separate design.
- Continuity supports compatible root poses and camera projections. Arbitrary parent-space conversions, subtree/asset morphing and overlapping transitions are not implemented. Cuts and resets keep exact beat durations.
- Cold-cache range previews render complete intersecting beats before exact trimming. Exports reference local assets; workspace downloads embed templates but do not bundle binary files.
- Abruptly killed jobs can leave ignored attempt directories. Resume recovers stale locks and only uses verified outputs.
- Readability findings on reused fixtures remain advisory. Engine verification does not establish episode creative acceptance, historical accuracy, audience comprehension or Phase 0 cost gates.

A useful next engineering increment is portable workspace packaging with an explicit asset manifest, followed by broader authoring fixtures for nested continuity and output formats. Those extensions should have their own scope and acceptance tests; they are not silently included in the completed interfaces above.

## Work log and maintenance

| Date       | Milestone | Change                                                                            | Verification / evidence                                                                                                   | Next action                                         |
| ---------- | --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 2026-09-26 | Planning  | Recorded the owner's engine/tooling scope and E1–E6 plan.                         | Baseline `adc374e`; planning record only.                                                                                 | Implement the shared engine and authoring workflow. |
| 2026-09-26 | E1–E6     | Implemented all six milestones as an integrated feature in the existing worktree. | [Guide](./story-engine-tooling.md), [verification record](./review/story-engine-tooling/verification.json), checks above. | Scope the next engine increment separately.         |

Update this tracker when supported behavior changes. Keep implementation commits, reproducible commands, actual results and limits distinct from future plans. Do not treat unknown measurements as zero or technical test success as creative acceptance.
