import type {
  CompositionPhysicalProofHold,
  MotionLintDiagnostic,
  ResolvedCompositionQualityPolicy,
} from "./quality-policy.ts";
import type { CompositionQualityFrame } from "./quality-samples.ts";

function capturedFrameSignature(
  frame: CompositionQualityFrame,
  proof: CompositionPhysicalProofHold,
  at: number,
): string | undefined {
  const row = proof.frames[at - proof.start];
  const plate = frame.layers.get(proof.layer);
  const pair = plate?.state.media?.pair;
  if (
    !row ||
    !plate?.onScreen ||
    !plate.fullyOnScreen ||
    !pair ||
    pair.first !== at - proof.start ||
    pair.mix !== 0
  )
    return undefined;
  // Replace only the advancing sequence ordinal with its verified captured PNG identity.
  const paint = JSON.parse(plate.signature) as unknown[];
  const media = plate.state.media!;
  const normalized = JSON.stringify(
    paint.map((item) =>
      Array.isArray(item) &&
      item.length === 3 &&
      item[0] === media.asset &&
      item[1] === media.sourceHash
        ? [media.asset, media.sourceHash, row.plateSha256]
        : item,
    ),
  );
  const [backgrounds, signatures] = JSON.parse(frame.signature) as [
    unknown,
    string[],
  ];
  return JSON.stringify([
    backgrounds,
    signatures.map((signature) =>
      signature === plate.signature ? normalized : signature,
    ),
  ]);
}

/** Captured physical evidence can explain a static proof, never an incorrect media clock or moving paint. */
export function classifyPhysicalProofHolds(
  frames: readonly CompositionQualityFrame[],
  policy: ResolvedCompositionQualityPolicy,
  diagnostics: MotionLintDiagnostic[],
) {
  const windows = (policy.physicalProofHolds ?? []).map((proof) => {
    const signatures = proof.frames.map((row) =>
      capturedFrameSignature(frames[row.frame]!, proof, row.frame),
    );
    const stationaryIntervals: { start: number; end: number }[] = [];
    let start = proof.start;
    for (let index = 1; index <= proof.frames.length; index++) {
      const prior = proof.frames[index - 1]!;
      const current = proof.frames[index];
      if (
        current &&
        current.physicalSha256 === prior.physicalSha256 &&
        current.plateSha256 === prior.plateSha256 &&
        signatures[index] !== undefined &&
        signatures[index] === signatures[index - 1]
      )
        continue;
      if (
        signatures[index - 1] !== undefined &&
        proof.start + index - start > 1
      )
        stationaryIntervals.push({ start, end: proof.start + index });
      start = proof.start + index;
    }
    return {
      id: proof.id,
      purpose: proof.purpose,
      start: proof.start,
      end: proof.end,
      evidenceSha256: proof.evidenceSha256,
      stationaryIntervals,
      measuredFrames: signatures.filter((signature) => signature !== undefined)
        .length,
      humanReview: "required" as const,
    };
  });
  for (const finding of diagnostics) {
    if (finding.code !== "frozen-pixels" && finding.code !== "frozen-run")
      continue;
    const start = Math.max(0, finding.frames[0] - 1);
    const end = finding.frames[1] + 1;
    const purposes = windows.filter((window) =>
      window.stationaryIntervals.some(
        (interval) => interval.start <= start && interval.end >= end,
      ),
    );
    if (!purposes.length) continue;
    finding.rawSeverity ??= finding.severity;
    finding.severity = "warning";
    finding.classification = "declared-physical-proof-hold";
    finding.proofPurposes = purposes.map(({ id, purpose, evidenceSha256 }) => ({
      id,
      purpose,
      evidenceSha256,
    }));
  }
  return windows;
}
