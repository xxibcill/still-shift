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
    const captures = [];
    try {
      await failure("source3-observation-admission", () =>
        createCompositionPreview(
          document.createElement("canvas"),
          composition,
          resources,
          { backend: "webgl2", collectNativeObservations: true },
        ),
      );
      for (const frame of [0, 5, 10, 0, 10, 5]) {
        await preview.prepareFrame(frame);
        const report = await renderCompositionFrameAsync(preview, frame);
        if (report.nativeObservations || report.nativeObservationsV2)
          throw Error("Source3 preview must not claim legacy observations");
        const passes = [
            ...compositionNativePasses(
              composition,
              frame,
              preview.evaluationOptions,
            ),
          ],
          pixels = preview.readPixels();
        captures.push({
          frame,
          report,
          frames: passes.map((pass) => pass.frame),
          rgba: Array.from(pixels),
          pngBase64: canvas.toDataURL("image/png").split(",")[1]!,
        });
        releaseRenderPixels(pixels);
      }
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
      return { captures, style, negatives, memory: memory.statistics };
    } finally {
      preview.dispose();
      releaseCompositionPbrResources(resources.nativePbrResources!);
      memory.dispose();
    }
  });
  if (memory.statistics.reservations !== 0)
    throw Error("Disposed source3 preview retains owners");
  return { ...result, cleanup: memory.statistics };
}
