import type { DeepReadonly } from "../../packages/renderer-core/src/mechanism/types.ts";
import type {
  Composition,
  CompositionPreparedNative3DVersions,
  NativeAppearanceCodeIdentity,
  MechanismSceneV2,
  MechanismFrameResultV2,
  NativeObservedFrameV2,
} from "@still-shift/scene-contract";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  FrontSide,
  PerspectiveCamera,
  Raycaster,
  Vector3,
} from "three";
import {
  loadCompositionResources,
  createCompositionPreview,
  renderCompositionFrameAsync,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { releaseRenderPixels } from "../../packages/renderer-core/src/managed-memory-context.ts";
export interface CameraProofInput {
  frame: number;
  pose: DeepReadonly<MechanismFrameResultV2>;
  target: string;
  bindings: {
    id: string;
    mesh: string;
    triangleIndex: number;
    barycentric: [number, number, number];
  }[];
  region: { left: number; top: number; right: number; bottom: number };
}
/** Independent Three rays use Float32 streams, observed matrices and observed camera.
 * The caller must strictly validate the used-stream GPU receipt before accepting these results.
 * Current pack materials are opaque; no generic imported/alpha material support is claimed here. */
function checkProof(
  scene: MechanismSceneV2,
  input: CameraProofInput,
  observed: NativeObservedFrameV2,
  width: number,
  height: number,
) {
  const material = new MeshBasicMaterial({ side: FrontSide });
  const meshes = scene.geometry.meshes.map((source) => {
    const positions =
      Object.values(input.pose.shapeStates).find((s) => s.mesh === source.id)
        ?.positions ?? source.positions;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(Float32Array.from(positions), 3),
    );
    geometry.setIndex(new Uint32BufferAttribute(source.indices, 1));
    const mesh = new Mesh(geometry, material);
    mesh.name = source.id;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorld.fromArray(observed.parts[source.partId]!.worldMatrix);
    mesh.visible = observed.parts[source.partId]!.inheritedVisible;
    return mesh;
  });
  try {
    const camera = new PerspectiveCamera();
    camera.matrixWorld.fromArray(observed.camera.worldMatrix);
    camera.matrixWorldInverse.fromArray(observed.camera.viewMatrix);
    camera.projectionMatrix.fromArray(observed.camera.projectionMatrix);
    const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    return input.bindings.map((binding) => {
      const mesh = meshes.find((m) => m.name === binding.mesh)!;
      const positions = mesh.geometry.getAttribute("position"),
        indices = mesh.geometry.index!;
      const world = new Vector3();
      for (let v = 0; v < 3; v++)
        world.addScaledVector(
          new Vector3().fromBufferAttribute(
            positions,
            indices.getX(binding.triangleIndex * 3 + v),
          ),
          binding.barycentric[v]!,
        );
      world.applyMatrix4(mesh.matrixWorld);
      const projected = world.clone().project(camera);
      const pixel: [number, number] = [
        ((projected.x + 1) * width) / 2,
        ((1 - projected.y) * height) / 2,
      ];
      const direction = world.clone().sub(origin),
        distance = direction.length();
      const rays = new Raycaster(
        origin,
        direction.normalize(),
        0,
        distance - 0.0001,
      );
      const hits = rays.intersectObjects(
        meshes.filter((m) => m.visible),
        false,
      );
      const region = input.region;
      if (
        !mesh.visible ||
        projected.z < -1 ||
        projected.z > 1 ||
        pixel[0] < region.left ||
        pixel[0] > region.right ||
        pixel[1] < region.top ||
        pixel[1] > region.bottom ||
        hits.length
      )
        throw new Error(
          `camera-native-proof: ${input.target}/${binding.id} at ${input.frame} blocked by ${hits[0]?.object.name ?? "framing"}`,
        );
      return {
        id: binding.id,
        mesh: binding.mesh,
        triangle: binding.triangleIndex,
        world: world.toArray(),
        pixel,
        method: "independent-three-float32-observed-matrices-ray-1" as const,
        visibility: "visible" as const,
      };
    });
  } finally {
    for (const mesh of meshes) mesh.geometry.dispose();
    material.dispose();
  }
}
export async function cameraPackPreview(
  composition: Composition,
  preparedNative3D: CompositionPreparedNative3DVersions,
  appearanceCodeIdentity: NativeAppearanceCodeIdentity,
  scene: MechanismSceneV2,
  proofs: CameraProofInput[],
) {
  const resources = await loadCompositionResources(
    composition,
    (id) => {
      if (id === "graduations-font")
        return "/assets/story-motion/fonts/plex-sans-semibold.ttf";
      throw new Error(`Unexpected camera asset ${id}`);
    },
    { preparedNative3D, appearanceCodeIdentity },
  );
  const preview = createCompositionPreview(
    document.createElement("canvas"),
    composition,
    resources,
    { backend: "webgl2", collectNativeObservations: true },
  );
  const captures = [];
  try {
    for (const frame of [...Array.from({ length: 24 }, (_, i) => i), 0, 10]) {
      await preview.prepareFrame(frame);
      const report = await renderCompositionFrameAsync(preview, frame),
        rgba = preview.readPixels();
      try {
        const observed = report.nativeObservationsV2?.[0]?.observed;
        if (observed?.version !== "native3d-observed-frame-2")
          throw new Error("Camera proof requires the actual native2 pass");
        const proof = proofs.find((p) => p.frame === frame)!;
        const surfaces = checkProof(
          scene,
          proof,
          observed,
          composition.width,
          composition.height,
        );
        const canvas = document.createElement("canvas");
        canvas.width = composition.width;
        canvas.height = composition.height;
        canvas
          .getContext("2d")!
          .putImageData(
            new ImageData(
              new Uint8ClampedArray(rgba),
              composition.width,
              composition.height,
            ),
            0,
            0,
          );
        captures.push({
          frame,
          report,
          surfaces,
          rgba: Array.from(rgba),
          png: canvas.toDataURL("image/png"),
        });
      } finally {
        releaseRenderPixels(rgba);
      }
    }
  } finally {
    preview.dispose();
  }
  return { captures };
}
