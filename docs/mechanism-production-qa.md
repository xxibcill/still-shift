# Production QA facts

The native production executor replays the original native2 capture, reads selected
physical world-matrix/anchor scalars for every output frame, and executes bounded
declarative semantic rules. It also retains the current cue compiler's MS2
expected-state transition/event-order result, composition-state lint and cached-plate preview pixels/glyph bounds.
No supplied JavaScript is executed by a rule.

Invalid cue transitions can fail before a queue or native output exists. Both
CLI routes preserve the located invariant finding; the episode full report and
production failure record retain the rig, parts and expected interval when the
compiler supplies them. Event-order errors retain their exact path/frame without
invented physical ownership. Failed executor attempts keep the same optional
finding in durable history and fresh reports. These preflight findings do not
count as observed native collision or final-frame evidence. The helper admits
at most32KiB of passive location data and follows at most eight typed wrappers;
ordinary diagnostics remain available when no bounded location is supported.

Every product retains an immutable `qa-program.json` containing the actual authored
plan, selectors and registered definitions, including the built-in rule. Failed
products therefore keep their program after a later QA file change.

Current products retain immutable `qa-facts.json`, `qa-raw-warnings.json`,
`qa-warning-groups.json` and `qa-rendered-visual.json` artifacts. Fresh reuse/report checks recompute their
contents from current sources and the verified original capture; changing data
and recomputing declared file hashes does not authorize a different measurement.
The report bundle links current facts as `qualityEvidence`; compact episode rows
carry its path/hash. Handoffs link the same facts as `assets.qualityReport`.

## Rendered caption and overlay checks

Production QA verifies the cached export source, then renders its flat plate/overlay
composition on every output frame for preview pixels and measured glyph bounds.
It checks the source/video/export bindings and clock, requires cached sequence
content with no native bindings, and retains actual submission counters proving
zero new native3D calls. The original native capture remains the physical evidence.
`facts.warnings.rendered` links the bound `qa-rendered-visual.json`; the field is
optional for historical records. Raw/grouped warnings include current source-state
and measured cached-preview findings. Fresh reuse and report checks recompute
these derived artifacts, rather than accepting self-rewritten measurements.

Compiler captions declare their original words, sample-derived frame windows and
pinned narration as body text. Their canonical speech-source hash excludes unrelated
picture annotations and equivalent defaults; the complete project hash still binds
production inputs. Speech-following eligibility keeps the raw independent reading
budget visible and leaves listening review required. A partial final output frame
is allowed when every displayed frame starts within the unchanged audio source;
a missing final-frame sample still rejects. Speech is never lengthened for reading.

Clipped and short-visible-hold captions produce located preview findings. A layer
whose words differ from its source cue fails policy admission before rendering.
These checks measure preview glyphs and all-frame pixel changes. Encoded glyph
review, continuous audiovisual inspection and listening remain separate scopes.
See [current visual QA evidence](./mechanism-shorts-ms3-visual-qa-results.json).

## Optional registered plan

Pass `qaPath` alongside `familyPath`/`cuePath` to
`executor.createQueue(id, projects, manifestDirectory)`. The plan file is a
versioned, hashed dependency in the queue item. Its byte changes require a queue
revision with the exact previous manifest hash. Existing inputs without `qaPath`
use the built-in stationary-mount check.

An illustrative cable-tie selector plan follows. The range is an example of the
contract; choose an actual limit from the selected variant's evidence.

```json
{
  "schemaVersion": "mechanism-production-qa-plan-1",
  "measurements": [
    {
      "measurement": "strap.travel",
      "kind": "part-origin-distance",
      "part": "strap"
    }
  ],
  "registrations": [
    {
      "schemaVersion": "mechanism-semantic-registration-1",
      "id": "strap-range",
      "description": "Sampled origin distance from the first actual captured frame",
      "domain": "mechanical",
      "method": "sampled-numeric-range",
      "requireEveryOutputFrame": true,
      "rules": [
        {
          "measurement": "strap.travel",
          "range": [0, 1],
          "unit": "scene-unit",
          "rig": "ratchet",
          "parts": ["strap"],
          "relationship": null
        }
      ]
    }
  ],
  "warningBindings": []
}
```

Selectors support part matrix change, part-origin distance from the first
captured frame, and anchor separation. Matrix change uses
`maximum-matrix-component-delta`; distances use `scene-unit`. Unknown parts,
anchors, rigs, relationships, duplicate names and incompatible units reject
before traversal. Missing observed anchors yield a located missing-measurement
finding; they never become zero distance. The built-in mount rule is always
included and cannot be replaced by a custom registration.

