import type { CompositionAsset } from "@still-shift/scene-contract";
import { sha256Hex } from "../../browser-checksum.ts";
import type { PreviewScene } from "../../scene.ts";
import {
  loadCompositionResources,
  createCompositionPreview,
} from "../render/renderer.ts";
import { depthToComposition, type DepthCompositionOptions } from "./depth.ts";

type PreparedImageBytes = {
  url: string;
  bytes: ArrayBuffer;
  mimeType: string;
};
const preparedImages = new WeakMap<
  HTMLImageElement,
  Promise<PreparedImageBytes>
>();

/** Hash immutable source bytes during preparation, never manufacture decoded-pixel provenance. */
async function imageBytes(image: HTMLImageElement) {
  const url = image.currentSrc || image.src;
  const existing = preparedImages.get(image);
  if (existing) {
    const prepared = await existing;
    if (prepared.url === url) return prepared;
  }
  const pending = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw Error("Depth preview asset unavailable");
    return {
      url,
      bytes: await response.arrayBuffer(),
      mimeType:
        response.headers.get("Content-Type") ?? "application/octet-stream",
    };
  })();
  preparedImages.set(image, pending);
  try {
    return await pending;
  } catch (error) {
    if (preparedImages.get(image) === pending) preparedImages.delete(image);
    throw error;
  }
}

/** Existing Lab/export decoded inputs become verified native resources before frame rendering. */
export async function prepareDepthComposition(
  scene: PreviewScene,
  source: HTMLImageElement,
  depth: HTMLImageElement | null,
  options: Pick<
    DepthCompositionOptions,
    "id" | "requestedPreset" | "requestedIntensity" | "originalSourceHash"
  > = {},
) {
  if (!depth && scene.motion.mode === "depth")
    throw Error("Depth image is required for depth motion");
  const temporaryUrls: string[] = [];
  const urls = new Map<string, string>();
  const prepare = async (
    id: string,
    image: HTMLImageElement,
  ): Promise<Extract<CompositionAsset, { type: "image" }>> => {
    const prepared = await imageBytes(image),
      sha256 = `sha256:${await sha256Hex(prepared.bytes)}`;
    // Decode the exact bytes whose hash enters the document. An image element can
    // outlive its URL's content; its previously decoded pixels are not the authority.
    const url = URL.createObjectURL(
      new Blob([prepared.bytes], { type: prepared.mimeType }),
    );
    temporaryUrls.push(url);
    urls.set(id, url);
    return {
      id,
      type: "image",
      path: prepared.url,
      sha256,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  };
  try {
    const sourceAsset = await prepare("source", source),
      depthAsset =
        depth && scene.motion.mode === "depth"
          ? await prepare("depth", depth)
          : undefined,
      composition = depthToComposition(scene, {
        ...options,
        source: sourceAsset,
        ...(depthAsset ? { depth: depthAsset } : {}),
      }),
      resources = await loadCompositionResources(
        composition,
        (id) => urls.get(id)!,
      );
    return { composition, resources };
  } finally {
    for (const url of temporaryUrls) URL.revokeObjectURL(url);
  }
}

/** Verified preparation completes before the shared GPU frame renderer is created. */
export async function createPreparedDepthPreview(
  canvas: HTMLCanvasElement,
  scene: PreviewScene,
  source: HTMLImageElement,
  depth: HTMLImageElement | null,
) {
  const prepared = await prepareDepthComposition(scene, source, depth);
  return createCompositionPreview(
    canvas,
    prepared.composition,
    prepared.resources,
    { backend: "webgl2" },
  );
}
