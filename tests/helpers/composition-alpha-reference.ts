import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { unpremultiplyDrawingBufferRgba } from "../../packages/renderer-core/src/composition/render/webgl-rgba.ts";

const resources = () => ({ images: new Map(), fonts: new Map() });

function equalBytes(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  id: string,
) {
  if (actual.length !== expected.length)
    throw Error(`${id}: byte count differs`);
  for (let i = 0; i < actual.length; i++)
    if (actual[i] !== expected[i])
      throw Error(`${id}: byte ${i}, ${actual[i]} instead of ${expected[i]}`);
}

function fixture(id: string): Composition {
  return {
    schemaVersion: "composition-1",
    id,
    width: 32,
    height: 24,
    fps: 24,
    frameCount: 4,
    background: null,
    assets: [],
    layers: [
      {
        id: "moving",
        type: "solid",
        size: [7, 5],
        color: "#ffffff80",
        transform: {
          anchor: [0, 0],
          position: {
            keys: [
              { frame: 0, value: [2, 3], easing: "linear" },
              { frame: 3, value: [21, 14] },
            ],
          },
        },
      },
    ],
  };
}

async function decodeCanvasPng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(Error("PNG capture failed"))),
      "image/png",
    ),
  );
  const response = await fetch("/_alpha/decode-png", {
    method: "POST",
    body: blob,
  });
  if (!response.ok)
    throw Error(`Independent PNG decode failed: ${await response.text()}`);
  const pixels = new Uint8ClampedArray(await response.arrayBuffer());
  if (pixels.length !== canvas.width * canvas.height * 4)
    throw Error("Independent PNG decode returned the wrong byte count");
  return pixels;
}

export async function checkCompositionAlpha() {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    for (const background of [
      undefined,
      null,
      "#cc663300",
      "#cc663380",
      "#ffffff80",
      "#224466",
    ] as const) {
      const comp = fixture("alpha-clear");
      comp.layers = [];
      if (background === undefined) delete comp.background;
      else comp.background = background;
      for (const preserveAlpha of [false, true]) {
        const canvas = document.createElement("canvas");
        const preview = createCompositionPreview(canvas, comp, resources(), {
          backend,
          preserveAlpha,
        });
        try {
          preview.renderFrame(0);
          const pixels = preview.readPixels();
          const expectedAlpha = preserveAlpha
            ? background === "#ffffff80"
              ? 128
              : background === "#cc663380"
                ? 128
                : background === "#224466"
                  ? 255
                  : 0
            : 255;
          for (let i = 3; i < pixels.length; i += 4)
            if (pixels[i] !== expectedAlpha)
              throw Error(
                `Clear ${backend}/${background}/${preserveAlpha}: alpha ${pixels[i]}`,
              );
          if (
            preserveAlpha &&
            expectedAlpha === 0 &&
            pixels.some((value) => value !== 0)
          )
            throw Error(
              `Transparent clear retains color: ${backend}/${background}`,
            );
          const decoded = await decodeCanvasPng(canvas);
          equalBytes(
            decoded,
            pixels,
            `PNG clear ${backend}/${background}/${preserveAlpha}`,
          );
          reports.push({
            kind: "clear",
            backend,
            background: background ?? null,
            preserveAlpha,
            alpha: expectedAlpha,
          });
        } finally {
          preview.dispose();
        }
      }
    }
    for (const variant of [
      "moving",
      "colored",
      "gaussian",
      "matte",
      "exposure",
      "linear",
      "precomp",
    ]) {
      const comp = fixture(`alpha-${variant}`);
      const moving = comp.layers[0]!;
      if (variant === "colored" && moving.type === "solid")
        moving.color = "#cc663380";
      if (variant === "gaussian")
        comp.layers[0]!.effects = [
          { id: "blur", effect: "blur.gaussian", params: { radius: 2 } },
        ];
      if (variant === "matte") {
        comp.layers.unshift({
          id: "matte",
          type: "solid",
          size: [24, 24],
          color: "#ffffff80",
          transform: { anchor: [0, 0] },
        });
        comp.layers[1]!.trackMatte = { layer: "matte", mode: "alpha" };
      }
      if (variant === "exposure") {
        comp.motionBlur = {
          enabled: true,
          shutterAngle: 180,
          shutterPhase: 0,
          samples: 4,
        };
        comp.layers[0]!.motionBlur = true;
      }
      if (variant === "linear") comp.colorSpace = "linear-srgb";
      if (variant === "precomp") {
        comp.precomps = [
          {
            id: "nested",
            width: comp.width,
            height: comp.height,
            fps: comp.fps,
            frameCount: comp.frameCount,
            background: null,
            layers: comp.layers,
          },
        ];
        comp.layers = [
          {
            id: "host",
            type: "precomp",
            comp: "nested",
            transform: { anchor: [0, 0] },
          },
        ];
      }
      const canvas = document.createElement("canvas");
      const preview = createCompositionPreview(canvas, comp, resources(), {
        backend,
        preserveAlpha: true,
      });
      let partialAlphaPixels = 0;
      try {
        const original = new Map<number, Uint8ClampedArray>();
        for (const frame of [0, 1, 2, 3, 1, 0, 3, 2]) {
          preview.renderFrame(frame);
          const actual = preview.readPixels();
          if (frame === 0 && (variant === "moving" || variant === "colored")) {
            const center = (5 * comp.width + 5) * 4;
            equalBytes(
              actual.slice(center, center + 4),
              variant === "colored"
                ? [203, 102, 52, 128]
                : [255, 255, 255, 128],
              `Authored source alpha ${backend}/${variant}`,
            );
            equalBytes(
              actual.slice(0, 4),
              [0, 0, 0, 0],
              `Unpainted ${backend}/${variant}`,
            );
          }
          const fresh = createCompositionPreview(
            document.createElement("canvas"),
            comp,
            resources(),
            { backend, preserveAlpha: true },
          );
          try {
            fresh.renderFrame(frame);
            equalBytes(
              actual,
              fresh.readPixels(),
              `Fresh read ${backend}/${variant}/${frame}`,
            );
          } finally {
            fresh.dispose();
          }
          if (original.has(frame))
            equalBytes(
              actual,
              original.get(frame)!,
              `Reverse ${backend}/${variant}/${frame}`,
            );
          else original.set(frame, actual);
          const decoded = await decodeCanvasPng(canvas);
          equalBytes(decoded, actual, `PNG ${backend}/${variant}/${frame}`);
          for (let i = 3; i < actual.length; i += 4)
            if (actual[i]! > 0 && actual[i]! < 255) partialAlphaPixels++;
        }
        if (partialAlphaPixels === 0)
          throw Error(`No actual partial alpha: ${backend}/${variant}`);
        reports.push({
          kind: variant,
          backend,
          frames: 8,
          partialAlphaPixels,
          freshReads: "exact",
          reverseReads: "exact",
          png: "exact",
        });
      } finally {
        preview.dispose();
      }
    }
  }
  return { cases: reports.length, reports };
}

