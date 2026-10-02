import {
  createCanvas2dBackend,
  type Canvas2dBackendOptions,
} from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { createWebgl2Backend } from "../../packages/renderer-core/src/composition/render/webgl2.ts";
import type {
  RenderBackend,
  Surface,
} from "../../packages/renderer-core/src/composition/render/backend.ts";
import type { CompositionBlendMode } from "../../packages/scene-contract/src/index.ts";
import type { Matrix } from "../../packages/renderer-core/src/node-transform.ts";
const I: Matrix = [1, 0, 0, 1, 0, 0];
const WIDTH = 96,
  HEIGHT = 64;
type Paint = <S extends Surface>(backend: RenderBackend<S>, target: S) => void;

export function checkWebglFrames() {
  const asset = document.createElement("canvas");
  asset.width = 32;
  asset.height = 24;
  const actx = asset.getContext("2d")!;
  actx.fillStyle = "#cc4b8baa";
  actx.fillRect(0, 0, 32, 24);
  actx.fillStyle = "#17e466";
  actx.fillRect(4, 7, 21, 12);
  const options: Canvas2dBackendOptions = {
    images: {
      images: new Map([["image", asset]]),
      sizes: new Map([["image", [32, 24]]]),
    },
    drawText: (ctx) => {
      ctx.fillStyle = "#2784cd";
      ctx.fillRect(-3, 4, 31, 17);
    },
    drawProvider: (ctx) => {
      ctx.fillStyle = "#abcd58";
      ctx.beginPath();
      ctx.arc(20, 13, 11, 0, Math.PI * 2);
      ctx.fill();
    },
  };
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const gpu = createWebgl2Backend(canvas, options),
    reference = createCanvas2dBackend(options);
  const expected = reference.createSurface(WIDTH, HEIGHT);
  const results: {
    id: string;
    maxDelta: number;
    psnr: number;
    passes: number;
  }[] = [];
  const check = (id: string, paint: Paint) => {
    reference.clear(expected, [0.17, 0.36, 0.62, 1]);
    gpu.clear(gpu.target, [0.17, 0.36, 0.62, 1]);
    paint(reference, expected);
    paint(gpu, gpu.target);
    gpu.present();
    const a = reference.readPixels(expected),
      b = gpu.readPixels(gpu.target);
    let maxDelta = 0,
      squared = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i]! - b[i]!);
      maxDelta = Math.max(maxDelta, d);
      squared += d * d;
    }
    results.push({
      id,
      maxDelta,
      psnr: squared ? 10 * Math.log10((255 * 255 * a.length) / squared) : 999,
      passes: gpu.passes,
    });
  };
  try {
    const modes: CompositionBlendMode[] = [
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
      "hard-light",
      "soft-light",
      "difference",
      "exclusion",
      "hue",
      "saturation",
      "color",
      "luminosity",
      "add",
    ];
    for (const mode of modes)
      check(`blend/${mode}`, (backend, dst) => {
        for (let i = 0; i < 9; i++)
          backend.fillRect(
            dst,
            [1, 0, 0, 1, i * 10, 2],
            10,
            55,
            [i / 9, 1 - i / 10, 0.37, 0.2 + i / 12],
            0.87,
            mode,
            [],
          );
      });
    check("layer/overlap", (backend, dst) => {
      for (let i = 0; i < 12; i++)
        backend.fillRect(
          dst,
          [0.97, 0.07, -0.08, 1, 4 + i * 4.2, 3 + i * 2.3],
          30,
          25,
          [0.74, 0.23, 0.41, 0.72],
          0.85,
          "normal",
          [],
        );
    });
    check("layer/image", (backend, dst) =>
      backend.drawImage(
        dst,
        {
          type: "image",
          width: 52,
          height: 40,
          fit: "contain",
          rasterize: "draw",
          sources: [{ asset: "image" }],
          state: 0,
        },
        [1, 0.06, -0.04, 1, 18.25, 11.5],
        0.8,
        "normal",
        [],
      ),
    );
    for (const mode of [
      "alpha",
      "alpha-inverted",
      "luma",
      "luma-inverted",
    ] as const)
      check(`matte/${mode}`, (backend, dst) => {
        const source = backend.createSurface(WIDTH, HEIGHT),
          matte = backend.createSurface(WIDTH, HEIGHT);
        backend.fillRect(
          source,
          I,
          WIDTH,
          HEIGHT,
          [0.9, 0.7, 0.2, 0.7],
          1,
          "normal",
          [],
        );
        backend.fillRect(
          matte,
          [1, 0, 0, 1, 23.4, 16.2],
          52,
          35,
          [0.1, 0.7, 0.5, 0.6],
          1,
          "normal",
          [],
        );
        backend.applyMatte(source, matte, mode);
        backend.composite(source, dst, "normal", 0.8, I, []);
        backend.releaseSurface(source);
        backend.releaseSurface(matte);
      });
    for (const mode of ["add", "subtract", "intersect", "difference"] as const)
      check(`mask/${mode}`, (backend, dst) => {
        const source = backend.createSurface(WIDTH, HEIGHT);
        backend.fillRect(
          source,
          I,
          WIDTH,
          HEIGHT,
          [0.8, 0.4, 0.2, 0.9],
          1,
          "normal",
          [],
        );
        backend.applyMask(source, [
          {
            id: "mask",
            mode,
            path: {
              vertices: [
                [12, 8],
                [74, 13],
                [65, 52],
              ],
              closed: true,
            },
            inverted: true,
            feather: 0,
            expansion: 2,
            opacity: 0.7,
            matrix: I,
          },
        ]);
        backend.composite(source, dst, "normal", 1, I, []);
        backend.releaseSurface(source);
      });
    check("surface/transform", (backend, dst) => {
      const surface = backend.createSurface(32, 24);
      backend.fillRect(
        surface,
        I,
        25,
        19,
        [0.24, 0.7, 0.3, 0.7],
        1,
        "normal",
        [],
      );
      backend.composite(
        surface,
        dst,
        "normal",
        0.8,
        [1.4, 0.15, -0.1, 1.3, 12.25, 9.75],
        [],
      );
      backend.releaseSurface(surface);
    });
    check("adjustment/coverage", (backend, dst) => {
      const source = backend.createSurface(WIDTH, HEIGHT),
        coverage = backend.createSurface(WIDTH, HEIGHT);
      backend.fillRect(
        source,
        I,
        WIDTH,
        HEIGHT,
        [0.2, 0.7, 0.4, 0.8],
        1,
        "normal",
        [],
      );
      backend.fillRect(
        coverage,
        [1, 0, 0, 1, 20.5, 12.2],
        45,
        35,
        [1, 1, 1, 1],
        0.6,
        "normal",
        [],
      );
      backend.lerp(dst, source, coverage, 0.7);
      backend.releaseSurface(source);
      backend.releaseSurface(coverage);
    });
    for (const count of [2, 8, 32, 64])
      check(`exposure/${count}`, (backend, dst) =>
        backend.accumulateExposure(dst, count, (i) => {
          backend.clear(dst, [0.17, 0.36, 0.62, 1]);
          backend.fillRect(
            dst,
            [1, 0, 0, 1, 5 + (i / count) * 22, 12],
            20,
            30,
            [0.8, 0.3, 0.6, 1],
            1,
            "normal",
            [],
          );
        }),
      );
    const allocated = gpu.allocated;
    for (let i = 0; i < 100; i++) {
      const surface = gpu.createSurface(WIDTH, HEIGHT);
      gpu.releaseSurface(surface);
    }
    if (gpu.allocated !== allocated)
      throw new Error("WebGL surface pool grew across repeated acquisitions");
    return results;
  } finally {
    gpu.dispose();
    reference.dispose();
  }
}
