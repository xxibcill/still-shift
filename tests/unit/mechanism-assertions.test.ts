import { beforeAll, describe, expect, it } from "vitest";
import type { MechanismScene } from "@still-shift/scene-contract";
import { MechanismSceneSchema } from "@still-shift/scene-contract";
import {
  prepareMechanismScene,
  evaluateMechanismFrame,
  type MechanismFrameRequest,
} from "@still-shift/renderer-core";
import {
  createTapeHookScene,
  createTapeHookShots,
} from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  checkMechanismFrames,
  type MechanismEvidenceFrame,
} from "../../packages/animation-engine/src/mechanism/assertions.ts";

let scene: MechanismScene;
beforeAll(() => {
  scene = createTapeHookScene();
});
function row(
  source = scene,
  frame = 10,
  contactMode: "free" | "pull" | "push" = "pull",
  travel = 0.5,
): MechanismEvidenceFrame {
  const request: MechanismFrameRequest = {
    frame,
    width: 1080,
    height: 1920,
    controls: { slider: { contactMode, travel } },
  };
  return {
    shotId: "proof",
    request,
    frame: evaluateMechanismFrame(prepareMechanismScene(source), request),
  };
}
function changeMatrix(value: readonly number[], index: number, delta: number) {
  const changed = [...value];
  changed[index]! += delta;
  return changed as unknown as MechanismEvidenceFrame["frame"]["parts"][string]["localMatrix"];
}
function transformedScene(): MechanismScene {
  const authored = structuredClone(scene);
  const model = authored.parts.find((part) => part.id === "model")!;
  model.parent = "ancestor";
  model.transform = {
    position: [3, -2, 4],
    rotation: [0.18, 0.4, -0.32],
    scale: [1.8, 0.7, 1.2],
    pivot: [0.4, -0.3, 0.8],
  };
  authored.parts.push({
    id: "ancestor",
    visible: true,
    transform: {
      position: [-5, 6, 2],
      rotation: [-0.3, 0.2, 0.5],
      scale: [0.9, 1.4, 1.1],
      pivot: [0.2, 0.8, -0.1],
    },
  });
  return MechanismSceneSchema.parse(authored);
}

