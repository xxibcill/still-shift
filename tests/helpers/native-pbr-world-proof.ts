import { WebGLRenderer } from "three";
import type { MechanismSceneV3 } from "@still-shift/scene-contract";
import { prepareNative3DSceneV3 } from "../../packages/renderer-core/src/native3d/prepare-v3.ts";
import { prepareNativePbrResources } from "../../packages/renderer-core/src/native3d/pbr-resources.ts";
import { createNativeThreeWorldV3 } from "../../packages/renderer-core/src/native3d/three-world.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
import { nativeExpectedObservedCameraV2 } from "../../packages/renderer-core/src/native3d/observed-precision-v2.ts";
import { multiplyMatrices } from "../../packages/renderer-core/src/mechanism/matrix.ts";
import {
  captureNativePbrGpuDraw,
  sealNativePbrGpuDraw,
} from "../../packages/renderer-core/src/native3d/pbr-gpu-draw.ts";
type SubmittedMatrices = {
  modelViewMatrix: number[];
  projectionMatrix: number[];
};
export async function nativePbrWorldProof(input: {
  source: MechanismSceneV3;
  sourceSha256: string;
  images: { image: string; rgba: number[] }[];
}) {
  const prepared = await prepareNative3DSceneV3(
      input.source,
      input.sourceSha256,
    ),
    resources = await prepareNativePbrResources(
      prepared.source.geometry,
      input.images.map((image) => ({
        image: image.image,
        rgba: Uint8Array.from(image.rgba),
      })),
    );
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  document.body.append(canvas);
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(320, 180, false);
  let world: ReturnType<typeof createNativeThreeWorldV3> | undefined;
  try {
    world = createNativeThreeWorldV3(renderer, prepared, resources);
    const gl = renderer.getContext() as WebGL2RenderingContext,
      original = gl.drawElements.bind(gl),
      definition = prepared.source.geometry.meshes[0]!;
    const sample = (frame: number) =>
      evaluateMechanismFrameV2(prepared.evaluation, {
        frame,
        width: 320,
        height: 180,
        rigControls: {
          "lever.hinge": {
            type: "hinge",
            keys: [
              { frame: 0, value: 0 },
              { frame: 10, value: Math.PI / 2 },
            ],
          },
        },
      });
    let frame = sample(0),
      draws: ReturnType<typeof captureNativePbrGpuDraw>[] = [],
      gpuMatrices: SubmittedMatrices[] = [];
    const captures: {
        id: string;
        sourceFrame: number;
        rgba: number[];
        pngBase64: string;
        anchor: readonly [number, number, number];
        gpuMatrices: SubmittedMatrices[];
        draws: Awaited<ReturnType<typeof sealNativePbrGpuDraw>>[];
      }[] = [],
      faults: { id: string; message: string }[] = [];
    gl.drawElements = function (mode, count, type, offset) {
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram,
        camera = nativeExpectedObservedCameraV2(frame.camera, 320, 180),
        modelView = multiplyMatrices(
          camera.viewMatrix,
          frame.parts[definition.partId]!.worldMatrix,
        );
      const submitted: SubmittedMatrices = {
        modelViewMatrix: [],
        projectionMatrix: [],
      };
      for (const [name, expected] of [
        ["modelViewMatrix", modelView],
        ["projectionMatrix", camera.projectionMatrix],
      ] as const) {
        const location = gl.getUniformLocation(program, name);
        if (!location) throw Error(`comp-native3d-checksum: no actual ${name}`);
        const actual = gl.getUniform(program, location) as Float32Array;
        submitted[name] = Array.from(actual);
        if (
          actual.length !== expected.length ||
          expected.some((value, index) => Math.fround(value) !== actual[index])
        )
          throw Error(
            `comp-native3d-checksum: actual ${name} differs from independent source3 camera/pose`,
          );
      }
      gpuMatrices.push(submitted);
      draws.push(
        captureNativePbrGpuDraw(
          renderer,
          world!.pbrResources,
          definition.id,
          definition.materialId,
          { mode, count, type, offset },
        ),
      );
      original(mode, count, type, offset);
    };
    async function capture(sourceFrame: number, id: string) {
      frame = sample(sourceFrame);
      draws = [];
      gpuMatrices = [];
      world!.applyFrame(frame, 320, 180);
      renderer.render(world!.world, world!.camera);
      if (draws.length !== 1) throw Error("Expected one source3 color draw");
      const rgba = new Uint8Array(320 * 180 * 4);
      gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      if (!rgba.some((value, index) => index % 4 === 3 && value === 255))
        throw Error("Source3 did not cover opaque pixels");
      captures.push({
        id,
        sourceFrame,
        rgba: Array.from(rgba),
        pngBase64: canvas.toDataURL("image/png").split(",")[1]!,
        anchor: frame.anchors["lever.tip"]!.world,
        gpuMatrices,
        draws: await Promise.all(draws.map(sealNativePbrGpuDraw)),
      });
    }
    try {
      for (const [sourceFrame, id] of [
        [0, "neutral"],
        [5, "half"],
        [10, "rotated"],
        [5, "half-repeat"],
        [0, "neutral-reverse"],
      ] as const)
        await capture(sourceFrame, id);
      frame = sample(0);
      world.applyFrame(frame, 320, 180);
      const part = world.parts.get("node.1")!;
      part.matrix.elements[12]! += 0.25;
      world.world.updateMatrixWorld(true);
      let message = "";
      try {
        renderer.render(world.world, world.camera);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      if (!message.includes("actual modelViewMatrix differs"))
        throw Error("Incorrect imported world pose was not rejected");
      faults.push({ id: "wrong-world-pose", message });
      await capture(0, "restored");
      return {
        captures,
        faults,
        allocation: prepared.allocation,
        sourceKey: prepared.sourceKey,
        scope:
          "shared native world and generic hinge execution; actual color draw plus independent GPU camera/pose matrices and mip0 resources. Composition/transport/frame3 observation/export/mip data remain pending.",
      };
    } finally {
      gl.drawElements = original;
    }
  } finally {
    world?.dispose();
    world?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
}
