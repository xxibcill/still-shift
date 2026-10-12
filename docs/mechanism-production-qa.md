# Production QA facts

The native production executor replays the original native2 capture, reads selected
physical world-matrix/anchor scalars for every output frame, and executes bounded
declarative semantic rules. It also retains the current cue compiler's MS2
expected-state transition/event-order result and advisory composition-state lint.
No supplied JavaScript is executed by a rule.

Every product has immutable `qa-facts.json`, `qa-raw-warnings.json` and
`qa-warning-groups.json` artifacts. Fresh reuse/report checks recompute their
contents from current sources and the verified original capture; changing data
and recomputing declared file hashes does not authorize a different measurement.
The report bundle links current facts as `qualityEvidence`; compact episode rows
carry its path/hash. Handoffs link the same facts as `assets.qualityReport`.

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
mechanical QA to failed. Advisory state-lint errors set sampled-visual QA to
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

Use `still-shift production schema --kind production-qa-plan` or
`production-qa-facts` for the current strict contracts. Generated
[capabilities](./mechanism-production-capabilities.md) expose the same limits.
