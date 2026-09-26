# Six prepared illustrated scenes

These are reusable scene-contract examples and creative proofs, outside the frozen corpus. Regenerate their JSON after changing the layout builder:

```bash
pnpm illustrated:prepare
pnpm illustrated:render --output-dir benchmarks/results/history-offstage-v2/my-review
```

Use a new output directory. The render script invokes the real `animate-scene` CLI for all six clips, extracts posters and motion sheets, then joins one 42-second review reel. Each scene is seven seconds at 24 fps; the contract also supports 30 fps and whole-frame durations from three to eight seconds.

Change paths, node geometry, text, and semantic role bindings to author another compatible scene. Asset paths resolve relative to the scene JSON. Hashes and dimensions identify exact source bytes; regenerate them when an asset changes. Required roles and authored alternate states are validated before export.

The [implementation guide](../../../docs/history-offstage-motion-implementation.md) explains architecture, limits, commands, and QA. The [asset record](../../../assets/history-offstage-v2/provenance.json) identifies original source pixels.
