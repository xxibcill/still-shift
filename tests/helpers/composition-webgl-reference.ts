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
  const referenceCanvas = document.createElement("canvas");
  referenceCanvas.width = WIDTH;
  referenceCanvas.height = HEIGHT;
  const expected = reference.wrap(
    referenceCanvas,
    referenceCanvas.getContext("2d", { alpha: false })!,
  );
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
    check("surface/blur-clipped", (backend, dst) => {
      const surface = backend.createSurface(40, 40);
      try {
        backend.fillRect(
          surface,
          I,
          40,
          40,
          [0.9, 0.6, 0.2, 1],
          1,
          "normal",
          [],
        );
        backend.composite(
          surface,
          dst,
          "normal",
          0.8,
          [1, 0, 0, 1, 20, 12],
          [{ matrix: [1, 0, 0, 1, 26, 18], width: 28, height: 25 }],
          undefined,
          4,
        );
      } finally {
        backend.releaseSurface(surface);
      }
    });
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
      for (const feather of [0, 7])
        check(`mask/${mode}/${feather}`, (backend, dst) => {
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
              feather,
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
    for (const radius of [0, 0.5, 1, 1.9, 2, 2.5, 4, 7, 12, 24])
      check(`effect/gaussian/${radius}`, (backend, dst) => {
        backend.clear(dst, null);
        backend.fillRect(
          dst,
          [1, 0, 0, 1, 21, 16],
          40,
          32,
          [0.9, 0.3, 0.7, 0.8],
          1,
          "normal",
          [],
        );
        backend.applyEffects(dst, [
          {
            id: "blur",
            effect: "blur.gaussian",
            enabled: true,
            params: { radius },
          },
        ]);
        const background = backend.createSurface(WIDTH, HEIGHT);
        backend.clear(background, [0.2, 0.4, 0.7, 1]);
        backend.composite(dst, background, "normal", 1, I, []);
        backend.clear(dst, null);
        backend.composite(background, dst, "normal", 1, I, []);
        backend.releaseSurface(background);
      });
    for (const effect of [
      {
        effect: "blur.directional",
        params: { length: 12, angle: 0, samples: 5 },
      },
      {
        effect: "blur.directional",
        params: { length: 8, angle: 37, samples: 8 },
      },
      {
        effect: "distort.sine",
        params: { amount: 5, wavelength: 24, phase: 0.7 },
      },
      {
        effect: "light.glow",
        params: { radius: 4, intensity: 0.7, threshold: 0.3 },
      },
      {
        effect: "light.radial",
        params: {
          x: 35,
          y: 23,
          radius: 38,
          strength: 0.65,
          color: [1, 0.7, 0.2, 1] as [number, number, number, number],
        },
      },
      {
        effect: "particles.rise",
        params: {
          progress: 0.31,
          count: 18,
          radius: 4,
          opacity: 0.7,
          seed: 812,
          color: [1, 0.7, 0.2, 1] as [number, number, number, number],
        },
      },
      {
        effect: "stylize.grain",
        params: { amount: 0.25, seed: 938, evolution: 4.7 },
      },
      {
        effect: "stylize.grain",
        params: { amount: 0.7, seed: 4294967295, evolution: 19.3 },
      },
      {
        effect: "light.sweep",
        params: {
          width: 70,
          height: 42,
          left: 0.1,
          top: 0.2,
          regionWidth: 0.7,
          regionHeight: 0.6,
          band: 0.2,
          progress: 0.44,
          strength: 0.65,
        },
        placement: {
          matrix: [1, 0.1, -0.08, 1, 13, 10] as Matrix,
          transforms: [[1, 0.1, -0.08, 1, 13, 10] as Matrix],
        },
      },
    ])
      check(
        `effect/${effect.effect}/${JSON.stringify(effect.params)}`,
        (backend, dst) => {
          const layer = backend.createSurface(WIDTH, HEIGHT);
          backend.clear(layer, [0.17, 0.36, 0.62, 1]);
          backend.fillRect(
            layer,
            [1, 0, 0, 1, 21.3, 16.4],
            40,
            32,
            [0.9, 0.3, 0.7, 0.8],
            1,
            "normal",
            [],
          );
          backend.applyEffects(layer, [
            { ...effect, id: "effect", enabled: true },
          ]);
          backend.composite(layer, dst, "normal", 1, I, []);
          backend.releaseSurface(layer);
        },
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

export async function checkCompositionBackends(paths: string[]) {
  const { createCompositionPreview, loadCompositionResources } = await import(
    "../../packages/renderer-core/src/composition/render/renderer.ts"
  );
  const { compareFrames } = await import(
    "../../packages/renderer-core/src/frame-tolerance.ts"
  );
  const result: {
    id: string;
    frames: number;
    maxDelta: number;
    psnr: number;
    ssim: number;
    worst: unknown;
  }[] = [];
  for (const path of paths) {
    const composition = await (await fetch(path)).json();
    const resources = await loadCompositionResources(composition, (id) => {
      const asset = composition.assets.find((a: { id: string }) => a.id === id);
      return new URL(asset.path, new URL(path, location.href)).href;
    });
    const canvas = document.createElement("canvas"),
      webgl = document.createElement("canvas");
    const reference = createCompositionPreview(canvas, composition, resources),
      gpu = createCompositionPreview(webgl, composition, resources, {
        backend: "webgl2",
      });
    let maxDelta = 0,
      psnr = 999,
      ssim = 1;
    let worst: unknown = null;
    try {
      for (let frame = 0; frame < composition.frameCount; frame++) {
        reference.renderFrame(frame);
        gpu.renderFrame(frame);
        const expected = reference.readPixels(),
          actual = gpu.readPixels();
        const metrics = compareFrames(
          expected,
          actual,
          composition.width,
          composition.height,
        );
        if (metrics.maxChannelDelta > maxDelta) {
          const offset = expected.findIndex(
            (value, index) =>
              index % 4 !== 3 &&
              Math.abs(value - actual[index]!) === metrics.maxChannelDelta,
          );
          const pixel = offset - (offset % 4);
          worst = {
            frame,
            x: (pixel / 4) % composition.width,
            y: Math.floor(pixel / 4 / composition.width),
            expected: Array.from(expected.slice(pixel, pixel + 4)),
            actual: Array.from(actual.slice(pixel, pixel + 4)),
          };
        }
        maxDelta = Math.max(maxDelta, metrics.maxChannelDelta);
        psnr = Math.min(psnr, metrics.psnr);
        ssim = Math.min(ssim, metrics.ssim);
      }
    } finally {
      reference.dispose();
      gpu.dispose();
    }
    result.push({
      id: path,
      frames: composition.frameCount,
      maxDelta,
      psnr,
      ssim,
      worst,
    });
  }
  return result;
}
