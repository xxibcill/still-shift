import { WebGLRenderer } from "three";
import type { BufferAttribute } from "three";
import { Native3DLayerSchema } from "@still-shift/scene-contract";
import type {
  Native3DSourceV2,
  NativeObservedFrameV2,
} from "@still-shift/scene-contract";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { sampleNativeFrameV2 } from "../../packages/renderer-core/src/native3d/evaluate-v2.ts";
import { createNativeThreeWorldV2 } from "../../packages/renderer-core/src/native3d/three-world.ts";
import { createNativeThreeFrameObservationV2 } from "../../packages/renderer-core/src/native3d/three-shape-observation.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

export async function nativeFrameObservationProofV2(
  source: Native3DSourceV2,
  sourceSha256: string,
  appearanceCodeSha256: string,
) {
  const prepared = await prepareNative3DSceneV2(source, sourceSha256),
    variant = prepared.variants[prepared.baseSourceKey]!;
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
  const world = createNativeThreeWorldV2(renderer, variant),
    observer = createNativeThreeFrameObservationV2(
      renderer,
      world,
      variant,
      appearanceCodeSha256,
    ),
    gl = renderer.getContext();
  const make = (
    bend: boolean,
    frame: number,
    hidden = false,
    outside = false,
  ) =>
    sampleNativeFrameV2(
      prepared,
      {
        ...controller,
        ...(hidden ? { hiddenParts: ["root"] } : {}),
        ...(outside
          ? {
              camera: {
                ...source.camera,
                position: [100, 0, 15],
                target: [100, 0, 0],
              },
            }
          : bend
            ? {
                camera: {
                  ...source.camera,
                  position: [7, 6, 16],
                  target: [4, 1, 0],
                  fovDegrees: 44,
                },
              }
            : {}),
        ...(bend
          ? {
              rigControls: {
                hinge: { type: "hinge" as const, value: 0.5 },
                latch: {
                  type: "ratchet" as const,
                  position: { value: 0.5 },
                  latchKeys: [{ frame: 0, state: "engaged" as const }],
                },
              },
            }
          : {}),
      },
      {
        scope: "actual-frame2",
        scopeFrame: frame + 80,
        layerTime: frame,
        owningScopeFps: 30,
        width: 320,
        height: 180,
      },
    );
  const a = make(false, 0.5),
    b = make(true, 17.25);
  const pawl = world.meshes.find((mesh) => mesh.name === "pawl.mesh")!,
    position = pawl.geometry.getAttribute("position") as BufferAttribute,
    normal = pawl.geometry.getAttribute("normal") as BufferAttribute;
  const originalAfter = pawl.onAfterRender,
    originalDraw = gl.drawElements;
  const captures: {
      id: string;
      receipt: NativeObservedFrameV2;
      rgba: number[];
      pngBase64: string;
    }[] = [],
    negatives: { id: string; message: string; calls: number }[] = [];
  const apply = (snapshot: ReturnType<typeof make>) =>
    world.applyFrame(snapshot.frame, 320, 180, snapshot.localVisibility);
  async function capture(
    id: string,
    snapshot: ReturnType<typeof make>,
    future?: ReturnType<typeof make>,
  ) {
    const pending = observer.capture(snapshot);
    if (future) apply(future);
    const result = await pending;
    try {
      const rgba = new Uint8Array(320 * 180 * 4);
      gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      if (gl.getError() !== gl.NO_ERROR)
        throw Error("Actual full-frame control must read successfully");
      captures.push({
        id,
        receipt: JSON.parse(
          JSON.stringify(result.receipt),
        ) as NativeObservedFrameV2,
        rgba: Array.from(rgba),
        pngBase64: canvas.toDataURL("image/png").split(",")[1]!,
      });
    } finally {
      result.dispose();
    }
  }
  async function reject(
    id: string,
    snapshot: ReturnType<typeof make>,
    fragment: string,
  ) {
    let failure: unknown;
    try {
      const result = await observer.capture(snapshot);
      result.dispose();
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof Error) || !failure.message.includes(fragment))
      throw Error(
        `Full-frame negative ${id} failed at wrong boundary: ${String(failure)}`,
      );
    negatives.push({
      id,
      message: failure.message,
      calls: renderer.info.render.calls,
    });
  }
  try {
    apply(a);
    await capture("rest-a", a);
    apply(b);
    await capture("bent-b", b);
    apply(a);
    await capture("sealed-a-with-later-cpu-b", a, b);
    if (
      world.camera.fov !== 44 ||
      world.parts
        .get("jaw")!
        .matrix.elements.every(
          (value, index) =>
            value === captures.at(-1)!.receipt.parts.jaw!.localMatrix[index],
        )
    )
      throw Error("Seal-race seed must change later camera and part pose");
    apply(b);
    pawl.onAfterRender = function () {
      (position.array as Float32Array)[0]! += 0.25;
    };
    await reject("cpu-position-after-draw", b, "CPU raycast position");
    pawl.onAfterRender = originalAfter;
    const index = pawl.geometry.getIndex()!,
      saved = index.array[0]!;
    apply(b);
    pawl.onAfterRender = function () {
      index.array[0] = index.array[1]!;
    };
    await reject("cpu-index-after-draw", b, "CPU raycast indices");
    pawl.onAfterRender = originalAfter;
    index.array[0] = saved;
    apply(a);
    await capture("rest-a-before-stale", a);
    const versions = [position.version, normal.version];
    apply(b);
    position.version = versions[0]!;
    normal.version = versions[1]!;
    await reject("full-frame-stale-gpu", b, "used position");
    const hidden = make(false, 21, true);
    apply(hidden);
    await capture("allowed-hidden", hidden);
    const outside = make(false, 21, false, true);
    apply(outside);
    await capture("allowed-outside", outside);
    const required = make(false, 17.25, true);
    apply(required);
    await reject("hidden-required-frame", required, "required changing shape");
    apply(b);
    const memory = new ManagedMemory({
      pixels: 2_000_000,
      metadata: 3_000_000,
    });
    await withManagedMemory(memory, async () => {
      const result = await observer.capture(b);
      if (
        memory.statistics.current.pixels !== 0 ||
        memory.statistics.current.metadata <= 0
      )
        throw Error("Full-frame receipt ownership is missing");
      result.dispose();
      if (memory.statistics.current.metadata !== 0)
        throw Error("Full-frame receipt did not retire");
    });
    memory.dispose();
    if (
      gl.drawElements !== originalDraw ||
      pawl.onAfterRender !== originalAfter
    )
      throw Error(
        "Full-frame capture must restore draw/hooks after all failures",
      );
    return {
      captures,
      negatives,
      scope: "standalone-full-observed-frame2" as const,
    };
  } finally {
    pawl.onAfterRender = originalAfter;
    observer.dispose();
    world.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
}