Warning bindings may map a generated layer to a declared physical rig and parts.
Without such a binding, the report retains composition-layer ownership; it does
not invent a physical rig. Multiple animated contributors remain explicit.
Known inherited opacity/scale/velocity units are preserved; unknown diagnostic
units remain unspecified. Groups retain original rows, raw peak ownership,
child/part references and source-bound final-video frame links. A diagnostic
spanning multiple events keeps its original aggregate interval/peak. It is not
split into fabricated per-event measurements.

## Scope and limits

Current registered failures count toward unresolved mechanical failures and set
mechanical QA to failed. Source-state and measured cached-preview errors set sampled-visual QA to
failed. Successful individual checks retain whole mechanical/visual acceptance
as unreviewed. Analytic collision is not evaluated; sampled collision has only
the declared scalar rule's scope; continuous collision remains unreviewed.
Encoded glyphs, actual listening, factual truth and continuous playback require
their separate evidence and acceptance. A QA-only revision invalidates the prior
input/review binding even when the picture and native plates are unchanged.

The plan is at most64 KiB; facts/raw/groups are each at most8 MiB. The sampler
uses the existing10,000-sample/100,000-comparison/8 MiB data-capacity rules. Its
64 MiB retained scope and all source/process scopes share the caller's fixed
Node allowance. State-lint admission is2 MiB plus4 KiB per generated layer-frame,
capped at256 MiB, with100,000 layer-frames and2,048 raw warnings as prospective
ceilings. Insufficient shared allowance rejects before analysis. These admission
claims do not certify driver or physical host RSS.

A Node-capacity rejection is unavailable verification, not evidence of changed
artifact bytes. Queue/checkpoint reuse preserves sealed products and attempts and
returns the typed capacity error; native plate caches are not quarantined for
that reason. Reports retain raw prior reviews but make current verification
unavailable. Free unneeded consumer capacities before retrying.

Returned queue/report states retain their capacity in the supplied consumer. For
several calls sharing one parent, give each result a child `CompositionNodeMemory`
owner, consume or serialize the result, then dispose that child when the result is
no longer needed. Other owners and foreign leases stay active. The native proof
records stage states to files before retiring those result owners, and deliberately
pressures the same parent to verify that quota rejection cannot trigger rerendering.

Use `still-shift production schema --kind production-qa-plan` or
`production-qa-facts` for the current strict contracts. Generated
[capabilities](./mechanism-production-capabilities.md) expose the same limits.

## Ideal static force from captured geometry

The `static-moment-balance` selector calculates an ideal static result from the
original positioned native anchors, captured reference-part matrix and source
scene calibration. Its prescribed signed resistance stays in the pinned QA plan
and immutable program; it does not come from the spring return track.

Add a selector such as this to the plan's `measurements` array:

```json
{
  "measurement": "force.near",
  "kind": "static-moment-balance",
  "quantity": "required-force-newtons",
  "model": {
    "id": "near",
    "pivotAnchor": "lever.pivot",
    "applicationAnchor": "press.near",
    "referencePart": "model",
    "axis": [0, 0, 1],
    "forceDirection": [0, -1, 0],
    "resistingTorque": { "value": 10, "unit": "N*mm" }
  }
}
```

The quantities and rule units are `required-force-newtons` / `N`,
`signed-arm-meters` / `meter`, and `balance-residual-newton-meters` / `N*m`.
A plan admits at most 16 distinct model IDs. Repeated quantities may share an ID
only when their entire model definitions match. Each model is evaluated once per
captured output frame. All anchor/part references, direction declarations, scene
calibration, counts and units are checked before traversal.

Absent positioned anchors or an inadmissible balance produce missing measurements
and the registered rule's located `semantic-measurement-missing` finding. The
original frame link and complete model remain available in the facts/program.
Numeric corruption still rejects; no zero or substitute expected anchor is invented.

A QA-only model revision follows the existing pinned QA dependency contract;
geometry-capture reuse remains subject to the original source/cache verification.
The result assumes a fixed pivot/axis, rigid geometry and prescribed resistance.
It is a derived ideal force, not a measured peg rating. Individual sampled rules
leave whole mechanical, continuous, factual and listening review unreviewed.
See [the model API and assumptions](./mechanism-static-moment.md).
