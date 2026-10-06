import type { Page } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** Decode and provenance failures occur during resource loading, before painting. */
export async function depthFailureAcceptance(
  page: Page,
  doc: Composition,
  assetUrls: Record<string, string>,
) {
  return page.evaluate(
    async ({ json, assetUrls }) => {
      const doc = JSON.parse(json) as Composition,
        url = "/packages/renderer-core/src/index.ts",
        renderer: typeof Render = await import(url),
        reports = [];
      for (const kind of ["hash", "dimensions", "missing", "decode"] as const) {
        const changed = structuredClone(doc),
          source = changed.assets.find((asset) => asset.id === "source")!;
        let urls = assetUrls;
        if (source.type !== "image") throw Error("Depth source missing");
        if (kind === "hash") source.sha256 = "sha256:" + "0".repeat(64);
        if (kind === "dimensions") source.width++;
        if (kind === "missing")
          urls = { ...urls, source: "/missing-depth-source.png" };
        if (kind === "decode") {
          const text = "invalid image payload",
            bytes = new TextEncoder().encode(text);
          source.sha256 =
            "sha256:" +
            Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
              (value) => value.toString(16).padStart(2, "0"),
            ).join("");
          urls = { ...urls, source: `data:image/png;base64,${btoa(text)}` };
        }
        let rejected = false,
          message = "";
        try {
          await renderer.loadCompositionResources(changed, (id) => urls[id]!);
        } catch (error) {
          rejected = true;
          message = error instanceof Error ? error.message : String(error);
        }
        if (!rejected) throw Error(`Depth ${kind} resource was accepted`);
        const expected = {
          hash: /checksum differs/,
          dimensions: /Dimensions differ/,
          missing: /unavailable/,
          decode: /decode|source image|encoding/i,
        }[kind];
        if (!expected.test(message))
          throw Error(`Depth ${kind}: unexpected rejection ${message}`);
        reports.push({ kind, status: "rejected-before-paint", message });
      }
      return reports;
    },
    { json: JSON.stringify(doc), assetUrls },
  );
}

/** Authored depth preserves source alpha; the legacy compatibility mode is explicitly opaque. */
export async function depthAlphaAcceptance(
  page: Page,
  doc: Composition,
  assetUrls: Record<string, string>,
) {
  return page.evaluate(
    async ({ json, assetUrls }) => {
      const doc = JSON.parse(json) as Composition,
        url = "/packages/renderer-core/src/index.ts",
        renderer: typeof Render = await import(url),
        resources = await renderer.loadCompositionResources(
          doc,
          (id) => assetUrls[id]!,
        ),
        reports = [];
      for (const alphaMode of ["preserve", "opaque"] as const) {
        const changed = structuredClone(doc),
          photo = changed.layers[0]!;
        if (photo.type !== "depth-image")
          throw Error("Depth alpha fixture missing");
        photo.alphaMode = alphaMode;
        changed.background = "#10243b";
        const preview = renderer.createCompositionPreview(
          document.createElement("canvas"),
          changed,
          resources,
          { backend: "webgl2" },
        );
        try {
          preview.renderFrame(0);
          const corner = Array.from(preview.readPixels().subarray(0, 4));
          if (alphaMode === "preserve" && corner.join(",") !== "16,36,59,255")
            throw Error(
              `Depth transparent corner did not preserve background: ${corner}`,
            );
          if (
            alphaMode === "opaque" &&
            corner.slice(0, 3).some((value) => value !== 0)
          )
            throw Error(
              `Depth compatibility corner did not ignore source alpha: ${corner}`,
            );
          reports.push({ alphaMode, corner });
        } finally {
          preview.dispose();
        }
      }
      return reports;
    },
    { json: JSON.stringify(doc), assetUrls },
  );
}

/** Subpixel triangles may collapse after interpolation quantization; their coverage stays valid. */
export async function depthSmallRasterAcceptance(page: Page) {
  return page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts",
      renderer: typeof Render = await import(url),
      fixtures = [];
    const asset = async (id: string, color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 2;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 2, 2);
      const path = canvas.toDataURL("image/png"),
        bytes = await (await fetch(path)).arrayBuffer(),
        sha256 =
          "sha256:" +
          Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (value) => value.toString(16).padStart(2, "0"),
          ).join("");
      return { id, type: "image" as const, path, sha256, width: 2, height: 2 };
    };
    const assets = [
        await asset("source", "#ff0000"),
        await asset("depth", "#808080"),
      ],
      assetUrls = Object.fromEntries(
        assets.map((value) => [value.id, value.path]),
      );
    for (const [width, height] of [
      [1, 1],
      [2, 1],
      [4, 4],
    ] as const) {
      const doc: Composition = {
        schemaVersion: "composition-1",
        id: `depth-small-raster-${width}x${height}`,
        width: 16,
        height: 16,
        fps: 30,
        frameCount: 1,
        background: "#000000",
        assets,
        layers: [
          {
            id: "photo",
            type: "depth-image",
            size: [width, height],
            sourceAsset: "source",
            depth: {
              asset: "depth",
              encoding: "r8-unorm",
              width: 2,
              height: 2,
            },
            alphaMode: "opaque",
            overscan: 0,
            edgeDamping: 1,
            motion: { scale: 1, strength: 0, offset: [0, 0], roll: 0 },
            transform: {
              anchor: [0, 0],
              position: [0, 0],
              scale: [16 / width, 16 / height],
            },
          },
        ],
      };
      const resources = await renderer.loadCompositionResources(
          doc,
          (id) => assetUrls[id]!,
        ),
        preview = renderer.createCompositionPreview(
          document.createElement("canvas"),
          doc,
          resources,
          { backend: "webgl2" },
        );
      try {
        preview.renderFrame(0);
        const pixels = preview.readPixels();
        for (let offset = 0; offset < pixels.length; offset += 4)
          if (
            pixels[offset] !== 255 ||
            pixels[offset + 1] !== 0 ||
            pixels[offset + 2] !== 0 ||
            pixels[offset + 3] !== 255
          )
            throw Error(
              `Small depth raster ${width}x${height} lost opaque source coverage at ${offset / 4}`,
            );
      } finally {
        preview.dispose();
      }
      fixtures.push({
        name: doc.id,
        doc,
        assetUrls,
        backends: ["webgl2" as const],
        frames: [0],
      });
    }
    return fixtures;
  });
}
