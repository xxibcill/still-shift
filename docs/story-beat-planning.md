# Purpose-led passage authoring

Still Shift now prepares complete narrated passages from an explicit JSON beat plan. Each beat records the idea to communicate, a compatible recipe template, focal subjects, evidence qualification, narration cues and intended intensity. Copy and event timing can change without changing renderer code.

This is the first implementation milestone following the Practical Motion Graphic Style Selection Guide review. It establishes reusable authoring and a passage review surface. It preserves the existing pictures and timing as a regression baseline; it does not claim that the continuous-motion rollout, new choreography, phone typography redesign or full-episode acceptance is complete.

## Working examples

| Plan                                                                                  | Source interval at 24 fps | Total frames | Delivery slices |
| ------------------------------------------------------------------------------------- | ------------------------- | -----------: | --------------- |
| [Resources](../benchmarks/fixtures/story-passages/resources.json)                     | 1940–3447 exclusive       |         1507 | 408 / 360 / 739 |
| [Comparison and access](../benchmarks/fixtures/story-passages/comparison-access.json) | 4748–5394 exclusive       |          646 | 334 / 312       |

Both plans reuse the same Unequal Margins template, with different durations, strain windows and qualifications. Five prepared templates capture the existing artwork, geometry, fonts and semantic recipe bindings. Tests compare nodes, animation tracks, connectors and source-frame boundaries against both original passage builders. The earlier builders remain as regression references and the existing `story:proof` command continues to work.

## Prepare and render

Use the pinned project toolchain and a new output directory for every run:

```sh
pnpm story:passage --plan benchmarks/fixtures/story-passages/resources.json \
  --output-dir benchmarks/results/resource-plan-review-v001 --prepare-only

pnpm story:passage --plan benchmarks/fixtures/story-passages/resources.json \
  --output-dir benchmarks/results/resource-plan-render-v001 \
  --narration /absolute/path/to/narration-mix-v003.wav

pnpm story:passage --plan benchmarks/fixtures/story-passages/comparison-access.json \
  --output-dir benchmarks/results/comparison-plan-silent-v001 --silent
```

Choose exactly one of `--prepare-only`, `--narration` or `--silent`. Preparation checks the plan, template graph, asset dimensions and hashes, pinned font hashes, references and timing before creating an output directory. Narrated export additionally requires the supplied audio bytes to match the plan's SHA-256 and cover its source interval. The command never substitutes a recipe or overwrites an existing directory.

Open the generated `index.html` locally or through the lab's local Vite server. Rendered reviews have a video, proportional beat timeline, current takeaway and clickable narration cues. Each beat exposes its evidence qualification and advisory quality findings. The review form downloads human ratings, notes, preparation time and repair count alongside the source-plan checksum. Blank measurements stay null.

## Authoring model

`story-passage-1` uses one fixed style identity (`layered-chronicle-1`) across the passage. This identifies the existing template family; it is not a new theme engine or an automatic visual-style compliance check. The renderer and historical recipe validators remain unchanged.

| Purpose                 | Compatible recipes                    |
| ----------------------- | ------------------------------------- |
| `compare`               | `unequal_margins`, `category_swap`    |
| `explain-relationships` | `relationship_build`                  |
| `explain-access`        | `access_constraint`                   |
| `qualify-evidence`      | `evidence_boundary`                   |
| `show-change`           | `dated_system_break`, `category_swap` |
| `resolve`               | `motif_resolve`                       |

This is an explicit selection table. The author chooses a template and the compiler verifies that its recipe can serve the declared purpose. Cinematic scenes, generated video and automatic script interpretation are outside this first contract.

Every beat has:

