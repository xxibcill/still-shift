# H03 real-product proof ledger

This runbook closes the technical evidence path for [Commerce M5](ecommerce-motion-adoption-plan.md#delivery-milestones). The repository's H03 sample is a **fictional technical fixture**. It proves that the verifier can reconcile source, scene, sidecar and decoded video; it does not prove authorization, real-product quality, operator effort or publication readiness. No approved real-product photo and copy are bundled here.

## Inputs and preparation

For the first real H03 proof, obtain one authorized product-in-hand photograph with clear copy space, the approved headline and CTA, the product image source and permission record, and copy approval references. Record who provided each approval and where the records can be retrieved. Use `commerce-brief-1` with `selection: {"kind":"format","id":"H03"}` and the desired profile. Keep `product.imagePath` relative to the brief. Keep `product.provenance` and `copy.source` specific to the approved material; a path or generic word like “approved” alone is not an approval record.

Start the **asset-preparation stopwatch** when the operator first inspects the received photo for H03. Stop when the photo is ready for the brief, including any crop, cutout, retouch or protected-label-region marking. Record elapsed active minutes, excluding waiting for external feedback. If no edits are needed, record `0`, not `null`. Keep the original authorized image and the final prepared image with the approval record.

Create the brief, then prepare and render to new paths:

```bash
pnpm still-shift prepare-commerce \
  --brief /absolute/path/approved-h03.brief.json \
  --output /absolute/path/proof/h03.scene.json

pnpm still-shift animate-scene \
  --scene /absolute/path/proof/h03.scene.json \
  --output /absolute/path/proof/h03.mp4
```

Preparation records the exact brief SHA-256 in the scene. Keep that brief with the final export; if it changes, prepare and render a new scene. The proof verifier requires this binding for real-product evidence. Older fictional fixtures without the binding are checked by rebuilding their complete scene from the supplied brief.

The **export wall time** comes from `h03.mp4.result.json`; it is measured by the export worker and includes rendering and encoding. Do not substitute a hand-timed command duration. The ledger also records encode-path, validation, frame-render-average and FFmpeg CPU times from that sidecar. The CLI checks the scene and dependency hashes, the MP4 hash and byte count, and decoded dimensions, frame rate and frame count with `ffprobe -count_frames`.

Start the **repair stopwatch** only after the first complete preview or MP4 review reveals an issue. Count active minutes spent on changes to the prepared image, brief or scene and on rechecking those changes. Count each distinct repair round. Record `repairMinutes: 0` and `repairCount: 0` if the first version needs no repair. Keep the first export and every repaired export separately; the final ledger points at the selected export. Record defects against that selected export; `[]` means it was inspected and none were found, while `null` means inspection has not happened.

## Operator review record

Write a `commerce-proof-review-1` JSON file beside the final export. Supply external product authorization and copy approval references; the verifier records these references but cannot independently adjudicate rights or copy approval. Replace the nulls with measured observations when each review step is complete:

```json
{
  "schemaVersion": "commerce-proof-review-1",
  "recordedBy": "Operator name",
  "productAuthorizationReference": "approval system / record ID",
  "copyApprovalReference": "approval system / record ID",
  "assetPreparationMinutes": null,
  "repairMinutes": null,
  "repairCount": null,
  "defects": null,
  "creativeReview": null,
  "nextTechniqueDemand": null
}
```

Defects use `{ "frame": 120, "category": "product-fidelity", "description": "...", "repaired": false }`. Categories are `product-fidelity`, `copy`, `layout`, `timing`, `encoding` and `other`. A creative review uses `{ "reviewer": "...", "decision": "pass", "notes": "..." }` or `decision: "revise"`. For M5's next-technique decision, record an actual request as `{ "techniqueId": "T02", "requestedBy": "...", "productionNeed": "..." }`. Keep it null until production demand exists; the historical T02 candidate is not evidence of demand.

Review the decoded MP4 at normal speed, pause at the entrance, hold and CTA close, and check the exact product, label, colors and crop against the approved image. Check headline and CTA wording against the approved copy, line breaks and text bounds, protected-label clearance, phone-size readability, timing of reading holds, and encoded audio/video defects. Record every observed defect with a frame number and repair status. The creative reviewer makes the quality decision; the ledger's `releaseDecision` stays `null` because technical verification does not authorize publication.

Generate the ledger only after selecting the final MP4 and its matching sidecars:

```bash
node --import tsx scripts/commerce-proof-ledger.ts \
  --kind real-product \
  --brief /absolute/path/approved-h03.brief.json \
  --scene /absolute/path/proof/h03.scene.json \
  --result /absolute/path/proof/h03.mp4.result.json \
  --video /absolute/path/proof/h03.mp4 \
  --review /absolute/path/proof/h03.review.json \
  --output /absolute/path/proof/h03.proof-ledger.json
```

The ledger's `technicalStatus: "verified"` means the supplied files reconcile. `measurementStatus: "recorded"` means asset preparation, repair, defect inspection and creative review have been recorded; it does not mean the creative review passed or that rights were independently verified. Missing any of those observations keeps `measurementStatus: "pending"`. `nextTechniqueDemand` is independent: leave it `null` when no production request has been documented, including when the other measurements are complete. A null demand field does not justify selecting a new technique.

Retain the brief, original and prepared product images, approval references, prepared scene, final MP4, `.mp4.scene.json` render manifest, `.mp4.result.json` result sidecar, review JSON, proof ledger and timecoded review notes/screenshots. The ledger contains SHA-256 hashes and paths for the principal generated artifacts. Preserve earlier exports separately when repair was required.

## Technical-only fixture check

To verify the command with the repository's fictional H03 material, first render its prepared scene to a fresh directory and use `--kind fixture` without `--review`:

```bash
mkdir -p /tmp/still-shift-h03-fixture-proof
pnpm still-shift animate-scene \
  --scene benchmarks/fixtures/ecommerce-motion/h03-landscape.json \
  --output /tmp/still-shift-h03-fixture-proof/h03.mp4
node --import tsx scripts/commerce-proof-ledger.ts \
  --kind fixture \
  --brief benchmarks/fixtures/ecommerce-motion/h03-landscape.brief.json \
  --scene benchmarks/fixtures/ecommerce-motion/h03-landscape.json \
  --result /tmp/still-shift-h03-fixture-proof/h03.mp4.result.json \
  --video /tmp/still-shift-h03-fixture-proof/h03.mp4 \
  --output /tmp/still-shift-h03-fixture-proof/h03.proof-ledger.json
```

This ledger is labeled `fictional-technical-fixture`; manual prep, repair, defect, creative and demand fields remain `null`. Use a new output directory on a rerun because the renderer and proof command preserve existing files.
