import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  MechanismEpisodeSchema,
  type NativeObservedOutputFrame,
  type NativeObservedFrame,
} from "@still-shift/scene-contract";
import { createNativePhysicalProofChecker } from "../../packages/animation-engine/src/mechanism/native-proof-quality.ts";
import { mechanismOverlayLayerId } from "../../packages/animation-engine/src/mechanism/overlays.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import type { MotionLintDiagnostic } from "../../packages/renderer-core/src/composition/quality-policy.ts";

const sha = "sha256:" + "a".repeat(64);
const controller = mechanismOverlayLayerId("plate", "shot");
const matrix = (x = 0): NativeObservedFrame["camera"]["worldMatrix"] => [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  x,
  0,
  0,
  1,
];
async function fixture() {
  const episode = MechanismEpisodeSchema.parse({
    schemaVersion: "mechanism-episode-1",
    id: "episode",
    revision: 0,
    scene: "source",
    font: "font",
    output: { width: 32, height: 32, fps: 30, frameCount: 12 },
    dependencies: [
      { id: "source", type: "scene", path: "source.json", sha256: sha },
      { id: "font", type: "font", path: "font.ttf", sha256: sha },
    ],
    shots: [
      {
        id: "shot",
        purpose: "Observe fixed contact",
        startFrame: 0,
        endFrameExclusive: 12,
        labels: [],
      },
    ],
    captions: [],
  });
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "proof",
    width: 32,
    height: 32,
    fps: 30,
    frameCount: 12,
    assets: [
      {
        id: "source",
        type: "native3d",
        path: "source.json",
        sha256: sha,
        format: "solid-scene-1",
      },
    ],
    layers: [
      {
        id: controller,
        type: "native3d",
        asset: "source",
        sourceStartFrame: 0,
        sourceFps: 30,
        inPoint: 0,
        outPoint: 12,
      },
    ],
    metadata: {
      nativePhysicalProofRequests: [
        {
          id: "shot",
          purpose: "Observe fixed contact",
          layer: controller,
          start: 0,
          end: 12,
        },
      ],
    },
  });
  const packet = (frame: number): NativeObservedOutputFrame => ({
    version: "native3d-observed-output-frame-1",
    outputFrame: frame,
    executionSha256: sha,
    passes: [
      {
        sampleIndex: 0,
        sampleFrame: frame,
        observed: {
          version: "native3d-observed-frame-1",
          frameKey: "sample-" + frame,
          controller,
          scope: "proof",
          scopeFrame: frame,
          sourceFrame: frame,
          sourceSha256: sha,
          effectiveSceneSha256: sha,
          geometrySha256: sha,
          appearanceCodeSha256: sha,
          viewport: [0, 0, 32, 32],
          camera: {
            worldMatrix: matrix(),
            viewMatrix: matrix(),
            projectionMatrix: matrix(),
            near: 0.1,
            far: 100,
            aspect: 1,
            fovDegrees: 60,
          },
          parts: {
            root: {
              localMatrix: matrix(),
              worldMatrix: matrix(),
              localVisible: true,
              inheritedVisible: true,
            },
          },
          anchors: {},
          pass: { completed: true, calls: 1, triangles: 1 },
        },
      },
    ],
  });
  const evaluation = {
    preparedNative3D: {
      source: await prepareNative3DScene(
        nativeSolidFixture(),
        nativeFixtureHash,
      ),
    },
  };
  return { episode, composition, packet, evaluation };
}
function report() {
  const diagnostic = (
    code: "frozen-run" | "frozen-pixels",
  ): MotionLintDiagnostic => ({
    code,
    severity: "error",
    frames: [1, 11],
    measured: 11,
    nodes: [],
    path: "layers",
    message: "Unchanged comparisons exceed existing six-frame limit.",
  });
  return {
    status: "failed" as const,
    diagnostics: [diagnostic("frozen-run"), diagnostic("frozen-pixels")],
  };
}
const pixel = {
  transport: "png_pipe" as const,
  byteLength: 128,
  transportBytesSha256: sha,
};
describe("closure-bound native physical proof holds", () => {
  it("retains frozen pixel errors when the current recipe expects a moving screen caption", async () => {
    const f = await fixture();
    f.composition.assets.push({
      id: "font",
      type: "font",
      path: "font.ttf",
      sha256: sha,
      weight: "600",
    });
    f.composition.layers.unshift({
      id: "caption",
      type: "text",
      text: "Observe contact",
      fontAsset: "font",
      fontSize: 8,
      color: "#ffffff",
      transform: {
        anchor: [0, 0],
        position: {
          keys: [
            { frame: 0, value: [2, 12] },
            { frame: 11, value: [12, 12] },
          ],
        },
      },
    });
    const evaluation = {
      ...f.evaluation,
      textBounds: { caption: [{ left: 0, top: 0, right: 16, bottom: 8 }] },
    };
    const checker = createNativePhysicalProofChecker(
      f.episode,
      f.composition,
      evaluation,
    );
    for (let at = 0; at < 12; at++) checker.onFrame(f.packet(at), pixel);
    const raw = report(),
      result = checker.finish(sha, raw);
    expect(result.status).toBe("failed");
    expect(result.diagnostics).toEqual(raw.diagnostics);
    expect(result.nativePhysicalProofHolds[0]!.stationaryIntervals).toEqual([]);
  });

  it("requires complete declared actual rows and preserves raw errors as reviewable proof-hold warnings", async () => {
    const f = await fixture(),
      checker = createNativePhysicalProofChecker(
        f.episode,
        f.composition,
        f.evaluation,
      );
    const raw = report();
    expect(() => checker.finish(sha, raw)).toThrow(/complete declared shot/);
    for (let at = 0; at < 12; at++) checker.onFrame(f.packet(at), pixel);
    const result = checker.finish(sha, raw);
    expect(result.status).toBe("passed");
    expect(raw.diagnostics.every((row) => row.severity === "error")).toBe(true);
    expect(result.diagnostics).toEqual(
      raw.diagnostics.map((row) => ({
        ...row,
        severity: "warning",
        rawSeverity: "error",
        classification: "declared-physical-proof-hold",
        proofPurposes: [
          {
            id: "shot",
            purpose: "Observe fixed contact",
            evidenceSha256: result.nativePhysicalProofHolds[0]!.evidenceSha256,
          },
        ],
      })),
    );
    expect(result.nativePhysicalProofHolds[0]).toMatchObject({
      measuredFrames: 12,
      stationaryIntervals: [{ start: 0, end: 12 }],
      method: "verified-actual-native-state-and-accepted-pixel-body",
      humanReview: "required",
    });
    expect(() => checker.finish(sha, raw)).toThrow(/complete declared shot/);
  });
  it.each(["camera", "part", "code", "pixels"] as const)(
    "retains frozen errors when actual %s changes inside the interval",
    async (field) => {
      const f = await fixture(),
        checker = createNativePhysicalProofChecker(
          f.episode,
          f.composition,
          f.evaluation,
        );
      for (let at = 0; at < 12; at++) {
        const packet = f.packet(at),
          observed = packet.passes[0]!.observed;
        let body = pixel;
        if (at === 6) {
          if (field === "camera") observed.camera.worldMatrix = matrix(0.001);
          if (field === "part")
            observed.parts.root!.worldMatrix = matrix(0.001);
          if (field === "code")
            observed.appearanceCodeSha256 = "sha256:" + "b".repeat(64);
          if (field === "pixels")
            body = {
              ...pixel,
              transportBytesSha256: "sha256:" + "b".repeat(64),
            };
        }
        checker.onFrame(packet, body);
      }
      const result = checker.finish(sha, report());
      expect(result.status).toBe("failed");
      expect(result.diagnostics.every((row) => row.severity === "error")).toBe(
        true,
      );
      expect(result.nativePhysicalProofHolds[0]!.stationaryIntervals).toEqual([
        { start: 0, end: 6 },
        { start: 7, end: 12 },
      ]);
    },
  );
  it("rejects changed/missing declarations, wrong controllers, incorrect cuts and noncontiguous coverage", async () => {
    const f = await fixture();
    const changed = structuredClone(f.composition);
    changed.metadata!.nativePhysicalProofRequests = [];
    expect(() =>
      createNativePhysicalProofChecker(f.episode, changed, f.evaluation),
    ).toThrow(/complete declared shot/);
    const missing = structuredClone(f.composition);
    delete missing.metadata!.nativePhysicalProofRequests;
    expect(() =>
      createNativePhysicalProofChecker(f.episode, missing, f.evaluation),
    ).toThrow(/complete declared shot/);
    const cut = structuredClone(f.composition);
    cut.layers[0]!.outPoint = 11;
    expect(() =>
      createNativePhysicalProofChecker(f.episode, cut, f.evaluation),
    ).toThrow(/complete declared shot/);
    for (const mutate of [
      (packet: NativeObservedOutputFrame) => {
        packet.outputFrame = 1;
      },
      (packet: NativeObservedOutputFrame) => {
        packet.passes[0]!.observed.controller = "wrong";
      },
      (packet: NativeObservedOutputFrame) => {
        packet.passes[0]!.observed.sourceFrame = 12;
      },
      (packet: NativeObservedOutputFrame) => {
        packet.passes = [];
      },
    ]) {
      const checker = createNativePhysicalProofChecker(
          f.episode,
          f.composition,
          f.evaluation,
        ),
        packet = f.packet(0);
      mutate(packet);
      expect(() => checker.onFrame(packet, pixel)).toThrow(
        /complete declared shot/,
      );
    }
  });
  it("never classifies unrelated findings or comparison intervals extending outside an actual stationary run", async () => {
    const f = await fixture(),
      checker = createNativePhysicalProofChecker(
        f.episode,
        f.composition,
        f.evaluation,
      );
    for (let at = 0; at < 12; at++) checker.onFrame(f.packet(at), pixel);
    const raw = report();
    raw.diagnostics[0]!.frames = [1, 12];
    raw.diagnostics[1]!.code = "reading-time";
    const result = checker.finish(sha, raw);
    expect(result.status).toBe("failed");
    expect(result.diagnostics).toEqual(raw.diagnostics);
  });
});
