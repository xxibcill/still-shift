import type { Composition } from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Reference from "../helpers/composition-camera-reference.ts";

/** Fresh preview/resource instances also avoid hardware Canvas readback migration. */
export async function cameraPreview(
  page: Page,
  doc: Composition,
  assetUrls: Record<string, string>,
  backend: "canvas2d" | "webgl2",
  frames: number[],
  oracleName?: string,
) {
  return page.evaluate(
    async ({ json, assetUrls, backend, frames, oracleName }) => {
      const doc = JSON.parse(json) as Composition;
      const renderUrl = "/packages/renderer-core/src/index.ts",
        referenceUrl = "/tests/helpers/composition-camera-reference.ts",
        m = (await import(renderUrl)) as typeof Render,
        ref = (await import(referenceUrl)) as typeof Reference,
        resources = await m.loadCompositionResources(
          doc,
          (id) => assetUrls[id]!,
        ),
        canvas = document.createElement("canvas"),
        preview = m.createCompositionPreview(canvas, doc, resources, {
          backend,
        }),
        hashes: Record<string, string> = {},
        pngs: Record<string, string> = {},
        pixels: Record<string, string> = {};
      let sourcePixels: Uint8ClampedArray | undefined;
      if (oracleName === "checker-perspective") {
        const source = document.createElement("canvas");
        source.width = 48;
        source.height = 40;
        const context = source.getContext("2d")!;
        context.drawImage(resources.images.get("checker")!, 0, 0);
        sourcePixels = context.getImageData(0, 0, 48, 40).data;
      }
      let oracleMaxDelta = 0;
      try {
        for (const frame of frames) {
          preview.renderFrame(frame);
          const bytes = preview.readPixels(),
            digest = Array.from(
              new Uint8Array(
                await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
              ),
            )
              .map((x) => x.toString(16).padStart(2, "0"))
              .join("");
          if (hashes[frame] && hashes[frame] !== digest)
            throw Error(`${doc.id}/${frame}/${backend}: seek pixels changed`);
          hashes[frame] = digest;
          pngs[frame] = canvas.toDataURL("image/png").split(",")[1]!;
          let binary = "";
          for (let i = 0; i < bytes.length; i += 0x8000)
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          pixels[frame] = btoa(binary);
          const plane = oracleName
            ? ref.cameraFixturePlane(oracleName, frame, sourcePixels)
            : null;
          if (plane || oracleName === "affine") {
            const camera = doc.layers.find((layer) => layer.type === "camera"),
              expected = plane
                ? ref.cameraPlaneReference(
                    doc.width,
                    doc.height,
                    plane,
                    camera?.type === "camera" ? camera.nearClip : undefined,
                    camera?.type === "camera" ? camera.farClip : undefined,
                  )
                : ref.affineCameraReference(frame),
              comparison = m.compareFrames(
                bytes,
                expected,
                doc.width,
                doc.height,
              );
            if (!m.meetsTier(comparison, "near"))
              throw Error(
                `${doc.id}/${frame}: independent ray oracle ${JSON.stringify(comparison)}`,
              );
            oracleMaxDelta = Math.max(
              oracleMaxDelta,
              comparison.maxChannelDelta,
            );
          }
        }
      } finally {
        preview.dispose();
      }
      return { hashes, pngs, pixels, oracleMaxDelta };
    },
    { json: JSON.stringify(doc), assetUrls, backend, frames, oracleName },
  );
}
