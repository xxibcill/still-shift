import {
  createCompositionPreview,
  loadCompositionResources,
} from "../../packages/renderer-core/src/composition/render/index.ts";
import type {
  Composition,
  CompositionPreparedMedia,
} from "@still-shift/scene-contract";

export async function captureMechanismCompositionPreviews(input: {
  composition: Composition;
  preparedMedia: CompositionPreparedMedia;
  assetPaths: Record<string, string>;
  order: number[];
}) {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const create = async () => {
      const resources = await loadCompositionResources(
        input.composition,
        (id) => new URL(`/@fs${input.assetPaths[id]}`, location.href).href,
        { preparedMedia: input.preparedMedia },
      );
      return createCompositionPreview(
        document.createElement("canvas"),
        input.composition,
        resources,
        { backend },
      );
    };
    const preview = await create();
    const frames = [];
    try {
      for (const frame of input.order) {
        await preview.prepareFrame(frame);
        preview.renderFrame(frame);
        const pixels = preview.readPixels();
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new Uint8Array(pixels).buffer,
        );
        const sha256 = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        let binary = "";
        for (let start = 0; start < pixels.length; start += 0x8000)
          binary += String.fromCharCode(
            ...pixels.subarray(start, start + 0x8000),
          );
        const fresh = await create();
        let freshHash: string;
        try {
          await fresh.prepareFrame(frame);
          fresh.renderFrame(frame);
          const freshDigest = await crypto.subtle.digest(
            "SHA-256",
            new Uint8Array(fresh.readPixels()).buffer,
          );
          freshHash = Array.from(new Uint8Array(freshDigest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
        } finally {
          fresh.dispose();
        }
        frames.push({ frame, sha256, freshHash, pixelsBase64: btoa(binary) });
      }
    } finally {
      preview.dispose();
    }
    reports.push({ backend, frames });
  }
  return reports;
}
