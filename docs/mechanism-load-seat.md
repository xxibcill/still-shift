# Force-driven load seating

`mechanism-scene-2` admits a `load-seat` rig with one force writer and two coupled
rigid parts. It supplies the reusable behavior foundation for E06. The separate
patent-specific two-tooth pawl, flexible hinge/web, frame stop and native contact
proof are still required; no asset or episode is admitted by this rig alone.

The source declares `movingPart`, `reactionPart`, `referencePart`, orthonormal
`reactionAxis`/`normalAxis`, a reference-space `pivot` and coincident neutral
`contactPoint`, `maxForceNewtons`, `complianceMetersPerNewton`, `maxTravelMeters`
and signed `seatingAngleRadians`. A control has exactly one scalar writer:

```json
{
  "type": "load-seat",
  "loadNewtons": {
    "keys": [
      { "frame": 0, "value": 0, "easing": "smoothstep" },
      { "frame": 30, "value": 10, "easing": "hold" }
    ]
  }
}
```

Narrated cue controls accept the same force writer with supplied-audio cue/sample
references. Missing controls establish zero additional load; force and interval
limits are checked before sampling. Evaluation is deterministic across seeks.

For uniform reference scale `r`, compliance `C`, and unscaled geometric travel
`L`, the model uses `stopTravelMeters = L*r` and
`displacementMeters = min(loadNewtons*C, stopTravelMeters)`. Rotation follows the
same travel fraction. World travel is converted to reference coordinates using
`scene.units.scaleToMeters*r`. The moving-body normal translation conserves the
declared neutral contact plane; the reaction body's axial translation keeps that
contact point coincident. At the hard stop, further load leaves both poses fixed
and adds `stopReactionNewtons = loadNewtons - stopTravelMeters/C`.

`maxTravelMeters` specifies geometry at unit reference scale. Prescribed compliance
remains in physical meters per newton when the assembly is uniformly scaled.
Positive uniform reference ancestry, rotation and translation are supported.
Nonuniform reference scale rejects with a located error. Coupled bodies must be
independent descendants of their reference; conflicting writers and independently
moving intermediate parents reject. Each body has exactly one physical writer.

Frame results distinguish `unloaded`, `seating` and `stopped`, and retain the load,
physical displacement, stop length, angle, two reference-space translations and
stop reaction. Metadata neutral values and diagnostic poses interpret the scalar
as newtons. Source3's existing rigid-only rig subset remains unchanged and rejects
this new kind; no fallback is substituted.

This is a declared linear compliance plus geometric stop law, not a measured
plastic/material/contact solver. The source patent establishes the qualitative
load path and stops; it supplies no calibration for this illustrative law.
Factual geometry, tooth contact, force-to-motion direction, stop engagement,
nonpenetration and original native observations need their own E06 evidence.
Whole mechanical, continuous, factual, design and listening reviews remain separate.
