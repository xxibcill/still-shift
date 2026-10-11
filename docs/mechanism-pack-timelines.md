# Authored mechanism pack timelines

`compileMechanismPackTimeline(instance, document)` accepts a versioned
`mechanism-pack-timeline-1` document. It declares an initial state, named states
with required relationships, legal event transitions, ordered events and the
existing version 2 rig controls. The generated [JSON Schema](./schemas/mechanism/pack-timeline.schema.json)
describes its structural limits; compilation checks references and physical state.

Every state requirement names a rig and relationship from the pack. A signed-gap
requirement may narrow the scene relationship's permitted range. For example,
`{ rig: "slider", relationship: "hook.innerRange", signedGap: [0, 0] }`
requires contact, rather than accepting any displacement within hook travel.
Scene-wide required relationships remain mandatory in every state.

Transitions explicitly declare `from`, `to` and `event` (`contact`, `release`,
`return` or `reset`). This permits different mechanism-specific state graphs.
The first event must establish `initialState` at frame zero with kind `initial`.
Subsequent events must strictly increase, remain inside the output interval, and
match a declared transition. A contact/release/return cycle can declare:

```json
[
  { "from": "ready", "to": "touching", "event": "contact" },
  { "from": "touching", "to": "free", "event": "release" },
  { "from": "free", "to": "returned", "event": "return" }
]
```

A release from `ready` then fails at the authored event with the pack, rig,
relationship, parts and first failing interval. Requirement failures identify the
state requirement and failing sample interval. The existing whole-interval rig
validator also rejects conflicting writers, invalid return transitions, hard-stop
violations and release on a non-releasable ratchet variant.

Compilation checks every integer output frame plus exact fractional event
boundaries in time order. It retains a frozen declaration and identity receipts,
not all evaluated frame bodies. `sampleMechanismPackTimeline(instance, compiled,
frame, { width, height })` evaluates arbitrary fractional or reverse seeks, checks
the active state's requirements, and returns the state, event, rig request and
expected frame. Pass its request controls into the native layer's `rigControls`.
State lookup and rig evaluation do not depend on previous playback. Source or
timeline identity changes require recompilation.

The bounded contract permits 64 states, 128 transitions, 128 requirements per
state, and the existing mechanism frame/key limits. It adds no paid audio action.
These receipts are **pure expected-state evidence**. Discrete compilation does
not prove every continuous-time point; requested fractional samples are checked
when sampled. The live family fixture checks four dimension variants and the
same compiled controls used by actual native previews and exports. Independent
GPU receipt validation and rendered-frame QA retain their own responsibilities.

This interface does not yet compile supplied narration cues into picture,
annotation, caption or sound tracks. Those MS2 requirements, whole-resource
accounting, pack support promotion, final installed verification and MS3 pilot
acceptance remain open. See [MS2 results](./mechanism-shorts-ms2-results.json).
