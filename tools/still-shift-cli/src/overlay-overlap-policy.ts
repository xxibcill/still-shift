import type { MechanismEpisode } from "@still-shift/scene-contract";
import {
  checkMechanismOverlays,
  mechanismOverlayLayerId,
  type MechanismOverlayCheckOptions,
} from "../../../packages/animation-engine/src/mechanism/overlays.ts";

export const OVERLAP_RECOVERY_LIMITS = Object.freeze({
  targets: 1,
  candidates: 12,
  patches: 1,
  renders: 1,
});
const movableCodes = new Set([
  "mechanism-label-protected-region",
  "mechanism-label-overlap",
  "mechanism-label-offscreen",
]);
type Captures = Parameters<typeof checkMechanismOverlays>[1];

/** One measured target, deterministic bounded search, unchanged neighbors and a complete readable hold. */
export function planOverlayOverlapRecovery(
  episode: MechanismEpisode,
  captures: Captures,
  measurements: MechanismOverlayCheckOptions,
) {
  if (!measurements.textBounds || !Object.keys(measurements.textBounds).length)
    throw Error("Overlap recovery requires current measured glyph bounds");
  const before = checkMechanismOverlays(episode, captures, measurements);
  const located = before.findings.filter(
    (f) => movableCodes.has(f.code) && f.shot && f.label,
  );
  const targets = [
    ...new Map(located.map((f) => [f.shot + "/" + f.label, f])).values(),
  ];
  if (targets.length !== OVERLAP_RECOVERY_LIMITS.targets)
    throw Error("Overlap recovery requires exactly one located movable target");
  const target = targets[0]!;
  const shot = episode.shots.find((s) => s.id === target.shot)!;
  const label = shot.labels.find((l) => l.id === target.label)!;
  for (const kind of [
    "label",
    ...(label.qualification ? (["qualification"] as const) : []),
  ] as const) {
    if (!measurements.textBounds[mechanismOverlayLayerId(kind, label.id)]?.[0])
      throw Error(
        "Overlap recovery requires measured target and qualification glyph bounds",
      );
  }
  const originalNeighbors = before.findings.filter(
    (f) => f.shot !== shot.id || f.label !== label.id,
  );
  const candidates = [0.2, 0.5, 0.8]
    .flatMap((x) =>
      [0.15, 0.3, 0.45, 0.6].map((y): [number, number] => [
        Math.round(episode.output.width * x),
        Math.round(episode.output.height * y),
      ]),
    )
    .sort(
      (a, b) =>
        Math.hypot(a[0] - label.position[0], a[1] - label.position[1]) -
        Math.hypot(b[0] - label.position[0], b[1] - label.position[1]),
    );
  const trials = [];
  for (const position of candidates) {
    const proposed = structuredClone(episode);
    proposed.shots
      .find((s) => s.id === shot.id)!
      .labels.find((l) => l.id === label.id)!.position = position;
    const assessment = checkMechanismOverlays(proposed, captures, measurements);
    const targetFindings = assessment.findings.filter(
      (f) => f.shot === shot.id && f.label === label.id,
    );
    const neighbors = assessment.findings.filter(
      (f) => f.shot !== shot.id || f.label !== label.id,
    );
    const neighborUnchanged =
      JSON.stringify(neighbors) === JSON.stringify(originalNeighbors);
    const hold = assessment.holds.find(
      (h) => h.shot === shot.id && h.label === label.id,
    )!;
    const accepted =
      targetFindings.length === 0 &&
      neighborUnchanged &&
      hold.longestReadableFrames >= hold.requiredFrames;
    trials.push({
      position,
      accepted,
      targetFindings,
      neighborUnchanged,
      hold,
    });
    if (accepted)
      return {
        schemaVersion: "mechanism-overlay-recovery-plan-1" as const,
        target: { shot: shot.id, label: label.id },
        position,
        before,
        trials,
        limits: OVERLAP_RECOVERY_LIMITS,
      };
  }
  throw Error(
    "Bounded overlap recovery found no admissible position; no patch or render was performed",
  );
}
