import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import {
  allocateRenderPixels,
  readRenderImageData,
  renderMemory,
} from "../../managed-memory-context.ts";
import { meshFrame, type DeformedMesh } from "../mesh/frame.ts";
import { rasterizeMesh } from "../mesh/raster.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
type Work = {
  memory: ReturnType<typeof renderMemory>;
  mesh?: DeformedMesh | undefined;
  image?: ImageData | undefined;
  source?: Uint8Array<ArrayBuffer> | undefined;
  output?: Uint8Array<ArrayBuffer> | undefined;
  vertices?: Float32Array<ArrayBuffer> | undefined;
};
function clear(work: Work) {
  let failed = false,
    first: unknown;
  for (const pixels of [
    work.image?.data,
    work.source,
    work.output,
    work.vertices,
  ])
    if (pixels) {
      try {
        work.memory?.release(pixels.buffer);
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
  if (work.mesh) {
    work.mesh.source.length = 0;
    work.mesh.destination.length = 0;
    work.mesh.indices.length = 0;
  }
  work.image =
    work.source =
    work.output =
    work.vertices =
    work.mesh =
      undefined;
  if (failed) throw first;
}
function workspace(effect: string, width: number, height: number): Work {
  // Bound contour Set entries, Earcut nodes, refinement maps, simultaneous
  // source/local/destination points, triangle indices and ordering records.
  const bytes =
    effect === "distort.mesh-warp"
      ? 4 * 1024 * 1024
      : 16384 +
        Math.min(width * height * 4, 65536) * 96 +
        Math.min(width * height * 4, 8192) * 1024 +
        32768 * 384 +
        65536 * 128;
  return allocateRenderMetadata<Work>(
    bytes,
    () => ({ memory: renderMemory() }),
    false,
    clear,
  );
}
function finish(work: Work, failed: boolean) {
  try {
    if (work.memory) releaseRenderMetadata(work);
    else clear(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function meshEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (id !== "distort.mesh-warp" && id !== "distort.puppet") return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  kernel = Object.freeze({
    id,
    definition: compositionEffectDefinition(id)!,
    renderGpu(context, input, params) {
      const work = workspace(id, input.width, input.height);
      let failed = false;
      try {
        const pixels =
          id === "distort.puppet" ? context.readBytes(input) : undefined;
        const mesh = (work.mesh = meshFrame(
          id,
          params,
          input.width,
          input.height,
          pixels,
          context.placement?.matrix,
        ));
        const vertices = (work.vertices = allocateRenderPixels(
          mesh.indices.length * 16,
          () => new Float32Array(mesh.indices.length * 4),
        ));
        for (let i = 0; i < mesh.indices.length; i++) {
          const index = mesh.indices[i]!,
            source = mesh.source[index]!,
            destination = mesh.destination[index]!;
          vertices[i * 4] = destination[0];
          vertices[i * 4 + 1] = destination[1];
          vertices[i * 4 + 2] = source[0];
          vertices[i * 4 + 3] = source[1];
        }
        const output = context.createSurface(input.width, input.height);
        context.mesh(output, input, vertices);
        return output;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finish(work, failed);
      }
    },
    renderCanvas(context, input, params) {
      const work = workspace(id, input.width, input.height);
      let failed = false;
      try {
        const image = (work.image = readRenderImageData(
          input.ctx,
          0,
          0,
          input.width,
          input.height,
        ));
        const source = (work.source = allocateRenderPixels(
          image.data.length,
          () => new Uint8Array(image.data.length),
        ));
        for (let i = 0; i < source.length; i += 4) {
          const alpha = image.data[i + 3]!;
          for (let channel = 0; channel < 3; channel++)
            source[i + channel] = Math.round(
              (image.data[i + channel]! * alpha) / 255,
            );
          source[i + 3] = alpha;
        }
        const mesh = (work.mesh = meshFrame(
          id,
          params,
          input.width,
          input.height,
          source,
          context.placement?.matrix,
        ));
        const output = (work.output = allocateRenderPixels(
          source.length,
          () => new Uint8Array(source.length),
        ));
        rasterizeMesh(mesh, source, output, input.width, input.height);
        for (let i = 0; i < output.length; i += 4) {
          const alpha = output[i + 3]!;
          for (let channel = 0; channel < 3; channel++)
            image.data[i + channel] = alpha
              ? Math.round((output[i + channel]! * 255) / alpha)
              : 0;
          image.data[i + 3] = alpha;
        }
        const surface = context.createSurface(input.width, input.height);
        surface.ctx.putImageData(image, 0, 0);
        return surface;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finish(work, failed);
      }
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
