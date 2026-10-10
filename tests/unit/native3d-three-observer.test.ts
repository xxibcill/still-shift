import { describe, expect, it } from "vitest";
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "three";
import { NativeObservedFrameSchema } from "../../packages/scene-contract/src/native3d/observation.ts";
import { Native3DLayerSchema } from "../../packages/scene-contract/src/composition/layers.ts";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { sampleNativeFrame } from "../../packages/renderer-core/src/native3d/evaluate.ts";
import {
  createNativeThreeGeometry,
  verifyNativeThreeGeometry,
  type NativeThreeWorld,
} from "../../packages/renderer-core/src/native3d/three-world.ts";
import { observeNativeThreeWorld } from "../../packages/renderer-core/src/native3d/three-observation.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";
async function fixture() {
  const source = nativeSolidFixture(),
    prepared = await prepareNative3DScene(source, nativeFixtureHash);
  const controller = Native3DLayerSchema.parse({
    id: "world",
    type: "native3d",
    asset: "solid",
    sourceStartFrame: 0,
    sourceFps: 30,
  });
  const snapshot = sampleNativeFrame(prepared, controller, {
    scope: "comp",
    scopeFrame: 0.25,
    layerTime: 0.25,
    owningScopeFps: 30,
    width: 320,
    height: 180,
  });
  const world = new Scene(),
    parts = new Map(source.parts.map((part) => [part.id, new Group()]));
  for (const definition of source.parts) {
    const part = parts.get(definition.id)!;
    part.name = definition.id;
    part.matrixAutoUpdate = false;
    part.matrix.fromArray(snapshot.frame.parts[definition.id]!.localMatrix);
    (definition.parent ? parts.get(definition.parent)! : world).add(part);
  }
  const geometry = createNativeThreeGeometry(source),
    material = new MeshStandardMaterial({ side: 0 });
  const meshes = source.geometry.meshes.map((definition) => {
    const mesh = new Mesh(geometry.geometries.get(definition.id)!, material);
    mesh.name = definition.id;
    parts.get(definition.partId)!.add(mesh);
    return mesh;
  });
  const camera = new PerspectiveCamera(60, 320 / 180, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  world.updateMatrixWorld(true);
  const shared: NativeThreeWorld = {
    world,
    camera,
    parts,
    meshes,
    source,
    applyFrame() {},
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
  return {
    shared,
    snapshot,
    geometry,
    material,
    observe: () =>
      observeNativeThreeWorld(shared, snapshot, nativeFixtureHash, {
        calls: 1,
        triangles: 1,
      }),
  };
}
describe("independent actual native Three observation", () => {
  it("reads fresh object/camera state instead of expected matrices and anchors", async () => {
    const f = await fixture();
    try {
      expect(f.observe().anchors.behind!.visibility).toBe("occluded");
      f.shared.parts.get("child")!.matrix.makeTranslation(1, 0, 0);
      f.shared.world.updateMatrixWorld(true);
      f.shared.camera.fov = 45;
      f.shared.camera.updateProjectionMatrix();
      const observed = f.observe();
      expect(observed.anchors.behind!.world).toEqual([1, 0, -1]);
      expect(observed.parts.child!.worldMatrix[12]).toBe(1);
      expect(observed.camera.fovDegrees).toBe(45);
      expect(f.snapshot.frame.anchors.behind!.world).toEqual([0, 0, -1]);
      expect(NativeObservedFrameSchema.safeParse(observed).success).toBe(true);
    } finally {
      f.shared.dispose();
    }
  });
  it("distinguishes inherited hiding, endpoint contact and physical floor occlusion", async () => {
    const f = await fixture();
    try {
      expect(f.observe().anchors.face!.visibility).toBe("visible");
      expect(f.observe().anchors.behind!.occluderMesh).toBe("floor");
      f.shared.parts.get("root")!.visible = false;
      const observed = f.observe();
      expect(observed.parts.child).toMatchObject({
        localVisible: true,
        inheritedVisible: false,
      });
      expect(observed.anchors.behind!.visibility).toBe("hidden-part");
    } finally {
      f.shared.dispose();
    }
  });
  it("uses actual material mask and camera-axis clip policy, excluding graphic planes", async () => {
    const f = await fixture();
    try {
      f.material.alphaTest = 0.5;
      f.material.opacity = 0.2;
      expect(f.observe().anchors.behind!.visibility).toBe("visible");
      f.material.opacity = 1;
      f.shared.camera.near = 10.5;
      f.shared.camera.updateProjectionMatrix();
      expect(f.observe().anchors.behind!.visibility).toBe("visible");
      f.shared.camera.near = 0.1;
      f.shared.camera.updateProjectionMatrix();
      const graphic = new Mesh(f.geometry.geometries.get("floor")!, f.material);
      graphic.position.z = 1;
      f.shared.world.add(graphic);
      f.shared.world.updateMatrixWorld(true);
      expect(f.observe().anchors.behind!.occluderMesh).toBe("floor");
      expect(f.observe().anchors.outside!.visibility).toBe("outside-frame");
    } finally {
      f.shared.dispose();
    }
  });
  it("binds the actual GPU-quantized attribute bytes and catches a mutated upload", async () => {
    const f = await fixture();
    try {
      expect(() =>
        verifyNativeThreeGeometry(f.shared.source, f.geometry),
      ).not.toThrow();
      const attribute = f.geometry.geometries
        .get("floor")!
        .getAttribute("position");
      attribute.array[0] = 123;
      expect(() =>
        verifyNativeThreeGeometry(f.shared.source, f.geometry),
      ).toThrow("GPU-quantized source");
    } finally {
      f.shared.dispose();
    }
  });
});
