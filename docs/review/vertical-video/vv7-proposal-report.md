# Vertical story proposal trial

The VV7 proposal was generated for every template referenced by the two existing story passage plans. It was applied only in memory for this trial; the landscape source fixtures were not changed. Each proposed vertical passage compiled, then `lintVertical` inspected its resolved scenes over every frame.

| Passage                  | Templates | Proposed node patches | Vertical compilation | Lint issues |   Node instances requiring manual reflow |
| ------------------------ | --------: | --------------------: | -------------------- | ----------: | ---------------------------------------: |
| `comparison-access.json` |         2 |                    23 | 2 beats passed       |           4 |              2 (`pressure-b`, `route-b`) |
| `resources.json`         |         4 |                    39 | 4 beats passed       |           4 | 3 (`bridge-note`, `limit`, `pressure-b`) |

No manual edits were applied to either existing plan. Five node instances across the plans still need review (four distinct IDs). `pressure-b` and `route-b` move outside the vertical frame during existing landscape recipe motion; each also produces a relationship overflow diagnostic. The two small focal groups in `resources` need a larger authored layout. These are advisory proposal results, so no source override is accepted automatically.

The durable authored fixture `story-authoring/vertical/linked-network.json` and its template compiled in vertical format and returned **zero** vertical lint issues. Its original landscape template returned seven issues when run through the generic proposal, showing why an authored pass remains useful.

`lintVertical` reports the first offending frame per node and issue type. Focal subjects smaller than 96 output pixels on their shorter axis are flagged. Configured safe zones require `textLayout` boxes with `overflow: "error"` for vertical text and infer visible image, rectangle and group subjects when no focus list is present. No platform safe-zone rectangle is built into the proposal.
