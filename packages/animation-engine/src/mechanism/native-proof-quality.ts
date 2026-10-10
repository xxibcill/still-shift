import { createHash } from "node:crypto";
import {
  AnimationEngineError,
  type Composition,
  type MechanismEpisode,
  type NativeObservedOutputFrame,
} from "@still-shift/scene-contract";
import type { verifyNativeObservationClosure } from "@still-shift/execution-runtime/export";
import type { MotionLintDiagnostic } from "../../../renderer-core/src/composition/quality-policy.ts";
import { canonicalMechanismJson } from "../../../renderer-core/src/mechanism/canonical.ts";
import { mechanismOverlayLayerId } from "./overlays.ts";
import { compositionQualityFrame } from "../../../renderer-core/src/composition/quality-samples.ts";
import type { EvaluationOptions } from "../../../renderer-core/src/composition/evaluate/types.ts";

type Pixel = Parameters<
  NonNullable<Parameters<typeof verifyNativeObservationClosure>[0]["onFrame"]>
>[1];
type Quality = {
  status: "passed" | "failed";
  diagnostics: MotionLintDiagnostic[];
};
type Interval = { start: number; end: number };
export type NativePhysicalProofHold = {
  id: string;
  purpose: string;
  layer: string;
  start: number;
  end: number;
  measuredFrames: number;
  stationaryIntervals: Interval[];
  evidenceSha256: string;
  method: "verified-actual-native-state-and-accepted-pixel-body";
  humanReview: "required";
};
function fail(path: string): never {
  throw new AnimationEngineError(
    "SCENE_INVALID",
    "Native physical proof evidence differs from its complete declared shot",
    {
      diagnosticCode: "comp-native3d-proof-hold",
      stage: "mechanism-native-check",
      path,
    },
  );
}
const hash = (value: unknown) =>
  "sha256:" +
  createHash("sha256").update(canonicalMechanismJson(value)).digest("hex");

/** Streams actual rows; no classification is available until the complete closure is verified. */
export function createNativePhysicalProofChecker(
  episode: MechanismEpisode,
  composition: Composition,
  evaluation: EvaluationOptions,
) {
  const requests = episode.shots.map((shot) => ({
    id: shot.id,
    purpose: shot.purpose,
    layer: mechanismOverlayLayerId("plate", shot.id),
    start: shot.startFrame,
    end: shot.endFrameExclusive,
  }));
  if (
    !Array.isArray(composition.metadata?.nativePhysicalProofRequests) ||
    canonicalMechanismJson(composition.metadata.nativePhysicalProofRequests) !==
      canonicalMechanismJson(requests)
  )
    fail("metadata.nativePhysicalProofRequests");
  for (const request of requests) {
    const controller = composition.layers.find(
      (layer) => layer.id === request.layer,
    );
    if (
      controller?.type !== "native3d" ||
      controller.inPoint !== request.start ||
      controller.outPoint !== request.end
    )
      fail(`controllers.${request.layer}`);
  }
  const windows = requests.map((request) => ({
    ...request,
    measuredFrames: 0,
    stationaryIntervals: [] as Interval[],
    rows: createHash("sha256"),
    previous: undefined as string | undefined,
    runStart: request.start,
  }));
  let nextFrame = 0,
    finished = false;
  function closeRun(window: (typeof windows)[number], end: number) {
    if (end - window.runStart > 1)
      window.stationaryIntervals.push({ start: window.runStart, end });
    window.runStart = end;
  }
  return {
    onFrame(packet: NativeObservedOutputFrame, pixel: Pixel) {
      if (finished || packet.outputFrame !== nextFrame++)
        fail("observations.outputFrame");
      const window = windows.find(
        (request) =>
          packet.outputFrame >= request.start &&
          packet.outputFrame < request.end,
      );
      if (
        !window ||
        !packet.passes.length ||
        packet.passes.some(
          (pass) =>
            pass.observed.controller !== window.layer ||
            pass.observed.sourceFrame < window.start ||
            pass.observed.sourceFrame >= window.end,
        )
      )
        fail(`observations.frames.${packet.outputFrame}`);
      // Exclude sample ordinals, but keep every actual physical draw and code/source identity.
      const physicalSha256 = hash(
        packet.passes.map(({ observed }) => ({
          controller: observed.controller,
          scope: observed.scope,
          sourceSha256: observed.sourceSha256,
          effectiveSceneSha256: observed.effectiveSceneSha256,
          geometrySha256: observed.geometrySha256,
          appearanceCodeSha256: observed.appearanceCodeSha256,
          viewport: observed.viewport,
          camera: observed.camera,
          parts: observed.parts,
        })),
      );
      // A broken renderer must not turn authored caption/overlay motion into a hold.
      const expectedPaintSha256 = hash(
        compositionQualityFrame(composition, packet.outputFrame, evaluation)
          .signature,
      );
      const signature = canonicalMechanismJson({
        physicalSha256,
        expectedPaintSha256,
        pixel,
      });
      if (window.previous !== signature) closeRun(window, packet.outputFrame);
      window.previous = signature;
      window.measuredFrames++;
      window.rows.update(
        canonicalMechanismJson({
          frame: packet.outputFrame,
          physicalSha256,
          expectedPaintSha256,
          pixel,
        }) + "\n",
      );
      if (packet.outputFrame + 1 === window.end) closeRun(window, window.end);
    },
    finish<Report extends Quality>(
      verifiedManifestSha256: string,
      report: Report,
    ) {
      if (finished || nextFrame !== composition.frameCount)
        fail("observations.coverage");
      finished = true;
      const holds: NativePhysicalProofHold[] = windows.map(
        ({ rows, previous: _previous, runStart: _runStart, ...window }) => {
          if (window.measuredFrames !== window.end - window.start)
            fail(`observations.shots.${window.id}`);
          return {
            ...window,
            evidenceSha256: hash({
              verifiedManifestSha256,
              request: requests.find((request) => request.id === window.id),
              rowsSha256: "sha256:" + rows.digest("hex"),
            }),
            method:
              "verified-actual-native-state-and-accepted-pixel-body" as const,
            humanReview: "required" as const,
          };
        },
      );
      const diagnostics = report.diagnostics.map((finding) => {
        if (finding.code !== "frozen-run" && finding.code !== "frozen-pixels")
          return finding;
        const start = Math.max(0, finding.frames[0] - 1),
          end = finding.frames[1] + 1;
        const purposes = holds.filter((hold) =>
          hold.stationaryIntervals.some(
            (interval) => interval.start <= start && interval.end >= end,
          ),
        );
        return purposes.length
          ? {
              ...finding,
              rawSeverity: finding.rawSeverity ?? finding.severity,
              severity: "warning" as const,
              classification: "declared-physical-proof-hold" as const,
              proofPurposes: purposes.map(
                ({ id, purpose, evidenceSha256 }) => ({
                  id,
                  purpose,
                  evidenceSha256,
                }),
              ),
            }
          : finding;
      });
      return {
        ...report,
        diagnostics,
        status: diagnostics.some((finding) => finding.severity === "error")
          ? ("failed" as const)
          : ("passed" as const),
        nativePhysicalProofHolds: holds,
      };
    },
  };
}
