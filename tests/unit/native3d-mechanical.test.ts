import { describe, expect, it } from "vitest";
import { Group, PerspectiveCamera, Scene } from "three";
import type {
  MechanismScene,
  NativeObservedFrame,
} from "@still-shift/scene-contract";
import {
  MechanismSceneSchema,
  Native3DLayerSchema,
} from "@still-shift/scene-contract";
import type { MechanismFrameRequest } from "@still-shift/renderer-core";
import { createTapeHookScene } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  checkNativeMechanismFrames,
  type NativeMechanismEvidenceFrame,
} from "../../packages/animation-engine/src/mechanism/assertions.ts";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { sampleNativeFrame } from "../../packages/renderer-core/src/native3d/evaluate.ts";
import { observeNativeThreeWorld } from "../../packages/renderer-core/src/native3d/three-observation.ts";
import type { NativeThreeWorld } from "../../packages/renderer-core/src/native3d/three-world.ts";
import { nativeFixtureHash } from "../helpers/native3d-fixture.ts";

/** CPU object fixture only: it exercises the measured-state checker, not encoded/GPU acceptance. */
async function measured(
  source: MechanismScene,
  request: MechanismFrameRequest,
) {
  const prepared = await prepareNative3DScene(source, nativeFixtureHash);
  const controller = Native3DLayerSchema.parse({
    id: "world",
    type: "native3d",
    asset: "source",
    sourceStartFrame: 0,
    sourceFps: 30,
    ...(request.controls ? { controls: request.controls } : {}),
    ...(request.hiddenParts ? { hiddenParts: request.hiddenParts } : {}),
    ...(request.camera ? { camera: request.camera } : {}),
    ...(request.cameraKeys ? { cameraKeys: request.cameraKeys } : {}),
  });
  const snapshot = sampleNativeFrame(prepared, controller, {
    scope: "comp",
    scopeFrame: request.frame,
    layerTime: request.frame,
    owningScopeFps: 30,
    width: request.width,
    height: request.height,
  });
  const world = new Scene(),
    parts = new Map(source.parts.map((part) => [part.id, new Group()]));
  for (const definition of source.parts) {
    const part = parts.get(definition.id)!;
    part.name = definition.id;
    part.matrixAutoUpdate = false;
    part.matrix.fromArray(snapshot.frame.parts[definition.id]!.localMatrix);
    part.visible = snapshot.localVisibility[definition.id]!;
    (definition.parent === undefined
      ? world
      : parts.get(definition.parent)!
    ).add(part);
  }
  const c = snapshot.frame.camera,
    camera = new PerspectiveCamera(
      c.fovDegrees,
      request.width / request.height,
      c.near,
      c.far,
    );
  camera.position.set(...c.position);
  camera.up.set(...c.up);
  camera.lookAt(...c.target);
  camera.updateMatrixWorld(true);
  world.updateMatrixWorld(true);
  const shared: NativeThreeWorld = {
    world,
    camera,
    parts,
    meshes: [],
    source,
    applyFrame() {},
    dispose() {
      world.clear();
    },
  };
  const row = (): NativeMechanismEvidenceFrame => ({
    shotId: "physical",
    request,
    observed: observeNativeThreeWorld(shared, snapshot, nativeFixtureHash, {
      calls: 0,
      triangles: 0,
    }),
  });
  return { parts, world, row };
}
const request = (
  frame = 10.25,
  mode: "free" | "pull" | "push" = "pull",
  travel = 0.5,
): MechanismFrameRequest => ({
  frame,
  width: 320,
  height: 180,
  controls: { slider: { contactMode: mode, travel } },
});

