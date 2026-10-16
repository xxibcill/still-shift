# Production semantic assertions and warning evidence

The engine exports `MechanismSemanticRegistry`,
`checkMechanismProductionTimeline` and `groupMechanismProductionWarnings`.
Their current engineering proof is retained in
[the MS3 semantic record](./mechanism-shorts-ms3-semantic-results.json).
Durable queue/report/handoff integration remains in progress.

A registry accepts immutable, versioned JSON registrations describing scalar
measurement ranges, units, controlling rigs, parts and relationships. Each
registration has a stable ID and the registry has a canonical content hash.
Execution accepts ordered unique output-frame samples with measurement values,
raw evidence references and the current input/output/code/profile binding.
Missing values fail; registrations requiring every output frame fail incomplete
coverage. Empty sparse input remains unreviewed. Results preserve all admitted raw
samples, located failures, method and exact scope. A caller must derive and verify
measurements against the named artifacts; this pure evaluator does not read them.

Registrations execute finite scalar comparisons. Limits are32 registrations,
16 rules each,10,000 samples,128 measurements per sample and100,000 total
comparisons. JSON data capacity is8MiB; failure capacity is checked before each
append and the completed result is checked again. Hooks/accessors/cycles and
nonfinite values reject through the existing public JSON admission counter.
These are declared data/work bounds, with no physical RSS or wall-clock promise.

The implemented method is `sampled-numeric-range`. Collision measurements stay
sampled even with every output frame present. Analytic collision and continuous
collision require separate implemented methods and evidence; neither is established
by a sampled pass. Registrations accept no supplied JavaScript or callback.

The timeline wrapper runs existing MS2 legal-transition/event-order and required
relationship checks at output frames and exact event boundaries. It retains the
original located failure and source/timeline identities. It preflights at most
10,000 output frames and2,000,000 frame/event × part/rig/relationship/vertex work
units. Failure checked-frame counts remain0 because the existing compiler does
not expose a trustworthy partial-progress count. This expected-state method
supplies no GPU, between-frame collision or human acceptance.

Warning grouping accepts at most2,048 raw lint rows and an8MiB data capacity.
Each row declares its controlling rig, event interval, measurement unit, physical
parts and artifact-specific bad-frame references. Inclusive raw lint frames become
half-open grouped intervals. Connected intervals merge only within the same
rig/event/event-interval/code/unit; clean gaps remain separate. The group retains
the maximum measured value and its original raw index, all affected children and
parts, severity, every raw diagnostic detail and bad-frame reference. Units are
explicit because a lint ratio, opacity alpha and displacement are different values.
The caller verifies the raw lint and image references before publishing a report.

The retained actual proof revalidates original native plates and checks mount
world-matrix constancy over60 captured output frames for each of the three
families. Three derived frame30 delta0.1 controls fail and keep separate seeded
input evidence. Dependency, product and capture hashes are checked, with runtime
identity unchanged during the check. This is a scoped mount-sampling result;
other mechanics, collisions, playback, factual accuracy, listening and the ten
original pilot explanations remain open.
