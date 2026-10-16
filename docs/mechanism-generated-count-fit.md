# Generated count fitting

Type-1 shared text fitting now measures the same reachable strings that typography
raster preparation uses. A two-decimal `1` → `2` count includes `1.00`, intermediate
values and `2.00`, even when the authored states contain only `1` and `2`.
`prepareTextFits` collects those values once, then chooses one size for the whole
animation. It preserves the input scene and the existing 10,000-string budget.
Ordinary legacy fitting and the numeric-binding-plus-fit contract rejection remain
unchanged. This does not add an implicit fitter to native composition authoring.

The saved reproduction used exact MS1 IBM Plex Semibold bytes, tabular figures,
61 frames at 30 fps and an 80-pixel box. Before the repair, fitting chose 96 px;
61 generated strings overflowed and raster preparation rejected the result. After
the repair it chooses 38 px and prepares all 63 authored/generated strings. Wide
fit stays at 96 px; the unfitted control stays at 16 px. Their fitted nodes, styles
and measured strings match the historical controls.

The final native proof checks all frames in forward, reverse and shuffled order,
stable reserved bounds, and two identical exports per case. Independent inspection
probes six actual streams and fully decodes 183 frames. Existing editorial and
commerce fit variants pass on both backends. Run `pnpm test:browser:mechanism-count-fit`
for the normal fixed-code proof; `--probe` is a historical-defect assertion mode
and is expected to fail after this repair.

[Evidence and retained attempts](./mechanism-shorts-ms2-count-fit-results.json)
record the staged runs, exact font identity, measurements, encoded checks and limits.
The six Thai stress strings and production-copy probes remain open. These software
checks do not imply human viewing acceptance or completion of MS2.
