import { describe, expect, it } from "vitest";
import { CompositionSchema } from "../../packages/scene-contract/src/composition/index.ts";
import { nativeSolidFixture } from "../helpers/native3d-fixture.ts";
import { prepareCompositionNative3D } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { compositionScene } from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { mechanismHash } from "../../packages/animation-engine/src/mechanism/io.ts";
import { createNativeObservationRequest } from "../../packages/animation-engine/src/native-observation.ts";
import type { LoadedComposition } from "../../packages/animation-engine/src/composition-render.ts";

async function fixture(): Promise<LoadedComposition> {
  const source = nativeSolidFixture();
  const sourceSha256 = mechanismHash(JSON.stringify(source));
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "request",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 3,
    assets: [
      {
        id: "solid",
        type: "native3d",
        path: "solid.json",
        sha256: sourceSha256,
        format: "solid-scene-1",
      },
    ],
    motionBlur: {
      enabled: true,
      shutterAngle: 360,
      shutterPhase: 0,
      samples: 4,
      adaptive: true,
    },
    layers: [
      {
        id: "world",
        type: "native3d",
        asset: "solid",
        sourceStartFrame: 0,
        sourceFps: 30,
        motionBlur: true,
      },
    ],
  });
  const preparedNative3D = {
    version: "composition-prepared-native3d-1" as const,
    assets: { solid: { sourceSha256, source } },
  };
  const nativeAppearanceCodeIdentity = {
    runtimeFormat: "source-ts" as const,
    modules: [{ name: "renderer.ts", sha256: sourceSha256 }],
    threeRuntime: {
      version: "0.186.0" as const,
      sources: [{ name: "three.module.js", sha256: sourceSha256 }],
    },
  };
  return {
    composition,
    scene: compositionScene(composition, "webgl2"),
    warnings: [],
    systemFontLayers: [],
    assetPaths: {},
    sourcePath: "/tmp/native-observation-request.json",
    sourceChecksum: mechanismHash(JSON.stringify(composition)),
    preparedNative3D,
    native3D: await prepareCompositionNative3D(composition, preparedNative3D),
    nativeAppearanceCodeIdentity,
    nativeAppearanceCodeSha256: mechanismHash(
      JSON.stringify(nativeAppearanceCodeIdentity),
    ),
  };
}

describe("bounded asynchronous native observation admission", () => {
  it("lets a queued abort interrupt exact preflight without creating an execution request", async () => {
    const loaded = await fixture();
    const source = JSON.stringify(loaded.composition);
    const controller = new AbortController();
    const reason = Error("cancel between exact frame scans");
    queueMicrotask(() => controller.abort(reason));
    await expect(
      createNativeObservationRequest(loaded, undefined, {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
    expect(JSON.stringify(loaded.composition)).toBe(source);
    await expect(
      createNativeObservationRequest(loaded, undefined, {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
  });

  it("keeps all stationary exposure passes in order and reuses only frozen physical topology", async () => {
    const loaded = await fixture();
    const request = (await createNativeObservationRequest(loaded))!;
    const passes = request.expectedPasses(1);
    expect(passes.map((pass) => pass.sampleFrame)).toEqual([
      0.625, 0.875, 1.125, 1.375,
    ]);
    expect(passes.map((pass) => pass.sourceFrame)).toEqual([
      0.625, 0.875, 1.125, 1.375,
    ]);
    expect(new Set(passes.map((pass) => pass.frameKey)).size).toBe(4);
    expect(passes[0]!.parts).toEqual({ root: {}, child: { parent: "root" } });
    expect(passes[0]!.parts).toBe(request.expectedPasses(0)[0]!.parts);
    expect(Object.isFrozen(passes[0]!.parts)).toBe(true);
    expect(Object.isFrozen(passes[0]!.anchors.face)).toBe(true);
    expect(request.maximumPacketBytes).toBeGreaterThan(0);
    expect(request.maximumPacketBytes).toBeLessThanOrEqual(1048576);
  });
});
