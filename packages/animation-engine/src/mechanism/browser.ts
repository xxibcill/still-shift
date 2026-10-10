import { Raycaster, Vector2, Vector3, WebGLRenderer } from "three";
import type { MechanismScene } from "@still-shift/scene-contract";
import type { evaluateMechanismFrame } from "../../../renderer-core/src/mechanism/index.ts";
import {
  createNativeThreeWorld,
  inheritedThreeVisibility as visible,
} from "../../../renderer-core/src/native3d/three-world.ts";

type EvaluatedFrame = ReturnType<typeof evaluateMechanismFrame>;
type TextureFont = { bytesBase64: string; weight: string; family: string };
export const MECHANISM_BRIDGE_RENDERER_VERSION = "mechanism-three-bridge-1";
export async function createMechanismPlateRenderer(
  scene: MechanismScene,
  options: { width: number; height: number; font?: TextureFont },
) {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: scene.profile.transparent,
    preserveDrawingBuffer: true,
    premultipliedAlpha: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(options.width, options.height);
  let font: FontFace | undefined;
  const fontFamily = "StillShiftMechanismDigits";
  let shared: ReturnType<typeof createNativeThreeWorld>;
  try {
    if (options.font) {
      const binary = atob(options.font.bytesBase64);
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      font = new FontFace(fontFamily, bytes, { weight: options.font.weight });
      await font.load();
      document.fonts.add(font);
    }
    shared = createNativeThreeWorld(renderer, scene, {
      ...(font
        ? { textureFont: { family: fontFamily, weight: options.font!.weight } }
        : {}),
    });
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    if (font) document.fonts.delete(font);
    throw error;
  }
  const { world, camera, parts, meshes } = shared;
  const raycaster = new Raycaster();
  function render(frame: EvaluatedFrame) {
    shared.applyFrame(frame, options.width, options.height);
    for (const [id, part] of parts) {
      const expected = frame.parts[id]!.worldMatrix;
      if (
        part.matrixWorld.elements.some(
          (value, index) => Math.abs(value - expected[index]!) > 1e-8,
        )
      )
        throw new Error(
          `mechanism-rendered-transform: part ${id} differs from evaluated world matrix`,
        );
    }
    for (const definition of scene.anchors) {
      const actual = parts
        .get(definition.part)!
        .localToWorld(new Vector3(...definition.position));
      const expected = new Vector3(...frame.anchors[definition.id]!.world);
      if (actual.distanceTo(expected) > 1e-8)
        throw new Error(
          `mechanism-rendered-anchor: anchor ${definition.id} differs from actual part transform`,
        );
    }
    for (const mesh of meshes) {
      if (
        mesh.matrix.elements.some(
          (value, index) => Math.abs(value - (index % 5 === 0 ? 1 : 0)) > 1e-8,
        )
      )
        throw new Error(
          `mechanism-rendered-mesh: baked mesh ${mesh.name} has an unintended independent transform`,
        );
    }
    renderer.render(world, camera);
    const anchors = Object.fromEntries(
      Object.entries(frame.anchors).map(([id, anchor]) => {
        const projected = new Vector3(...anchor.world).project(camera);
        const pixel: [number, number] = [
          ((projected.x + 1) * options.width) / 2,
          ((1 - projected.y) * options.height) / 2,
        ];
        const projectionErrorPixels = anchor.pixel
          ? Math.hypot(pixel[0] - anchor.pixel[0], pixel[1] - anchor.pixel[1])
          : 0;
        let visibility: string = anchor.projectionVisibility;
        if (visibility === "in-frame") {
          raycaster.setFromCamera(
            new Vector2(projected.x, projected.y),
            camera,
          );
          const distance = camera.position.distanceTo(
            new Vector3(...anchor.world),
          );
          const first = raycaster
            .intersectObjects(meshes, false)
            .find((hit) => visible(hit.object));
          if (first && first.distance < distance - 0.0001)
            visibility = "occluded";
        }
        return [id, { ...anchor, visibility, projectionErrorPixels }];
      }),
    );
    return { ...frame, anchors, renderer: { ...renderer.info.render } };
  }
  function dispose() {
    shared.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    if (font) document.fonts.delete(font);
  }
  return {
    render,
    png: () => canvas.toDataURL("image/png").split(",")[1]!,
    dispose,
  };
}
