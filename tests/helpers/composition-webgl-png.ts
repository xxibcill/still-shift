import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { createWebgl2Backend } from "../../packages/renderer-core/src/composition/render/webgl2.ts";
import { WebglPngImages } from "../../packages/renderer-core/src/composition/render/webgl-png-images.ts";
import { loadCompositionResources } from "../../packages/renderer-core/src/composition/render/renderer.ts";
import type { ImageContent } from "../../packages/renderer-core/src/composition/render/graph.ts";
import type { Matrix } from "../../packages/renderer-core/src/node-transform.ts";
import {
  compareFrames,
  meetsTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";

/** Exercise direct sampling and conservative fallbacks independently of family artwork. */
export async function checkWebglPngImages() {
  const reports = [];
  for (const border of [0, 16]) {
    const source = document.createElement("canvas");
    source.width = 384;
    source.height = 256;
    const ctx = source.getContext("2d")!;
    for (let y = border; y < 256 - border; y += 4)
      for (let x = border; x < 384 - border; x += 4) {
        ctx.fillStyle = `rgba(${x % 256},${y % 256},${(x + y) % 256},${((x + y) % 20) / 20 + 0.1})`;
        ctx.fillRect(x, y, 4, 4);
      }
    const urls = new Map([
      ["png", source.toDataURL()],
      [
        "svg",
        "data:image/svg+xml," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="384" height="256"/>',
          ),
      ],
    ]);
    const assets: Composition["assets"] = [];
    for (const [id, url] of urls) {
      const bytes = await (await fetch(url)).arrayBuffer();
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes),
      );
      assets.push({
        id,
        type: "image",
        path: id === "png" ? "misleading.svg" : "misleading.png",
        width: 384,
        height: 256,
        sha256: `sha256:${Array.from(digest, (v) => v.toString(16).padStart(2, "0")).join("")}`,
      });
    }
    const composition: Composition = {
      schemaVersion: "composition-1",
      id: "png-resources",
      width: 640,
      height: 480,
      fps: 30,
      frameCount: 1,
      background: "#f2ede3",
      assets,
      layers: [],
    };
    const resources = await loadCompositionResources(
      composition,
      (id) => urls.get(id)!,
    );
    if (!resources.pngImages?.has("png") || resources.pngImages.has("svg"))
      throw new Error(
        "PNG eligibility must follow verified bytes, not filenames",
      );
    const options = {
      images: {
        images: resources.images,
        pngImages: resources.pngImages,
        sizes: new Map([["png", [384, 256] as const]]),
      },
      drawText: () => {},
    };
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const referenceCanvas = canvas.cloneNode() as HTMLCanvasElement;
    const gpu = createWebgl2Backend(canvas, options);
    const cpu = createCanvas2dBackend(options);
    const reference = cpu.wrap(
      referenceCanvas,
      referenceCanvas.getContext("2d", { alpha: false })!,
    );
    let sampled = 0,
      maxDelta = 0;
    const original = WebglPngImages.prototype.draw;
    WebglPngImages.prototype.draw = function (...args) {
      const accepted = original.apply(this, args);
      if (accepted) sampled++;
      return accepted;
    };
    let seed = 47;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const cases = [
      ...[0.2, 0.25, 0.25001, 0.4, 0.5, 0.50001, 0.75, 1, 1.3].map((scale) => ({
        scale,
        x: 0.25,
        y: 20.25,
        opacity: 0.37,
      })),
      ...Array.from({ length: 40 }, () => ({
        scale: 0.12 + random() * 0.85,
        x: -20 + random() * 160,
        y: random() * 150,
        opacity: 0.1 + random() * 0.9,
      })),
    ];
    const sources = [{ asset: "png" }];
    const expected = new Map<number, Uint8ClampedArray>();
    try {
      const sequence = [
        ...cases.keys(),
        cases.length - 1,
        Math.floor(cases.length / 2),
        0,
        0,
      ];
      for (const index of sequence) {
        const { scale, x, y, opacity } = cases[index]!;
        const matrix: Matrix = [scale, 0, 0, scale, x, y];
        const transforms: Matrix[] = [
          [1.07, 0, 0, 1.07, 37.123, -11.77],
          [
            scale / 1.07,
            0,
            0,
            scale / 1.07,
            (x - 37.123) / 1.07,
            (y + 11.77) / 1.07,
          ],
        ];
        const content: ImageContent = {
          type: "image",
          width: index % 2 ? 500 : 384,
          height: 256,
          fit: "contain",
          rasterize: "draw",
          sources,
          state: 0,
        };
        gpu.clear(gpu.target, [0.95, 0.93, 0.89, 1]);
        cpu.clear(reference, [0.95, 0.93, 0.89, 1]);
        const sampledBefore = sampled;
        gpu.drawImage(
          gpu.target,
          content,
          matrix,
          opacity,
          "normal",
          [],
          transforms,
        );
        if (scale >= 0.5 && sampled !== sampledBefore)
          throw new Error(`PNG ${border}/${index}: ordinary scale sampled`);
        cpu.drawImage(
          reference,
          content,
          matrix,
          opacity,
          "normal",
          [],
          transforms,
        );
        gpu.present();
        const actual = gpu.readPixels(gpu.target);
        const previous = expected.get(index);
        if (previous && actual.some((value, i) => value !== previous[i]))
          throw new Error(`PNG ${border}/${index}: seek-dependent pixels`);
        if (!previous) expected.set(index, actual);
        const result = compareFrames(
          cpu.readPixels(reference),
          actual,
          640,
          480,
        );
        if (!meetsTier(result, "near"))
          throw new Error(`PNG ${border}/${index}: ${JSON.stringify(result)}`);
        maxDelta = Math.max(maxDelta, result.maxChannelDelta);
      }
      if (border === 0 ? sampled !== 0 : sampled < 15)
        throw new Error(
          `Unexpected PNG sampling eligibility: ${border}/${sampled}`,
        );
      reports.push({ border, frames: sequence.length, sampled, maxDelta });
    } finally {
      WebglPngImages.prototype.draw = original;
      gpu.dispose();
      cpu.dispose();
    }
  }
  return reports;
}