- `takeaway`, `purpose` and `focus`: the intended idea and existing node IDs that carry it.
- `template`: a prepared Story Motion JSON path, relative to the plan file. Assets and fonts resolve relative to that template.
- `frameCount`: an authoritative duration. Beats are contiguous; source starts derive from the plan's `sourceStartFrame`.
- `evidence`: kind, qualification and the text-node ID where that qualification appears. Supported claims also require a source reference. This records evidence context; it cannot verify the truth of a supplied claim.
- `copy`: optional replacements for ordinary text nodes. Stateful captions must be edited explicitly in the template so a replacement cannot silently disappear during a state change.
- `timing`: optional replacements for named recipe event windows. Change all related draw/arrival windows together when retiming choreography. Template fps must match; no implicit frame-rate conversion occurs.
- `cues`: editorial narration summaries, beat-local cue frames and the names of the recipe events they accompany. A cue more than six frames from its nearest event onset produces an advisory note. The reserved `@swap` and `@reset` references bind exact cuts; they cannot be retimed through `timing`.
- `intensity`: `quiet`, `develop` or `peak`. This labels editorial intent; it is not a measured motion-energy score.

Cue frames address displayed frames, from zero through `frameCount - 1`. Event endpoints also remain inside that interval. Beat and delivery ranges are half-open. Optional `delivery` slices must cover the whole passage exactly, with no overlap or gap; they need not align with explanatory beat boundaries.

The supplied phrases are summaries adapted from the existing cue ledger, not a fresh word-alignment pass. Changing narration requires updating its authority hash, cue frames and event timing together. Copy length, emphasis, historical meaning and readable composition still require visual review.

## Outputs and verification

Preparation writes an editable `source-plan.json`, a resolved `passage.json`, and individual `scenes/*.json`. The editable copy uses absolute template paths so it can be saved elsewhere and prepared again on this machine. The manifest retains the original input paths and hashes; reproduce on another machine from the repository plans and their relative references. Rendered output adds `passage.mp4`, individual scene clips, exact `delivery/*.mp4` slices, a poster, a sampled-frame sheet and `render-report.json`.

The exporter verifies decoded frame counts, frame rate, dimensions, full media decoding and the expected presence or absence of audio. It records measured preparation/rendering time. Human preparation time, repairs, comprehension and cost savings remain unmeasured until reviewed.

```sh
pnpm exec vitest run tests/unit/story-passage.test.ts tests/unit/story-proof.test.ts
pnpm test:browser:passage --renders benchmarks/results/resource-plan-render-v001
```

The browser test exercises boundary and backward seeks, narration-cue navigation, playback, a 390 px layout and review downloads. Its sample ratings are test data, not creative acceptance.

### Verification of this milestone

On 2026-09-26, Node 22.23.1 completed 213 unit tests and five integration tests. TypeScript, whole-project ESLint and formatting of the changed files passed. Browser checks passed for both narrated review pages, including cue and backward seeks, playback, 390 px overflow checks and review downloads. Desktop and phone captures were visually inspected.

| Local export                                                                                         | Frames | Verified delivery slices | Pipeline render time |
| ---------------------------------------------------------------------------------------------------- | -----: | ------------------------ | -------------------: |
| [Resource review](../benchmarks/results/story-beat-planning-resources-v001/index.html)               |   1507 | 408 / 360 / 739          |               38.1 s |
| [Comparison and access review](../benchmarks/results/story-beat-planning-comparison-v001/index.html) |    646 | 334 / 312                |               15.3 s |

Both exports verified the existing narration checksum, retained audio and passed full decoding. Times are single local runs including scene export, passage assembly, delivery slices and media checks; they are not a production throughput or cost benchmark. These generated reviews are ignored local artifacts. The committed plans and templates reproduce them. Visual inspection covered the review interface and sampled frames, not a continuous audiovisual or audience comprehension assessment.

## Next implementation steps

Use this planning and review path for the next visual pass on the resource passage. Extend continuous choreography and subject handoffs from the existing prototype, stage essential phone-size qualifications, and compare a complete narrated sequence. Keep the original timing and evidence invariants. Then use another script passage to measure authoring effort and determine which additional template is actually needed.

The representative corpus, full episode integration and cost gates remain open in the main roadmap.
