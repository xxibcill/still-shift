# Production episode and cohort report command

Run one command against an existing durable native production queue:

```sh
pnpm still-shift production report \
  --manifest /absolute/path/queue.json \
  --output-dir /absolute/path/queue-output \
  --report /absolute/path/fresh-report.json
```

The compact JSON response includes episode rows and cohort categories: first-pass
technical completion, failures, authoring availability, setup/routine/render
p50/p95 and each QA dimension's review counts. It stays within32,768 bytes and100
items. `--offset` and `--limit` page the deterministic combined rows. Every response
links one complete report containing all episode reports, original attempts,
current dispositions, retained reviews, prior product/cache-failure references and
cohort rows. The report file must be fresh; omitting `--report` creates a private
temporary report. The command never executes or retries jobs.

The report reader acquires the existing queue lock and checks manifest/journal
binding, complete declared dependency pins, immutable product seals, checkpoint
attempts and actual artifact bytes. Review and token evidence must name verified
owned product artifacts. When code/profile matches, the native verifier rechecks
current compilation/captures/output and completely decodes RGBA/PCM. Dependencies,
artifacts, manifest and journal are checked again around verification. A changed
or missing per-item input/output becomes a located stale exception and invalidates
all effective reviews for readiness; original records stay accessible. Other items
continue. A malformed or changed global journal rejects the command.

Pending, running, failed, cancelled and interrupted attempts remain visible.
Unattempted or unfinished first attempts leave the cohort target unavailable.
Unreviewed dimensions remain unreviewed. Missing durations/tokens remainnull;
setup and routine measurements stay separate. The percentile method is linear
interpolation at(n−1)×p. Current-product timings describe current products; prior
product timing records stay linked. First-pass statistics retain original attempts.
These statistics do not establish admission of the ten frozen pilot explanations.

The public API is
`readMechanismProductionReports(manifestPath, outputDirectory, executor, options)`.
An embedding caller supplies the current executor identity and verifier; the CLI
uses the actual native adapter. Per-item scopes retire. Report results reserve
64MiB in the unchanged shared Node allowance and transfer to a supplied parent
until its disposal; standalone return data is caller-owned. Complete report bytes
are capped at8MiB. These are declared admission limits, with no physical RSS claim.

Discover the actual implemented limits or export a schema:

```sh
pnpm still-shift production discover --report /absolute/path/capabilities.json
pnpm still-shift production schema --kind production-report-bundle \
  --output /absolute/path/report.schema.json
```

Schemas include queue/state, episode/cohort/bundle, QA and semantic registrations.
The generated [capability reference](./mechanism-production-capabilities.md) uses
the same registry as machine discovery. General asset imports and preview/export
formats remain in existing episode/family discovery. Three native families remain
candidates. Review metadata is a declaration; actual human playback, listening,
facts, whole mechanics and pilot acceptance require their separate evidence.
