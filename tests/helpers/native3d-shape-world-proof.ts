import { WebGLRenderer } from "three";
import type { Native3DSourceV2 } from "@still-shift/scene-contract";
import { Native3DLayerSchema } from "@still-shift/scene-contract";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { sampleNativeFrameV2 } from "../../packages/renderer-core/src/native3d/evaluate-v2.ts";
import {
  createNativeThreeGeometry,
  createNativeThreeWorldV2,
} from "../../packages/renderer-core/src/native3d/three-world.ts";

/** Actual browser factory/pixels; this does not implement the independent used-GPU ledger. */
export async function nativeShapeWorldProof(
  source: Native3DSourceV2,
  sourceSha256: string,
) {
  const prepared = await prepareNative3DSceneV2(source, sourceSha256);
  const variant = prepared.variants[prepared.baseSourceKey]!;
  const controller = Native3DLayerSchema.parse({
    id: "world",
    type: "native3d",
    asset: "mechanism",
    sourceStartFrame: 0,
    sourceFps: 30,
  });
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  document.body.append(canvas);
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(320, 180, false);
  const gl = renderer.getContext();
  const geometry = createNativeThreeGeometry(variant.source);
  const worlds: ReturnType<typeof createNativeThreeWorldV2>[] = [];
  const captures: {
    id: string;
    rgba: number[];
    pngBase64: string;
    calls: number;
    sourceFrame: number;
  }[] = [];
  try {
    const a = createNativeThreeWorldV2(renderer, variant, { geometry });
    worlds.push(a);
    const b = createNativeThreeWorldV2(renderer, variant, { geometry });
    worlds.push(b);
    if (a.changingMeshOwners !== 2 || b.changingMeshOwners !== 2)
      throw Error("Changing owners must count each live alias independently");
    const pawlA = a.meshes.find((mesh) => mesh.name === "pawl.mesh")!;
    const pawlB = b.meshes.find((mesh) => mesh.name === "pawl.mesh")!;
    if (
      pawlA.geometry === pawlB.geometry ||
      pawlA.geometry === geometry.geometries.get("pawl.mesh")
    )
      throw Error("Changing aliases must not share rest/mutable geometry");
    async function capture(
      id: string,
      world: typeof a,
      bend: boolean,
      sourceFrame: number,
    ) {
      const authored = bend
        ? {
            ...controller,
            rigControls: {
              hinge: { type: "hinge" as const, value: 0.5 },
              latch: {
                type: "ratchet" as const,
                position: { value: 0.5 },
                latchKeys: [{ frame: 0, state: "engaged" as const }],
              },
            },
          }
        : controller;
      const snapshot = sampleNativeFrameV2(prepared, authored, {
        scope: "proof/" + id,
        scopeFrame: sourceFrame + 80,
        layerTime: sourceFrame,
        owningScopeFps: 30,
        width: 320,
        height: 180,
      });
      world.applyFrame(snapshot.frame, 320, 180, snapshot.localVisibility);
      renderer.render(world.world, world.camera);
      const rgba = new Uint8Array(320 * 180 * 4);
      gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      if (gl.getError() !== gl.NO_ERROR || renderer.info.render.calls <= 0)
        throw Error(
          "Native shape world must submit and capture a successful actual frame",
        );
      captures.push({
        id,
        rgba: Array.from(rgba),
        pngBase64: canvas.toDataURL("image/png").split(",")[1]!,
        calls: renderer.info.render.calls,
        sourceFrame: snapshot.sourceFrame,
      });
    }
    await capture("rest-a", a, false, 0);
    await capture("bent-a", a, true, 0.5);
    const bentPositions = Array.from(
      pawlA.geometry.getAttribute("position").array,
    );
    await capture("rest-b", b, false, 17.25);
    if (
      JSON.stringify(
        Array.from(pawlA.geometry.getAttribute("position").array),
      ) !== JSON.stringify(bentPositions)
    )
      throw Error(
        "Another world's frame must not overwrite the first world's geometry",
      );
    await capture("bent-a-repeat", a, true, 0.5);
    await capture("rest-a-reverse", a, false, 0);
    return {
      captures,
      ownersPerWorld: [a.changingMeshOwners, b.changingMeshOwners],
      scope: "browser-world-and-pixels-only" as const,
    };
  } finally {
    for (const world of worlds) world.dispose();
    geometry.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
}
