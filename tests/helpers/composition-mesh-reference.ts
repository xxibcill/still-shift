import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
export function checkMeshRendering() {
  const source = document.createElement("canvas");
  source.width = 64;
  source.height = 64;
  const context = source.getContext("2d")!;
  const pixels = context.createImageData(64, 64);
  for (let y = 8; y < 56; y++)
    for (let x = 8; x < 56; x++) {
      if (x >= 24 && x < 32 && y >= 24 && y < 32) continue;
      pixels.data.set(
        [60 + x * 2, 40 + y * 2, 120, (x + y) % 9 === 0 ? 128 : 255],
        (y * 64 + x) * 4,
      );
    }
  context.putImageData(pixels, 0, 0);
  const reports = [];
  for (const effect of [
    {
      id: "bezier",
      effect: "distort.mesh-warp",
      params: {
        size: [64, 64],
        subdivisions: 12,
        controls: [
          [0, 0],
          [1, 0.1],
          [0.1, 1],
          [0.9, 0.9],
        ],
      },
    },
    {
      id: "puppet",
      effect: "distort.puppet",
      params: {
        rest: [
          [10, 10],
          [50, 10],
          [32, 50],
        ],
        pins: [
          [10, 10],
          [51, 18],
          [32, 50],
        ],
        refinement: 2,
      },
    },
  ]) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: effect.id,
      width: 96,
      height: 96,
      fps: 24,
      frameCount: 2,
      assets: [
        {
          id: "tile",
          type: "image",
          path: "tile.png",
          width: 64,
          height: 64,
          sha256: `sha256:${"0".repeat(64)}`,
        },
      ],
      layers: [
        {
          id: "art",
          type: "image",
          size: [64, 64],
          fit: "stretch",
          sources: [{ asset: "tile" }],
          transform: { anchor: [0, 0], position: [16, 16] },
          effects: [effect],
        },
      ],
    };
    const results = [];
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const preview = createCompositionPreview(
        document.createElement("canvas"),
        comp,
        { images: new Map([["tile", source]]), fonts: new Map() },
        { backend, preserveAlpha: true },
      );
      try {
        preview.renderFrame(0);
        const bytes = preview.readPixels().slice();
        preview.renderFrame(1);
        preview.renderFrame(0);
        const repeat = preview.readPixels();
        if (bytes.some((value, i) => value !== repeat[i]))
          throw Error(`Mesh reverse seek differs for ${effect.id}/${backend}`);
        results.push(bytes);
      } finally {
        preview.dispose();
      }
    }
    let maxDelta = 0,
      different = 0,
      total = 0;
    for (let i = 0; i < results[0]!.length; i++) {
      const delta = Math.abs(results[0]![i]! - results[1]![i]!);
      maxDelta = Math.max(maxDelta, delta);
      if (delta) different++;
      total += delta;
    }
    const worst = [];
    let alphaDelta = 0,
      premultipliedDelta = 0;
    for (let at = 0; at < results[0]!.length; at += 4) {
      const a = results[0]!.slice(at, at + 4),
        b = results[1]!.slice(at, at + 4);
      alphaDelta = Math.max(alphaDelta, Math.abs(a[3]! - b[3]!));
      for (let c = 0; c < 3; c++)
        premultipliedDelta = Math.max(
          premultipliedDelta,
          Math.abs(
            Math.round((a[c]! * a[3]!) / 255) -
              Math.round((b[c]! * b[3]!) / 255),
          ),
        );
      if (a.some((v, c) => Math.abs(v - b[c]!) > 5) && worst.length < 16)
        worst.push({
          x: (at / 4) % 96,
          y: Math.floor(at / 4 / 96),
          a: [...a],
          b: [...b],
        });
    }
    if (maxDelta > 2 || alphaDelta > 1 || premultipliedDelta > 1)
      throw Error(
        `Mesh pixel mismatch ${effect.id}: ${maxDelta}/${alphaDelta}/${premultipliedDelta}`,
      );
    reports.push({
      alphaDelta,
      premultipliedDelta,
      worst,
      id: effect.id,
      maxDelta,
      different,
      meanDelta: total / results[0]!.length,
      nonzero: results.map(
        (bytes) => bytes.filter((value, i) => i % 4 === 3 && value > 0).length,
      ),
    });
  }
  const gl = document.createElement("canvas").getContext("webgl2")!;
  return { subpixelBits: gl.getParameter(gl.SUBPIXEL_BITS), reports };
}
