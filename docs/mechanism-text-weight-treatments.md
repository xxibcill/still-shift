# Explicit text weight treatments

A weight emphasis event or `text-emphasize` intent preset can specify
`weightTreatment: "genuine-weight"`, `"outline"`, or `"auto"`. The field is valid
only for weight emphasis. Omission preserves the legacy automatic behavior.

```json
{
  "id": "contact-weight",
  "node": "caption",
  "span": "contact",
  "verb": "emphasize",
  "manner": "weight",
  "weightTreatment": "genuine-weight",
  "amount": 150,
  "at": 10,
  "duration": 20
}
```

Genuine weight interprets `amount` as a positive `wght` axis delta (default 150).
Every targeted font run must have enough headroom for the complete request.
A static font, a maximum-weight instance or insufficient headroom yields an
unavailable inspection receipt and a located `text-weight-unavailable` compilation
error. Explicit genuine weight never becomes an outline or clamps the request.

Outline interprets `amount` as stroke pixels, limited to 40. Its omitted amount
retains the legacy node-size default (`resolved base size * 0.014`). It always
compiles a stroke, including when a variable font axis is available. The event's
color, or the node color when omitted, supplies that stroke.

Automatic treatment retains the original base-plus-all-spans font decision, axis
clamping, and numeric defaults. Explicit treatments inspect the selected span or
all painted style runs. A base style fully covered by spans across all authored
text states does not constrain an explicit whole-node request. A painted static
run still prevents genuine whole-node weight. Coverage includes the initial text
as well as every authored state. Generated count strings can exceed their endpoint
lengths, so whole-node counts conservatively retain the base font until shared
generated-string coverage can prove it unused. Selected-span requests retain their
explicit scope. This does not adopt count+fit or alter legacy counting.

```ts
import {
  inspectTextWeightTreatments,
  StorySceneSchema,
} from "@still-shift/scene-contract";

const source = StorySceneSchema.parse(authoringJson);
const report = inspectTextWeightTreatments(source);
```

Call inspection on validated authoring input before compilation. The companion
`text-weight-treatments-1` report includes original event index/ID, node/span,
resolved frame window, requested and resolved treatment, units, requested and
resolved amount, headroom, status/reason and each targeted font's declared asset
identity and axis instance/range. A declared font weight and the axis instance are
recorded separately: axis headroom uses the authored style axis or the variable
range default, matching the renderer's existing behavior. Inspection is pure and
does not add receipts to the compiled scene or change its pixel/cache inputs.

Font identities in this report are authoring declarations. Actual font-byte,
axis/cut verification remains the existing loading and MS1 identity workflow.
The report does not replace it. Release continues through the existing animator
weight envelope; end states and backward evaluation pass the focused pose tests.

The schema is available through `episode schema --kind text-weight-treatments`
and [the generated JSON schema](./schemas/mechanism/text-weight-treatments.schema.json).
[Slice45 evidence](./mechanism-shorts-ms2-text-weight-results.json) records the
software checks. Pinned-font raster/encoded treatment comparisons, natural English
spacing and complete MS2 typography acceptance remain pending.
