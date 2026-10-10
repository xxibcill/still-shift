import { WebGLRenderer } from "three";
import type { BufferAttribute, Material, MeshStandardMaterial } from "three";
import { Native3DLayerSchema } from "@still-shift/scene-contract";
import type {
  Native3DSourceV2,
  NativeObservedShapePass,
} from "@still-shift/scene-contract";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { sampleNativeFrameV2 } from "../../packages/renderer-core/src/native3d/evaluate-v2.ts";
import { createNativeThreeWorldV2 } from "../../packages/renderer-core/src/native3d/three-world.ts";
import {
  createNativeThreeShapeObservation,
  NativeUsedStreamMismatchError,
} from "../../packages/renderer-core/src/native3d/three-shape-observation.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

export async function nativeUsedStreamsProof(
  source: Native3DSourceV2,
  sourceSha256: string,
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
  const context = renderer.getContext();
  if (!(context instanceof WebGL2RenderingContext))
    throw Error("Used stream proof requires WebGL2");
  const gl = context,
    world = createNativeThreeWorldV2(renderer, variant);
  const observer = createNativeThreeShapeObservation(renderer, world, variant);
  const sentinel = gl.createBuffer();
  gl.bindBuffer(gl.COPY_READ_BUFFER, sentinel);
  gl.bufferData(gl.COPY_READ_BUFFER, 16, gl.STATIC_DRAW);
  const pawl = world.meshes.find((mesh) => mesh.name === "pawl.mesh")!,
    ownedGeometry = pawl.geometry;
  const position = pawl.geometry.getAttribute("position") as BufferAttribute,
    normal = pawl.geometry.getAttribute("normal") as BufferAttribute;
  const captures: {
    id: string;
    receipt: NativeObservedShapePass;
    rgba: number[];
    pngBase64: string;
    calls: number;
  }[] = [];
  const negatives: {
    id: string;
    message: string;
    calls: number;
    mismatch?: NativeUsedStreamMismatchError["mismatch"];
  }[] = [];
  const originalDraw = gl.drawElements,
    before = pawl.onBeforeRender,
    after = pawl.onAfterRender;
  const make = (bend: boolean, frame = 0.5, hidden = false, outside = false) =>
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
        scope: "used-stream-proof",
        scopeFrame: frame + 80,
        layerTime: frame,
        owningScopeFps: 30,
        width: 320,
        height: 180,
      },
    );
  function apply(snapshot: ReturnType<typeof make>) {
    world.applyFrame(snapshot.frame, 320, 180, snapshot.localVisibility);
  }
  function restored() {
    if (
      gl.drawElements !== originalDraw ||
      pawl.onBeforeRender !== before ||
      pawl.onAfterRender !== after ||
      gl.getParameter(gl.COPY_READ_BUFFER_BINDING) !== sentinel ||
      pawl.geometry !== ownedGeometry
    )
      throw Error(
        "Observation must restore hooks, draw entry, copy binding and original private owner",
      );
  }
  async function capture(id: string, snapshot: ReturnType<typeof make>) {
    const result = await observer.capture(snapshot);
    try {
      const rgba = new Uint8Array(320 * 180 * 4);
      gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      if (gl.getError() !== gl.NO_ERROR)
        throw Error("Actual accepted control frame must read successfully");
      captures.push({
        id,
        receipt: JSON.parse(
          JSON.stringify(result.receipt),
        ) as NativeObservedShapePass,
        rgba: Array.from(rgba),
        pngBase64: canvas.toDataURL("image/png").split(",")[1]!,
        calls: renderer.info.render.calls,
      });
    } finally {
      result.dispose();
    }
    restored();
  }
  async function reject(
    id: string,
    snapshot: ReturnType<typeof make>,
    fragment: string,
    options: { signal?: AbortSignal } = {},
  ) {
    let failure: unknown;
    try {
      const result = await observer.capture(snapshot, options);
      result.dispose();
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof Error) || !failure.message.includes(fragment))
      throw Error(
        `Negative ${id} did not fail at the intended boundary: ${String(failure)}`,
      );
    negatives.push({
      id,
      message: failure.message,
      calls: renderer.info.render.calls,
      ...(failure instanceof NativeUsedStreamMismatchError
        ? { mismatch: failure.mismatch }
        : {}),
    });
    restored();
  }
  try {
    const a = make(false),
      b = make(true);
    apply(a);
    await capture("rest-a", a);
    const versions = [position.version, normal.version];
    apply(b);
    position.version = versions[0]!;
    normal.version = versions[1]!;
    if (
      Array.from(position.array).some(
        (value, index) =>
          value !== Math.fround(b.frame.shapeStates.pawl!.positions[index]!),
      )
    )
      throw Error("Stale-upload seed must retain CPU B positions");
    await reject("cpu-b-gpu-a", b, "used position bytes");
    apply(b);
    (normal.array as Float32Array).set(a.frame.shapeStates.pawl!.normals);
    await reject("b-position-a-normal", b, "used normal bytes");
    apply(b);
    const index = pawl.geometry.getIndex()!,
      savedIndex = index.array[0]!;
    index.array[0] = index.array[1]!;
    index.needsUpdate = true;
    await reject("changed-index", b, "used indices bytes");
    index.array[0] = savedIndex;
    index.needsUpdate = true;
    apply(b);
    pawl.geometry.setDrawRange(0, 0);
    await reject("zero-index-submission", b, "nonzero indexed", undefined);
    pawl.geometry.setDrawRange(0, Infinity);
    apply(b);
    pawl.visible = false;
    await reject("unexpected-hidden-mesh", b, "required changing shape");
    pawl.visible = true;
    apply(b);
    const materials = pawl.material as Material[];
    materials[1]!.visible = false;
    await reject("missing-color-group", b, "coverage is incomplete");
    materials[1]!.visible = true;
    apply(b);
    const paint = materials[0] as MeshStandardMaterial,
      red = paint.color.r;
    paint.color.r += 1e-7;
    await reject("changed-linear-material", b, "linear color");
    paint.color.r = red;
    const abort = new AbortController(),
      pending = observer.capture(b, { signal: abort.signal });
    abort.abort();
    await pending.then(
      (result) => {
        result.dispose();
        throw Error("Aborted observation was accepted");
      },
      (error) => {
        if (!(error instanceof Error) || !error.message.includes("aborted"))
          throw error;
        negatives.push({
          id: "abort-finalizer",
          message: error.message,
          calls: renderer.info.render.calls,
        });
      },
    );
    restored();
    apply(b);
    await capture("bent-b", b);
    apply(b);
    await capture("bent-b-repeat", b);
    apply(a);
    await capture("rest-a-reverse", a);
    const hidden = make(false, 2, true);
    apply(hidden);
    await capture("allowed-hidden", hidden);
    const requiredHidden = make(false, 1.5, true);
    apply(requiredHidden);
    await reject(
      "hidden-in-required-interval",
      requiredHidden,
      "required changing shape",
    );
    const outside = make(false, 2, false, true);
    apply(outside);
    await capture("allowed-outside", outside);
    apply(b);
    const memory = new ManagedMemory({
      pixels: 2_000_000,
      metadata: 2_000_000,
    });
    await withManagedMemory(memory, async () => {
      const result = await observer.capture(b);
      if (
        memory.statistics.current.pixels !== 0 ||
        memory.statistics.current.metadata <= 0
      )
        throw Error(
          "Receipt must retain metadata and release transient readback bytes",
        );
      result.dispose();
      if (
        memory.statistics.current.pixels !== 0 ||
        memory.statistics.current.metadata !== 0
      )
        throw Error("Disposing receipt must release all observation owners");
    });
    memory.dispose();
    apply(b);
    const disposal = observer.capture(b);
    observer.dispose();
    await disposal.then(
      (result) => {
        result.dispose();
        throw Error("Disposed observation was accepted");
      },
      (error) => {
        if (!(error instanceof Error) || !error.message.includes("disposed"))
          throw error;
        negatives.push({
          id: "dispose-finalizer",
          message: error.message,
          calls: renderer.info.render.calls,
        });
      },
    );
    restored();
    const ownerCount = world.changingMeshOwners,
      worldObserver = createNativeThreeShapeObservation(
        renderer,
        world,
        variant,
      );
    const worldPending = worldObserver.capture(b);
    world.dispose();
    try {
      await worldPending.then(
        (result) => {
          result.dispose();
          throw Error("Disposed world observation was accepted");
        },
        (error) => {
          if (!(error instanceof Error) || !error.message.includes("disposed"))
            throw error;
          negatives.push({
            id: "world-dispose-finalizer",
            message: error.message,
            calls: renderer.info.render.calls,
          });
        },
      );
    } finally {
      worldObserver.dispose();
    }
    if (
      gl.drawElements !== originalDraw ||
      pawl.onBeforeRender !== before ||
      pawl.onAfterRender !== after
    )
      throw Error("World disposal must retain restored hooks and draw entry");
    return {
      captures,
      negatives,
      ownerCount,
      scope: "standalone-used-color-streams-only" as const,
    };
  } finally {
    observer.dispose();
    world.dispose();
    gl.deleteBuffer(sentinel);
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
}
