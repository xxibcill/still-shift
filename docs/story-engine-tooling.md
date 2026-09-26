# Story engine and authoring tools

This extension adds reusable authoring and render-job tools above the existing Still Shift renderer. Production artwork and episode choreography are unchanged. Track scope and completion in the [E1–E6 plan](./story-engine-tooling-plan.md).

## Open the workbench

Use the pinned Node 22.23.1 / pnpm 10.29.3 toolchain:

```sh
pnpm lab
```

Open `http://127.0.0.1:4173/passage.html`. The default engine fixture contains three beats demonstrating linked timing, a declared subject handoff and an explicit reset. Load `benchmarks/fixtures/story-authoring/linked-network.json` to inspect one cue controlling a connector, subject response and label.

The workbench provides:

- Beat, cue, event and camera tracks with a shared playhead and exact frame coordinates.
- Cue-relative and event-relative timing controls; invalid edits retain the previous valid plan and preview.
- Declared template parameters, style controls and explicit subject/camera handoffs.
- Undo/redo, node-state inspection, authored bounds, origins, connector endpoints, safe-area and diagnostic overlays.
- Optional narration playback after checksum and duration verification.
- Plan and workspace downloads, and file imports of either format.

`Save plan` downloads the source plan for CLI preparation. Template references and supplied asset parameters are resolved to absolute paths. `Save workspace` additionally embeds the loaded template definitions for a local editing round trip. Assets and fonts are referenced, not embedded: these downloads use the current checkout's filesystem paths. Repository fixtures retain portable relative references. The local Lab serves only files inside its workspace; loading a file does not write it back to disk.

Legacy `story-passage-1` plans still load. Use **Enable linked authoring** to explicitly create a `story-passage-2` draft with the historical content policy. Existing inputs are never silently migrated or rewritten.

## Shared interfaces

The browser-safe renderer module exports `compileStoryPassage`, `inspectStoryPassage`, `locatePassageFrame`, `indexStoryEvents`, `convertStoryFrame` and `createPassageEditor`. The Node animation-engine module exports `readStoryPassage`, `prepareStoryPassageInput`, `writePreparedPassage` and `renderStoryPassage`. The older command scripts remain compatible entry points.

Compilation consumes a plan and a map of resolved templates. It performs no filesystem access and does not mutate templates. The Lab and CLI share the same compiler; the Node adapter resolves files and checks asset dimensions and hashes. The browser also verifies authoring asset/font hashes before previewing.

`inspectStoryPassage` returns either a compiled passage and advisory diagnostics, or structured errors. Diagnostics include a stable code, severity and applicable beat, node, event, frame or contract path. `createPassageEditor` commits edits only after successful compilation and keeps valid undo/redo history. The Lab additionally validates decoded assets and text layout before committing its edits.

## Timing and event identity

V2 beats retain `frameCount`, `copy`, `timing`, `cues`, `purpose`, `focus` and `intensity`. They add `parameters`, `bindings` and `handoff`. Focus and intensity remain authored intent; they do not silently generate movement.

An event uses its authored `cue` as its ID. An unnamed event uses a structural ID such as `@/recipe/moves/0/window` or `@/camera/keys/1`. The special IDs `@swap`, `@reset` and `@context` represent exact points. Structural IDs depend on template structure; named cues are preferable for reusable templates. The compiled event index records kind, affected nodes, path, interval and whether the endpoint is exclusive.

```json
{
  "bindings": {
    "land": {
      "anchor": { "type": "cue", "id": "land" },
      "offset": 0,
      "duration": 22
    },
    "land-arrives": {
      "anchor": { "type": "event", "id": "land", "edge": "end" },
      "offset": -10,
      "duration": 18
    }
  }
}
```

The compiler resolves dependencies, rejects cycles and missing references, and validates the resulting scene through the existing recipe/property conflict checks. A beat cannot assign both absolute timing and a binding to the same event. Template timing parameters supply defaults; explicit beat timing/bindings take precedence.