describe("independent authored mechanical evidence", () => {
  it("checks every E01 source frame against independently composed authored controls", () => {
    const prepared = prepareMechanismScene(scene);
    const rows: MechanismEvidenceFrame[] = createTapeHookShots().flatMap(
      (shot) =>
        Array.from(
          { length: shot.endFrameExclusive - shot.startFrame },
          (_, offset) => {
            const request: MechanismFrameRequest = {
              frame: shot.startFrame + offset,
              width: 1080,
              height: 1920,
              controls: shot.controls,
              hiddenParts: shot.hiddenParts,
              ...(shot.camera ? { camera: shot.camera } : {}),
              ...(shot.cameraKeys ? { cameraKeys: shot.cameraKeys } : {}),
            };
            return {
              shotId: shot.id,
              request,
              frame: evaluateMechanismFrame(prepared, request),
            };
          },
        ),
    );
    expect(rows).toHaveLength(696);
    expect(checkMechanismFrames(scene, rows)).toEqual({
      valid: true,
      checkedFrames: 696,
      findings: [],
    });
    expect(checkMechanismFrames(scene, [...rows].reverse())).toEqual({
      valid: true,
      checkedFrames: 696,
      findings: [],
    });
  });
  it("preserves correct contact under translated rotated scaled and pivoted ancestors", () => {
    const transformed = transformedScene();
    const rows = ["free", "pull", "push"].flatMap((mode) =>
      [0, 0.3, 1].map((travel) =>
        row(transformed, 30, mode as "free" | "pull" | "push", travel),
      ),
    );
    expect(checkMechanismFrames(transformed, rows)).toMatchObject({
      valid: true,
      checkedFrames: 9,
      findings: [],
    });
  });
  it("detects wrong physical hook travel even when q metadata and every assertion flag remain true", () => {
    const sample = structuredClone(row(scene, 20, "free", 0.5));
    sample.frame.parts.hook!.localMatrix = changeMatrix(
      sample.frame.parts.hook!.localMatrix,
      12,
      0.02,
    );
    sample.frame.parts.hook!.worldMatrix = changeMatrix(
      sample.frame.parts.hook!.worldMatrix,
      12,
      0.02,
    );
    expect(sample.frame.assertions.every((assertion) => assertion.passed)).toBe(
      true,
    );
    expect(sample.frame.rigs.slider!.q).toBe(0.09);
    const report = checkMechanismFrames(scene, [sample]);
    expect(report.valid).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-hook-displacement",
        path: "parts.hook.localMatrix",
        frames: [20, 20],
        property: "localXDisplacement",
        measured: expect.closeTo(0.02, 10),
      }),
    );
  });
  it("detects dishonest travel metadata using independently sampled override keys", () => {
    const prepared = prepareMechanismScene(scene);
    const request: MechanismFrameRequest = {
      frame: 25,
      width: 1080,
      height: 1920,
      controls: {
        slider: {
          contactMode: "free",
          travelKeys: [
            { frame: 0, value: 0, easing: "smoothstep" },
            { frame: 100, value: 1, easing: "hold" },
          ],
        },
      },
    };
    const sample = {
      shotId: "keys",
      request,
      frame: structuredClone(evaluateMechanismFrame(prepared, request)),
    };
    expect(checkMechanismFrames(scene, [sample]).valid).toBe(true);
    sample.frame.rigs.slider!.q = 0.1;
    expect(sample.frame.assertions.every((assertion) => assertion.passed)).toBe(
      true,
    );
    expect(checkMechanismFrames(scene, [sample]).findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-travel-control",
        path: "rigs.slider.q",
        frames: [25, 25],
        measured: expect.closeTo(0.1 - 0.18 * 0.15625, 10),
      }),
    );
  });
  it("detects rivet motion and incorrect authored blade mounts despite true assertion flags", () => {
    const sample = structuredClone(row());
    sample.frame.parts.blade!.localMatrix = changeMatrix(
      sample.frame.parts.blade!.localMatrix,
      12,
      0.03,
    );
    sample.frame.parts.blade!.worldMatrix = changeMatrix(
      sample.frame.parts.blade!.worldMatrix,
      12,
      0.03,
    );
    expect(sample.frame.assertions.every((assertion) => assertion.passed)).toBe(
      true,
    );
    const failures = checkMechanismFrames(scene, [sample]).findings.filter(
      (finding) => finding.code === "mechanism-fixed-rivet",
    );
    expect(
      failures.some((finding) => finding.property === "bladeLocalMatrix"),
    ).toBe(true);
    expect(
      failures.filter((finding) => finding.property === "rivetWorldPosition"),
    ).toHaveLength(6);
    const badMount = structuredClone(scene);
    badMount.geometry.meshes.find(
      (mesh) => mesh.id === "rivet-1-stem",
    )!.partId = "hook";
    expect(checkMechanismFrames(badMount, [row()]).findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-fixed-rivet",
        path: "rigs.slider.rivetMeshIds.rivet-1-stem",
        property: "rivetMount",
      }),
    );
  });
  it("detects an actual contact gap in the authored root basis without trusting copied anchor positions", () => {
    const transformed = transformedScene();
    const sample = structuredClone(row(transformed, 31, "pull", 0.8));
    const original = sample.frame.parts.hook!.worldMatrix;
    sample.frame.parts.hook!.worldMatrix = changeMatrix(original, 12, 0.04);
    expect(sample.frame.assertions.every((assertion) => assertion.passed)).toBe(
      true,
    );
    const finding = checkMechanismFrames(transformed, [sample]).findings.find(
      (item) => item.code === "mechanism-contact",
    );
    expect(finding).toMatchObject({
      path: "anchors.hook.innerFace.world",
      property: "contactGapInAuthoredRoot",
      frames: [31, 31],
    });
    expect(finding!.measured).toBeGreaterThan(0.01);
  });
  it("checks physical anchor copies and groups consecutive failing source frames with maximum measured error", () => {
    const rows = [10, 11, 12, 15].map((frame, index) => {
      const sample = structuredClone(row(scene, frame));
      sample.frame.anchors["hook.innerFace"]!.world[0] += 0.01 * (index + 1);
      return sample;
    });
    expect(
      rows.every((sample) =>
        sample.frame.assertions.every((assertion) => assertion.passed),
      ),
    ).toBe(true);
    const findings = checkMechanismFrames(
      scene,
      [...rows].reverse(),
    ).findings.filter((finding) => finding.code === "mechanism-anchor-world");
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      path: "anchors.hook.innerFace.world",
      frames: [10, 12],
      measured: expect.closeTo(0.03, 10),
    });
    expect(findings[1]).toMatchObject({
      frames: [15, 15],
      measured: expect.closeTo(0.04, 10),
    });
  });
  it("samples hold boundaries and reports missing/nonfinite observed body matrices", () => {
    const prepared = prepareMechanismScene(scene);
    const rows = [0, 19, 20, 30].map((frame) => {
      const request: MechanismFrameRequest = {
        frame,
        width: 160,
        height: 284,
        controls: {
          slider: {
            travelKeys: [
              { frame: 0, value: 0.25, easing: "hold" },
              { frame: 20, value: 0.75, easing: "linear" },
            ],
          },
        },
      };
      return {
        shotId: "hold",
        request,
        frame: evaluateMechanismFrame(prepared, request),
      };
    });
    expect(checkMechanismFrames(scene, rows).valid).toBe(true);
    const invalid = structuredClone(rows[0]!);
    invalid.frame.parts.hook!.worldMatrix = changeMatrix(
      invalid.frame.parts.hook!.worldMatrix,
      0,
      NaN,
    );
    expect(checkMechanismFrames(scene, [invalid])).toMatchObject({
      valid: false,
      findings: expect.arrayContaining([
        expect.objectContaining({
          code: "mechanism-world-transform",
          path: "parts.hook.worldMatrix",
          measured: Number.MAX_SAFE_INTEGER,
        }),
      ]),
    });
  });
});