/** Actual encoded PNG bytes distinguish tie rounding across all valid byte/alpha pairs. */
export async function inspectAlphaQuantization() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const device = new WebglDevice(canvas, true);
  const source = device.surface(256, 256);
  const target = device.surface(256, 256, false, false, true);
  try {
    const input = new Uint8Array(256 * 256 * 4);
    for (let alpha = 0; alpha < 256; alpha++)
      for (let value = 0; value < 256; value++)
        input.set([value, value, value, alpha], (alpha * 256 + value) * 4);
    device.uploadBytes(source, input);
    device.pass("void main() { pixel=texture(source,uv); }", target, [source]);
    const raw = device.read(target);
    equalBytes(raw, input, "Actual premultiplied quantization input");
    const decoded = await decodeCanvasPng(canvas);
    const captured = unpremultiplyDrawingBufferRgba(raw);
    for (let value = 0; value < 256; value++)
      equalBytes(
        decoded.slice(value * 4, value * 4 + 4),
        [0, 0, 0, 0],
        `Zero-alpha PNG ${value}`,
      );
    const even = new Uint8ClampedArray(1);
    const f = Math.fround;
    const candidates: Record<string, (value: number, alpha: number) => number> =
      {
        normalizedDivision: (c, a) =>
          f(f(f(c / 255) * f(1 / f(a / 255))) * 255),
        normalizedMultiply: (c, a) =>
          f(f(f(c * f(1 / 255)) * f(1 / f(a * f(1 / 255)))) * 255),
        normalizedDivisionWide: (c, a) =>
          f(f(c / 255) * f(1 / f(a / 255))) * 255,
        normalizedMultiplyWide: (c, a) =>
          f(f(c * f(1 / 255)) * f(1 / f(a * f(1 / 255)))) * 255,
        byteScale: (c, a) => f(c * f(255 / a)),
        reciprocalByte: (c, a) => f(f(c * f(1 / a)) * 255),
        fraction: (c, a) => f(f(c / a) * 255),
        fixedScale: (c, a) =>
          Math.floor((Math.round(4278190080 / a) * c + 8388608) / 16777216),
      };
    const candidateMismatches: Record<string, number> = Object.fromEntries(
      Object.keys(candidates).map((name) => [name, 0]),
    );
    let validPairs = 0,
      nearestUpMismatches = 0,
      nearestEvenMismatches = 0,
      drawingBufferMismatches = 0;
    const examples = [];
    for (let alpha = 1; alpha < 256; alpha++)
      for (let value = 0; value <= alpha; value++) {
        const offset = (alpha * 256 + value) * 4;
        const actual = decoded[offset]!;
        const scaled = (value * 255) / alpha;
        const up = Math.round(scaled);
        even[0] = scaled;
        const nearestEven = even[0];
        validPairs++;
        if (actual !== captured[offset]) drawingBufferMismatches++;
        equalBytes(
          decoded.slice(offset, offset + 4),
          [actual, actual, actual, alpha],
          `Encoded grayscale ${alpha}/${value}`,
        );
        if (actual !== up) nearestUpMismatches++;
        if (actual !== nearestEven) nearestEvenMismatches++;
        for (const [name, candidate] of Object.entries(candidates)) {
          even[0] = candidate(value, alpha);
          if (actual !== even[0])
            candidateMismatches[name] = (candidateMismatches[name] ?? 0) + 1;
        }
        if (actual !== up && examples.length < 12)
          examples.push({
            alpha,
            value,
            actual,
            nearestUp: up,
            nearestEven,
          });
        if (decoded[offset + 3] !== alpha)
          throw Error(`PNG alpha changed: ${alpha}/${value}`);
      }
    return {
      validPairs,
      nearestUpMismatches,
      nearestEvenMismatches,
      drawingBufferMismatches,
      zeroAlphaPairs: 256,
      candidateMismatches,
      examples,
    };
  } finally {
    device.dispose();
  }
}

export async function checkAlphaQuantization() {
  const result = await inspectAlphaQuantization();
  if (result.validPairs !== 32895 || result.drawingBufferMismatches !== 0)
    throw Error(
      `Transparent drawing buffer differs from PNG: ${JSON.stringify(result)}`,
    );
  return result;
}