All values are integer frames. Cue frames and point events address displayed frames `0` through `frameCount - 1`. Ordinary animation windows end on displayed frames; flow windows retain their existing exclusive endpoint and may end at `frameCount`. Beat ranges, delivery slices and preview ranges are half-open. Point bindings require duration zero; animation windows require positive duration.

The frame mappings are:

```text
passage frame = beat start + beat-local frame
source frame  = sourceStartFrame + passage frame
```

No edit implicitly changes fps, beat duration or delivery boundaries. Template fps must match the plan. `convertStoryFrame(value, from, to)` is an explicit 24/30 fps conversion helper, using nearest-integer rounding with ties away from zero. It does not convert or stretch an entire plan automatically.

## Templates, styles and text

`story-template-1` wraps an existing scene with declared slots, text roles and layout boxes. Supported slot kinds are text, asset, subject geometry, connector relationship and timing. Unknown slots, missing required values and incompatible targets fail validation. Text slots bind ordinary text nodes; stateful captions continue to require explicit template authoring.

`story-style-1` declares an ID plus optional background, color substitutions, role-based typography, path stroke width, safe inset, line height and default easing. Fonts refer to pinned font IDs supplied by the template. New text roles are `heading`, `label`, `qualification` and `body`; legacy scenes retain their existing behavior.

Resolution order is template scene → declared roles/layout → style → template parameters → beat copy/timing/bindings → handoff. Authored easing takes precedence over profile defaults. Subject and relationship slots change explicit geometry and anchors; there is no inferred scene layout.

Text layout uses the same browser measurement and drawing code in preview and export, after loading verified fonts. It wraps on whitespace/newlines and reports oversized words or too many lines. An explicit `clip` policy is available; `error` is the default. This initial layout contract supports root text nodes with authored boxes, and validates those boxes against the safe inset. It does not provide automatic collision avoidance, translated layouts or animated occlusion proofs. Existing motion/text diagnostics remain advisory.

V2's `general` content policy permits omitted evidence metadata. The `historical` policy requires qualifications, and supported evidence requires a source reference. Supplied evidence is validated under either policy. The policy records evidence context; it does not fact-check claims.

Resolved authoring scenes opt into `authoringVersion: "1"` and renderer version `story-canvas-0.15.0`. Legacy renderer versions and output behavior remain available.

## Handoffs

Each incoming beat explicitly declares `cut`, `continue` or `reset`. Subject mappings declare a persistent identity, outgoing/incoming node IDs and `carry`, `reset`, `enter` or `exit` behavior.

- `carry` transfers the selected root-node pose properties: position, scale, rotation and opacity. It requires matching node type, dimensions, origin and camera projection.
- `reset` uses the incoming authored state. `enter` requires the incoming subject to begin invisible. `exit` requires the outgoing subject to finish invisible.
- Camera carry transfers the outgoing position and actual endpoint velocity after easing and monotonicity limiting. Incompatible incoming keys fail with a diagnostic rather than silently changing the velocity.

Carry currently supports root-node poses, not arbitrary parent-space conversion, child-subtree state or asset morphing. A carried pose is materialized in the prepared scene, so seeking needs no previous playback and render cache identities include incoming state. Cuts and resets preserve the full beat durations. No overlapping transition or crossfade is inserted automatically.

## Render, preview and resume

```sh
# Prepare a plan and diagnostics without rendering.
pnpm story:passage --plan benchmarks/fixtures/story-authoring/linked-comparison.json \
  --output-dir benchmarks/results/authoring-prepared-v001 --prepare-only

# Render a complete silent passage with a reusable beat cache.
pnpm story:passage --plan benchmarks/fixtures/story-authoring/linked-comparison.json \
  --output-dir benchmarks/results/authoring-render-v001 --silent

# Preview a range that crosses a beat boundary.
pnpm story:passage --plan benchmarks/fixtures/story-authoring/linked-comparison.json \
  --output-dir benchmarks/results/authoring-range-v001 --silent \
  --start-frame 180 --end-frame 204

# Resume the same render request after cancellation or interruption.
pnpm story:passage --plan benchmarks/fixtures/story-authoring/linked-comparison.json \
  --output-dir benchmarks/results/authoring-render-v001 --silent --resume
```

