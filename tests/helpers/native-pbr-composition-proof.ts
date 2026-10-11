import {
  CompositionSchema,
  NativeObservedOutputFrameV3Schema,
  type NativeObservedOutputFrameV3,
} from "@still-shift/scene-contract";
import { nativeCompositionObservationCapacityV3 } from "../../packages/renderer-core/src/native3d/observation-capacity-v3.ts";
import type {
  Composition,
  CompositionPreparedNative3DVersions,
  NativeAppearanceCodeIdentity,
} from "@still-shift/scene-contract";
import {
  createCompositionPreview,
  loadCompositionResources,
  renderCompositionFrameAsync,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  releaseRenderPixels,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseCompositionPbrResources } from "../../packages/renderer-core/src/composition/render/native-pbr-resources.ts";

export async function nativePbrCompositionProof(
  composition: Composition,
  transport: CompositionPreparedNative3DVersions,
  appearance: NativeAppearanceCodeIdentity,
) {
  const negatives: {
    id: string;
    message: string;
    current?: { pixels: number; metadata: number };
  }[] = [];
  async function failure(
    id: string,
    work: () => unknown | Promise<unknown>,
    current?: () => { pixels: number; metadata: number },
  ) {
    try {
      await work();
    } catch (error) {
      negatives.push({
        id,
        message: String(error),
        ...(current ? { current: current() } : {}),
      });
      return;
    }
    throw Error(`Negative case did not fail: ${id}`);
  }
  // Faults use real fetch streams; no browser pixel array is passed through JSON.
  for (const fault of ["checksum", "oversize", "short", "length", "missing"]) {
    const memory = new ManagedMemory({
      pixels: 512 * 1024 ** 2,
      metadata: 64 * 1024 ** 2,
    });
    const originalFetch = window.fetch;
    if (fault === "oversize" || fault === "short")
      window.fetch = async (...args) => {
        const response = await originalFetch(...args),
          headers = new Headers(response.headers);
        headers.set(
          "Content-Length",
          response.headers.get("X-PBR-Declared-Bytes")!,
        );
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      };
    try {
      await withManagedMemory(memory, async () => {
        await failure(
          `binary-${fault}`,
          () =>
            loadCompositionResources(
              composition,
              (id) => `/pbr-asset/${id}?fault=${fault}`,
              {
                preparedNative3D: transport,
                appearanceCodeIdentity: appearance,
              },
            ),
          () => memory.statistics.current,
        );
        if (memory.statistics.reservations !== 0)
          throw Error(`Failed binary phase retains owners: ${fault}`);
        memory.dispose();
      });
    } finally {
      window.fetch = originalFetch;
    }
  }
  const memory = new ManagedMemory({
    pixels: 512 * 1024 ** 2,
    metadata: 64 * 1024 ** 2,
  });
  const result = await withManagedMemory(memory, async () => {
    const resources = await loadCompositionResources(
      composition,
      (id) => `/pbr-asset/${id}`,
      { preparedNative3D: transport, appearanceCodeIdentity: appearance },
    );
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const preview = createCompositionPreview(canvas, composition, resources, {
      backend: "webgl2",
    });
    const observedCanvas = document.createElement("canvas");
    document.body.append(observedCanvas);
    const observedPreview = createCompositionPreview(
      observedCanvas,
      composition,
      resources,
      { backend: "webgl2", collectNativeObservations: true },
    );
    const captures = [];
    try {
      for (const frame of [0, 5, 10, 0, 10, 5]) {
        await preview.prepareFrame(frame);
        const report = await renderCompositionFrameAsync(preview, frame);
        if (
          report.nativeObservations ||
          report.nativeObservationsV2 ||
          report.nativeObservationsV3
        )
          throw Error(
            "Uncollected source3 preview must not claim observations",
          );
        await observedPreview.prepareFrame(frame);
        const pending = renderCompositionFrameAsync(observedPreview, frame);
        if (captures.length === 0) {
          await failure("source3-read-before-completion", () =>
            observedPreview.readPixels(),
          );
          await failure("source3-busy-frame", () =>
            renderCompositionFrameAsync(observedPreview, frame),
          );
          await failure("source3-sync-frame", () =>
            observedPreview.renderFrame(frame),
          );
        }
        const observedReport = await pending;
        if (captures.length === 0)
          await failure("source3-sync-after-completion", () =>
            observedPreview.renderFrame(frame),
          );
        if (
          observedReport.nativeObservations ||
          observedReport.nativeObservationsV2 ||
          !observedReport.nativeObservationsV3
        )
          throw Error(
            "Collected source3 frame must expose only explicit output3 observations",
          );
        const packet = NativeObservedOutputFrameV3Schema.parse({
          version: "native3d-observed-output-frame-3",
          outputFrame: frame,
          executionSha256:
            observedReport.nativeObservationsV3[0]!.observed
              .appearanceCodeSha256,
          passes: observedReport.nativeObservationsV3,
        });
        const capacity = nativeCompositionObservationCapacityV3(
          composition,
          frame,
          observedPreview.evaluationOptions!,
        );
        if (new TextEncoder().encode(JSON.stringify(packet)).length > capacity)
          throw Error("Actual composed output3 packet exceeds admission");
        const observedPixels = observedPreview.readPixels();
        const passes = [
            ...compositionNativePasses(
              composition,
              frame,
              preview.evaluationOptions,
            ),
          ],
          pixels = preview.readPixels();
        if (pixels.some((value, index) => value !== observedPixels[index]))
          throw Error(
            "Collected source3 frame differs from uncollected pixels",
          );
        releaseRenderPixels(observedPixels);
        captures.push({
          frame,
          report,
          observedReport,
          packet,
          capacity,
          frames: passes.map((pass) => pass.frame),
          rgba: Array.from(pixels),
          pngBase64: canvas.toDataURL("image/png").split(",")[1]!,
        });
        releaseRenderPixels(pixels);
      }
      const worldArtwork: {
        id: string;
        z: number;
        rgba: number[];
        packet: NativeObservedOutputFrameV3;
        capacity: number;
        pngBase64: string;
      }[] = [];
      for (const [id, z] of [
        ["front", 0.4],
        ["behind", -0.4],
      ] as const) {
        const artworkComposition = CompositionSchema.parse({
          ...composition,
          layers: [
            ...composition.layers,
            {
              id: "yellow-marker",
              type: "solid",
              size: [64, 64],
              color: "#ffdb00",
              native3D: {
                role: "world-graphic",
                sceneLayer: composition.layers.find(
                  (layer) => layer.type === "native3d",
                )!.id,
                transform: { position: [4.5, 3, z] },
                originPixels: [32, 32],
                pixelsPerUnit: 64,
                alphaMode: "opaque",
                side: "double",
              },
            },
          ],
        });
        const plainCanvas = document.createElement("canvas"),
          collectedCanvas = document.createElement("canvas");
        const plain = createCompositionPreview(
          plainCanvas,
          artworkComposition,
          resources,
          { backend: "webgl2" },
        );
        const collected = createCompositionPreview(
          collectedCanvas,
          artworkComposition,
          resources,
          { backend: "webgl2", collectNativeObservations: true },
        );
        let plainPixels: ReturnType<typeof plain.readPixels> | undefined;
        let collectedPixels:
          | ReturnType<typeof collected.readPixels>
          | undefined;
        try {
          await plain.prepareFrame(0);
          await renderCompositionFrameAsync(plain, 0);
          await collected.prepareFrame(0);
          const report = await renderCompositionFrameAsync(collected, 0);
          plainPixels = plain.readPixels();
          collectedPixels = collected.readPixels();
          if (
            plainPixels.some(
              (value, index) => value !== collectedPixels![index],
            )
          )
            throw Error(
              "Collected world-artwork differs from uncollected pixels",
            );
          const packet = NativeObservedOutputFrameV3Schema.parse({
            version: "native3d-observed-output-frame-3",
            outputFrame: 0,
            executionSha256:
              report.nativeObservationsV3![0]!.observed.appearanceCodeSha256,
            passes: report.nativeObservationsV3,
          });
          const capacity = nativeCompositionObservationCapacityV3(
            artworkComposition,
            0,
            collected.evaluationOptions!,
          );
          if (
            new TextEncoder().encode(JSON.stringify(packet)).length > capacity
          )
            throw Error("World-artwork output3 packet exceeds admission");
          worldArtwork.push({
            id,
            z,
            rgba: Array.from(collectedPixels),
            packet,
            capacity,
            pngBase64: collectedCanvas.toDataURL("image/png").split(",")[1]!,
          });
        } finally {
          if (plainPixels) releaseRenderPixels(plainPixels);
          if (collectedPixels) releaseRenderPixels(collectedPixels);
          try {
            collected.dispose();
          } finally {
            plain.dispose();
          }
        }
      }
      if (
        !worldArtwork[0]!.rgba.some(
          (value, index) => value !== worldArtwork[1]!.rgba[index],
        )
      )
        throw Error(
          "Front/behind artwork did not exercise shared physical depth",
        );
      // A new style is admitted through the production catalogue and resource loader.
      const styled = structuredClone(composition),
        controller = styled.layers.find((layer) => layer.type === "native3d")!;
      if (
        controller.type !== "native3d" ||
        transport.version !== "composition-prepared-native3d-3"
      )
        throw Error("Source3 fixture protocols differ");
      controller.pbrMaterialOverrides = {
        [transport.assets[controller.asset]!.source.geometry.materials[0]!.id]:
          {
            baseColorFactor: [1, 0.05, 0.02, 1],
            metallicFactor: 0.1,
            roughnessFactor: 0.8,
          },
      };
      const styledResources = await loadCompositionResources(
        styled,
        (id) => `/pbr-asset/${id}`,
        { preparedNative3D: transport, appearanceCodeIdentity: appearance },
      );
      const styledCanvas = document.createElement("canvas"),
        styledPreview = createCompositionPreview(
          styledCanvas,
          styled,
          styledResources,
          { backend: "webgl2" },
        );
      let style: { rgba: number[]; frame: unknown; pngBase64: string };
      try {
        await styledPreview.prepareFrame(0);
        await renderCompositionFrameAsync(styledPreview, 0);
        const pixels = styledPreview.readPixels();
        style = {
          rgba: Array.from(pixels),
          frame: [
            ...compositionNativePasses(
              styled,
              0,
              styledPreview.evaluationOptions,
            ),
          ][0]!.frame,
          pngBase64: styledCanvas.toDataURL("image/png").split(",")[1]!,
        };
        releaseRenderPixels(pixels);
      } finally {
        styledPreview.dispose();
        releaseCompositionPbrResources(styledResources.nativePbrResources!);
      }
      return {
        captures,
        worldArtwork,
        style,
        negatives,
        memory: memory.statistics,
      };
    } finally {
      try {
        observedPreview.dispose();
      } finally {
        preview.dispose();
      }
      releaseCompositionPbrResources(resources.nativePbrResources!);
      memory.dispose();
    }
  });
  if (memory.statistics.reservations !== 0)
    throw Error("Disposed source3 preview retains owners");
  return { ...result, cleanup: memory.statistics };
}
