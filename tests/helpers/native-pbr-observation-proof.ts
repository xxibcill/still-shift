import { WebGLRenderer, Mesh } from "three";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import type {
  MechanismSceneV3,
  NativeObservedFrameV3,
} from "@still-shift/scene-contract";
import {
  MechanismMatrixSchema,
  NativeObservedFrameSchema,
  NativeObservedFrameV2Schema,
  Native3DLayerVersionsSchema,
} from "@still-shift/scene-contract";
import { prepareNative3DSceneV3 } from "../../packages/renderer-core/src/native3d/prepare-v3.ts";
import {
  prepareNativePbrResources,
  releasePreparedNativePbrResources,
} from "../../packages/renderer-core/src/native3d/pbr-resources.ts";
import { createNativeThreeWorldV3 } from "../../packages/renderer-core/src/native3d/three-world.ts";
import { sampleNativeFrameV3 } from "../../packages/renderer-core/src/native3d/evaluate-v3.ts";
import { createNativeThreeQueuedFrameObservationV3 } from "../../packages/renderer-core/src/native3d/three-pbr-observation.ts";
import { assertNativeObservedFrameV3 } from "../../packages/renderer-core/src/native3d/observed-validation-v3.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
export async function nativePbrObservationProof(input: {
  source: MechanismSceneV3;
  sourceSha256: string;
  images: { image: string; rgba: number[] }[];
}) {
  const prepared = await prepareNative3DSceneV3(
      input.source,
      input.sourceSha256,
    ),
    variant = prepared.variants[prepared.baseSourceKey]!,
    resources = await prepareNativePbrResources(
      variant.source.geometry,
      input.images.map((image) => ({
        image: image.image,
        rgba: Uint8Array.from(image.rgba),
      })),
    ),
    canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  document.body.append(canvas);
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(320, 180, false);
  const world = createNativeThreeWorldV3(renderer, variant, resources),
    appearance = "sha256:" + "a".repeat(64),
    observer = createNativeThreeQueuedFrameObservationV3(
      renderer,
      world,
      variant,
      appearance,
    ),
    memory = new ManagedMemory({
      pixels: 64 * 1024 ** 2,
      metadata: 64 * 1024 ** 2,
    }),
    gl = renderer.getContext() as WebGL2RenderingContext;
  const controller = Native3DLayerVersionsSchema.parse({
    id: "world",
    type: "native3d",
    asset: "lever",
    sourceStartFrame: 0,
    sourceFps: 30,
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
  const sample = (frame: number, hidden = false, outside = false) =>
    sampleNativeFrameV3(
      prepared,
      {
        ...controller,
        ...(hidden ? { hiddenParts: ["node.0"] } : {}),
        ...(outside
          ? {
              camera: {
                position: [100, 3, 8],
                target: [100, 3, 0],
                up: [0, 1, 0],
                fovDegrees: 35,
                near: 0.01,
                far: 100,
              },
            }
          : {}),
      },
      {
        scope: "root",
        scopeFrame: frame,
        owningScopeFps: 30,
        layerTime: frame,
        width: 320,
        height: 180,
      },
    );
  const captures: {
      id: string;
      sourceFrame: number;
      receipt: NativeObservedFrameV3;
      rgba: number[];
      pngBase64: string;
    }[] = [],
    faults: { id: string; message: string }[] = [],
    cleanup: {
      id: string;
      current: { pixels: number; metadata: number };
      reservations: number;
    }[] = [];
  function assertClean(id: string) {
    const statistics = memory.statistics;
    if (
      statistics.reservations ||
      statistics.current.pixels ||
      statistics.current.metadata
    )
      throw Error("PBR observation leaked: " + id);
    cleanup.push({
      id,
      current: statistics.current,
      reservations: statistics.reservations,
    });
  }
  async function capture(
    frame: number,
    id: string,
    hidden = false,
    outside = false,
  ) {
    const reference = sample(frame, hidden, outside);
    world.applyFrame(reference.frame, 320, 180, reference.localVisibility);
    renderer.info.reset();
    const result = await observer.capture(reference);
    try {
      const receipt = await assertNativeObservedFrameV3(
          variant,
          reference,
          result.receipt,
          appearance,
        ),
        rgba = new Uint8Array(320 * 180 * 4);
      gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      captures.push({
        id,
        sourceFrame: frame,
        receipt,
        rgba: Array.from(rgba),
        pngBase64: canvas.toDataURL("image/png").split(",")[1]!,
      });
    } finally {
      result.dispose();
    }
    assertClean(id);
  }
  async function reject(id: string, work: () => unknown | Promise<unknown>) {
    let message = "";
    try {
      await work();
    } catch (error) {
      message = passageDiagnostics(error)
        .map((diagnostic) => diagnostic.code + ": " + diagnostic.message)
        .join("; ");
    }
    if (!message.includes("comp-native3d-") && !message.includes("quota"))
      throw Error("Fault accepted: " + id + " " + message);
    faults.push({ id, message });
    assertClean(id);
  }
  try {
    await withManagedMemory(memory, async () => {
      for (const [frame, id] of [
        [0, "neutral"],
        [5, "half"],
        [10, "rotated"],
        [5, "half-repeat"],
        [0, "neutral-reverse"],
      ] as const)
        await capture(frame, id);
      await capture(0, "hidden", true);
      await capture(0, "outside", false, true);
      // Multiple invocations seal their own bytes and numeric state before digest completion.
      const pending = [0, 10, 5].map((frame) => {
        const reference = sample(frame);
        world.applyFrame(reference.frame, 320, 180, reference.localVisibility);
        renderer.info.reset();
        return { reference, result: observer.capture(reference) };
      });
      for (const [index, entry] of pending.entries()) {
        const result = await entry.result;
        try {
          await assertNativeObservedFrameV3(
            variant,
            entry.reference,
            result.receipt,
            appearance,
          );
          if (result.receipt.sourceFrame !== entry.reference.sourceFrame)
            throw Error("Queued frame lost its association");
        } finally {
          result.dispose();
        }
        if (index === pending.length - 1) assertClean("queued-three");
      }
      const reference = sample(0),
        reset = () =>
          world.applyFrame(
            reference.frame,
            320,
            180,
            reference.localVisibility,
          ),
        mesh = world.meshes[0]!;
      reset();
      const part = world.parts.get("node.1")!;
      part.matrix.elements[12]! += 0.25;
      world.world.updateMatrixWorld(true);
      await reject("wrong-part-world", () => observer.capture(reference));
      reset();
      mesh.visible = false;
      await reject("unauthored-hidden-mesh", () => observer.capture(reference));
      mesh.visible = true;
      const originalBefore = mesh.onBeforeRender;
      mesh.onBeforeRender = function (...args) {
        originalBefore.apply(this, args);
        args[2].projectionMatrix.elements[0]! += 0.25;
      };
      await reject("before-hook-camera", () => observer.capture(reference));
      mesh.onBeforeRender = originalBefore;
      reset();
      const originalAfter = mesh.onAfterRender;
      mesh.onAfterRender = function (...args) {
        originalAfter.apply(this, args);
        mesh.geometry.getAttribute("position").array[0]! += 0.25;
      };
      await reject("after-hook-geometry", () => observer.capture(reference));
      mesh.onAfterRender = originalAfter;
      mesh.geometry.getAttribute("position").array[0] = Math.fround(
        variant.source.geometry.meshes[0]!.positions[0]!,
      );
      reset();
      const foreign = new Mesh(mesh.geometry, mesh.material);
      world.world.add(foreign);
      await reject("foreign-color-mesh", () => observer.capture(reference));
      world.world.remove(foreign);
      const material = world.pbrResources.materials[0]!,
        originalCompile = material.onBeforeCompile;
      material.onBeforeCompile = () => {};
      await reject("custom-material-shader", () => observer.capture(reference));
      material.onBeforeCompile = originalCompile;
      material.emissive.setRGB(1, 0, 0);
      await reject("undeclared-emissive-material", () =>
        observer.capture(reference),
      );
      material.emissive.setRGB(0, 0, 0);
      const originalDraw = gl.drawElements;
      gl.drawElements = function (...args) {
        originalDraw.apply(this, args);
      };
      await reject("wrapped-draw-entry", () => observer.capture(reference));
      Reflect.deleteProperty(gl, "drawElements");
      const originalUniform = gl.uniformMatrix4fv,
        savedUniforms: {
          location: WebGLUniformLocation;
          data: Float32Array;
        }[] = [];
      gl.uniformMatrix4fv = function (location, transpose, data) {
        if (location && Array.from(data).length === 16) {
          const intended = Float32Array.from(data);
          savedUniforms.push({ location, data: intended });
          const changed = Float32Array.from(data);
          changed[0]! += 0.125;
          originalUniform.call(gl, location, transpose, changed);
        } else originalUniform.call(gl, location, transpose, data);
      };
      // Force fresh uploaded matrices so Three's uniform cache cannot bypass the control.
      const changed = sample(5);
      world.applyFrame(changed.frame, 320, 180, changed.localVisibility);
      await reject("actual-gpu-matrix", () => observer.capture(changed));
      Reflect.deleteProperty(gl, "uniformMatrix4fv");
      for (const uniform of savedUniforms)
        originalUniform.call(gl, uniform.location, false, uniform.data);
      reset();
      gl.colorMask(false, false, false, false);
      await reject("actual-color-write-disabled", () =>
        observer.capture(reference),
      );
      gl.colorMask(true, true, true, true);
      const aborted = new AbortController();
      aborted.abort();
      await reject("aborted-before-capture", () =>
        observer.capture(reference, { signal: aborted.signal }),
      );
      const cancellation = new AbortController(),
        pendingCancellation = observer.capture(reference, {
          signal: cancellation.signal,
        });
      cancellation.abort();
      await reject("aborted-during-hash", () => pendingCancellation);
      const good = captures[0]!.receipt;
      for (const [id, mutate] of [
        [
          "forged-frame-key",
          (receipt: NativeObservedFrameV3) => {
            receipt.frameKeySha256 = "sha256:" + "0".repeat(64);
          },
        ],
        [
          "forged-gpu-matrix",
          (receipt: NativeObservedFrameV3) => {
            const entry = Object.values(receipt.meshes)[0]!;
            if (entry.status === "drawn") {
              const changed = [...entry.submissions[0]!.modelViewMatrix];
              changed[12]! += 1;
              entry.submissions[0]!.modelViewMatrix =
                MechanismMatrixSchema.parse(changed);
            }
          },
        ],
        [
          "forged-gpu-bytes",
          (receipt: NativeObservedFrameV3) => {
            const entry = Object.values(receipt.meshes)[0]!;
            if (entry.status === "drawn")
              entry.submissions[0]!.vertexHashes.position =
                "sha256:" + "0".repeat(64);
          },
        ],
        [
          "missing-used-mip",
          (receipt: NativeObservedFrameV3) => {
            const entry = Object.values(receipt.meshes)[0]!;
            if (entry.status === "drawn") {
              const texture = entry.submissions[0]!.textures[0]!;
              texture.levels.pop();
              texture.samples = texture.levels.reduce(
                (sum, mip) => sum + mip.samples,
                0,
              );
              texture.maxError = Math.max(
                ...texture.levels.map((mip) => mip.maxError),
              );
            }
          },
        ],
        [
          "forged-anchor",
          (receipt: NativeObservedFrameV3) => {
            receipt.anchors["lever.tip"]!.world[0]! += 1;
          },
        ],
        [
          "missing-mesh",
          (receipt: NativeObservedFrameV3) => {
            delete receipt.meshes[Object.keys(receipt.meshes)[0]!];
          },
        ],
      ] as const) {
        const receipt = structuredClone(good);
        mutate(receipt);
        await reject(id, () =>
          assertNativeObservedFrameV3(variant, reference, receipt, appearance),
        );
      }
      if (
        NativeObservedFrameSchema.safeParse(good).success ||
        NativeObservedFrameV2Schema.safeParse(good).success
      )
        throw Error("Original observation parser accepted source3");
      const result = await observer.capture(reference);
      result.dispose();
      await reject("released-receipt", () => result.receipt);
      const disposable = createNativeThreeQueuedFrameObservationV3(
          renderer,
          world,
          variant,
          appearance,
        ),
        disposing = disposable.capture(reference);
      disposable.dispose();
      await reject("disposed-during-hash", () => disposing);
      await capture(0, "restored");
    });
    const quota = new ManagedMemory({ pixels: 1, metadata: 1 });
    await withManagedMemory(quota, async () => {
      let message = "";
      try {
        await observer.capture(sample(0));
      } catch (error) {
        message = String(error);
      }
      if (!message.includes("quota") || quota.statistics.reservations)
        throw Error("Quota admission did not fail cleanly");
      faults.push({ id: "quota-before-capture", message });
    });
    return {
      captures,
      faults,
      cleanup,
      statistics: memory.statistics,
      sourceKey: variant.sourceKey,
      scope:
        "Owned source3 rigid color draws, Float32 attributes, actual submitted matrices, current-environment used mips, Three parts/anchors and independent expected validation; composition collection/export and complete world allocation remain separate",
    };
  } finally {
    observer.dispose();
    world.dispose();
    releasePreparedNativePbrResources(resources);
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    memory.dispose();
  }
}
