# Composition and family schema contributions

Follow the repository [contribution guide](../CONTRIBUTING.md) for setup, branches,
PRs and local verification. New composition features start from `main` and their
PRs target `main`. `production` advances through reviewed release promotions and
urgent hotfixes; version tags preserve individual release checkpoints. Merge
released hotfixes back into `main` before the next regular release.

## Rendering and schema rules

New rendering features belong in `composition-1`: define their bounded contract,
pure evaluation, shared render-graph behavior and supported backends together.
Implement frame rendering through the composition evaluator and graph. Asset decoding, font
measurement, depth inference and recipe compilation happen during preparation.

The four family formats retain their existing visual vocabulary under Q2:

| Format                | Allowed changes                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `illustrated-scene-1` | Frozen entirely; retain compatibility through its adapter.                                    |
| `illustrated-scene-2` | Camera recipes that compile to existing composition features.                                 |
| `story-scene-1`       | Recipes, actions, presets and passage features that compile to existing composition features. |
| `commerce-scene-1`    | Recipes and component authoring that compile to existing composition features.                |

When a story or commerce addition needs a new visual capability, implement that
capability in `composition-1` first. Its family adapter can then compile the
story-level request to native layers, properties, constraints or effects. Local
content providers may prepare reusable primitives; a provider that runs an entire
family renderer would duplicate the family rendering path.

Preserve frozen CE0 hashes and their independent test-only legacy oracles. Verify
native output against the existing fixture's assigned tolerance, every evaluated
state and reverse seeks. Preview and export must use the same composition data;
record independent preview encodes, repeated exports and backend measurements.
Run the existing local pnpm verification commands. GitHub Actions stay disabled.

Use `composition-1` JSON or its TypeScript builder for custom visual work and mixed
native layers. Use story or commerce inputs when their recipes and reusable
components fit the task. Existing cinematic and legacy inputs remain readable by
their adapters. See the [user guide](./user-guide.md) and
[composition reference](./composition-reference.md) for authoring commands.