Use `--beat <id>` instead of a frame range to preview one beat. Ranges render or reuse only intersecting beats, then trim the assembled output exactly; they do not change the original animation's timing. A cold-cache range preview still renders those complete beats. Outputs currently retain the existing 1920×1080 contract at 24 or 30 fps.

Use `--narration <file>` instead of `--silent` when the file matches the plan's narration identity. `--cache-dir <path>` selects a cache location; the default is the ignored `benchmarks/results/passage-cache` directory. `--compare-with <render-report.json>` adds a technical comparison of frame count, fps, dimensions, encoded checksum, changed/reused beats and measured timing. It does not rate visual quality.

Cache identity includes resolved scene content and incoming state, asset/font hashes, renderer source identity, toolchain information, actual Node/browser/FFmpeg versions and encoder settings. Source placement and filesystem relocation alone do not invalidate a beat. Audio changes reassemble the output while retaining valid silent beat renders. A reused clip must pass checksum and media verification.

Each render job records status and completed beats in `render-job.json`; progress is emitted on stderr. SIGINT/SIGTERM cancel active export work and leave a resumable job. Job/cache locking reuses the batch infrastructure, including stale-process recovery. Only verified artifacts become cache entries. Output copies are published atomically, and assembly occurs in an isolated temporary directory.

`--resume` requires the same request identity. Changed plans or renderer identities need a fresh output directory; reusable beat cache entries still apply where their identities match. Previous source files and review outputs are not overwritten by ordinary runs.

## Verification

The [comparison fixture](../benchmarks/fixtures/story-authoring/linked-comparison.json) and [network fixture](../benchmarks/fixtures/story-authoring/linked-network.json) are engineering examples built from existing assets. They are not proposed episode edits.

```sh
pnpm exec vitest run tests/unit tests/integration
pnpm test:browser:passage:authoring
pnpm test:browser:story
pnpm test:browser:story:continuous
```

The authoring browser suite produces temporary renders, desktop/phone captures and `verification.json`. It checks exact encoded frames, fresh/cached decoded equality, isolated invalidation, range export, cancellation/resume, narration reuse, preview/export parity across joins, backward seeking, cue/parameter edits, invalid-edit recovery, undo/redo, workspace round trips and 390 px overflow. Unit tests additionally exercise schema errors, timing cycles, fps boundaries, camera velocity, content policies, text overflow and recovery from an abruptly killed lock owner.

Both the authoring browser suite and existing continuous-motion checks are included in the normal `pnpm test` sequence. Completion evidence and remaining limits are recorded in the [implementation tracker](./story-engine-tooling-plan.md).

### Recorded result — 2026-09-26

The [verification record](./review/story-engine-tooling/verification.json) captures 235 passing unit/integration tests across 47 files, the authoring browser checks, 98 existing story parity comparisons and the continuous-motion regression results. New authoring preview/export parity passed at nine frames, including both joins. Fresh and cached 576-frame outputs decoded identically.

The local fixture took 12.25 seconds for a fresh render, 2.12 seconds with all three beats cached, and 5.48 seconds after a title edit invalidated only its beat. A 24-frame range crossing a join took 0.79 seconds from cache; adding narration reused all three silent beat clips. These are single local measurements, not production throughput or cost claims. Separate preparation, beat and assembly timings are retained in the record.

Implementation commits `2907a6f`, `84db091` and `6a5e7be` contain the engine, rendering and workbench changes. The record identifies the earlier baseline separately.