describe("native independent authored mechanical checker", () => {
  it("checks actual fractional Three state under pivoted positive-scale ancestors without rig/assertion metadata", async () => {
    const scene = createTapeHookScene(),
      model = scene.parts.find((part) => part.id === "model")!;
    model.transform = {
      position: [3, -2, 4],
      rotation: [0.18, 0.4, -0.32],
      scale: [1.8, 0.7, 1.2],
      pivot: [0.4, -0.3, 0.8],
    };
    const validated = MechanismSceneSchema.parse(scene),
      rows: NativeMechanismEvidenceFrame[] = [];
    for (const mode of ["free", "pull", "push"] as const)
      for (const travel of [0, 0.3, 1]) {
        const fixture = await measured(validated, request(30.25, mode, travel));
        rows.push(fixture.row());
      }
    expect(rows[0]!.observed).not.toHaveProperty("rigs");
    expect(rows[0]!.observed).not.toHaveProperty("assertions");
    expect(checkNativeMechanismFrames(validated, rows)).toEqual({
      valid: true,
      checkedFrames: 9,
      findings: [],
    });
    expect(checkNativeMechanismFrames(validated, [...rows].reverse())).toEqual({
      valid: true,
      checkedFrames: 9,
      findings: [],
    });
  });
  it("detects actual hook displacement and contact separation after the expected snapshot has been made", async () => {
    const scene = createTapeHookScene(),
      fixture = await measured(scene, request());
    expect(checkNativeMechanismFrames(scene, [fixture.row()]).valid).toBe(true);
    fixture.parts.get("hook")!.matrix.elements[12]! += 0.02;
    fixture.world.updateMatrixWorld(true);
    const report = checkNativeMechanismFrames(scene, [fixture.row()]);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-hook-displacement",
        path: "parts.hook.localMatrix",
        frames: [10.25, 10.25],
        measured: expect.closeTo(0.02, 10),
      }),
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "mechanism-contact",
        path: "anchors.hook.innerFace.world",
        measured: expect.closeTo(0.02, 10),
      }),
    );
  });
  it("detects real rivet/blade movement independently of honest or absent rig metadata", async () => {
    const scene = createTapeHookScene(),
      fixture = await measured(scene, request(22.5, "free"));
    fixture.parts.get("blade")!.matrix.elements[12]! += 0.03;
    fixture.world.updateMatrixWorld(true);
    const failures = checkNativeMechanismFrames(scene, [
      fixture.row(),
    ]).findings.filter((finding) => finding.code === "mechanism-fixed-rivet");
    expect(
      failures.some((finding) => finding.property === "bladeLocalMatrix"),
    ).toBe(true);
    expect(
      failures.filter((finding) => finding.property === "rivetWorldPosition"),
    ).toHaveLength(6);
  });
  it("fails missing/extra inventories, copied anchor tampering and incorrect local hiding", async () => {
    const scene = createTapeHookScene(),
      fixture = await measured(scene, {
        ...request(44.5),
        hiddenParts: ["model"],
      });
    expect(fixture.row().observed.parts.hook).toMatchObject({
      localVisible: true,
      inheritedVisible: false,
    });
    expect(checkNativeMechanismFrames(scene, [fixture.row()]).valid).toBe(true);
    const changed = {
      ...fixture.row(),
      observed: structuredClone(fixture.row().observed) as NativeObservedFrame,
    };
    changed.observed.parts.hook!.localVisible = false;
    changed.observed.parts.extra = changed.observed.parts.hook!;
    delete changed.observed.parts.blade;
    changed.observed.anchors["hook.innerFace"]!.world[0] += 0.01;
    changed.observed.anchors["hook.outerFace"]!.part = "blade";
    const report = checkNativeMechanismFrames(scene, [changed]);
    expect(report.valid).toBe(false);
    for (const [code, path] of [
      ["mechanism-part-visibility", "parts.hook.localVisible"],
      ["mechanism-part-inventory", "parts.extra"],
      ["mechanism-local-transform", "parts.blade.localMatrix"],
      ["mechanism-anchor-world", "anchors.hook.innerFace.world"],
      ["mechanism-anchor-reference", "anchors.hook.outerFace.part"],
    ])
      expect(report.findings).toContainEqual(
        expect.objectContaining({ code, path }),
      );
    const wrongClock = {
      ...fixture.row(),
      request: { ...request(44.5), frame: 45.5 },
    };
    expect(
      checkNativeMechanismFrames(scene, [wrongClock]).findings,
    ).toContainEqual(
      expect.objectContaining({
        code: "mechanism-source-frame",
        property: "sourceFrame",
      }),
    );
  });
});
