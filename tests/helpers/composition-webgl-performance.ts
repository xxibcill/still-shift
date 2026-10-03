import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";
import { WebglBounds } from "../../packages/renderer-core/src/composition/render/webgl-bounds.ts";
import {
  WebglDevice,
  type WebglSurface,
} from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { WebglEffects } from "../../packages/renderer-core/src/composition/render/webgl-effects.ts";

/**
 * The original per-pixel generator with an exact backdrop fetch. Linear
 * sampling at texel centers can be marginally inexact on SwiftShader, which
 * changes results lying within ~0.002 bytes of a rounding boundary.
 */
const PER_PIXEL_GRAIN = `uniform vec2 seedParts; uniform float amount;
uint advance(uint state,uint count) {
  uint a=1664525u,c=1013904223u,m=1u,b=0u;
  for(int i=0;i<16;i++) {
    if((count&1u)!=0u) {m*=a;b=b*a+c;}
    c*=a+1u; a*=a; count>>=1;
  }
  return state*m+b;
}
void main() {
  uvec2 p=uvec2(gl_FragCoord.xy)%128u;
  uint seed=uint(seedParts.x)+(uint(seedParts.y)<<16);
  uint value=advance(seed,(p.y*128u+p.x)*2u+1u);
  float color=value<2147483648u?0.0:1.0;
  uint next=value*1664525u+1013904223u;
  float a=floor(float(next)*(1.0/4294967296.0)*amount*255.0+0.5)/255.0;
  pixel=bytes(vec4(vec3(color*a),a)+texelFetch(source,ivec2(gl_FragCoord.xy),0)*(1.0-a));
}`;
const COPY = "void main() { pixel = texture(source, uv); }";

function content(width: number, height: number, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(width, height);
  let state = seed >>> 0;
  for (let i = 0; i < pixels.data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    pixels.data[i] = state >>> 24;
  }
  // Include fully transparent, opaque and edge alpha bytes.
  for (let i = 3; i < pixels.data.length; i += 4 * 7) pixels.data[i] = 0;
  for (let i = 3 + 4 * 3; i < pixels.data.length; i += 4 * 11)
    pixels.data[i] = 255;
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/** Tiled, blended grain must reproduce the exact per-pixel generator byte for byte. */
export function checkWebglGrainTile() {
  const results: { id: string; pixels: number }[] = [];
  const raster = createCanvas2dBackend({
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
  });
  for (const [width, height] of [
    [301, 257],
    [128, 128],
    [1080, 131],
  ] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const device = new WebglDevice(canvas);
    const screen = device.surface(width, height, false, true, true);
    const bounds = new WebglBounds(screen);
    const effects = new WebglEffects(device, raster, bounds);
    const read = (surface: WebglSurface) =>
      device.readRegion(surface, 0, 0, width, height);
    try {
      for (const [seed, amount, evolution] of [
        [37, 0.045, 0],
        [37, 0.045, 17.9],
        [4294967295, 1, 3],
        [0, 0.5, 0],
        [123456789, 0.2, 65535],
      ] as const) {
        const params = { seed, amount, evolution };
        const combined = (seed + Math.floor(evolution) * 7919) >>> 0;
        const uniforms = {
          seedParts: [combined & 65535, combined >>> 16],
          amount,
        };
        const source = device.surface(width, height);
        device.upload(source, content(width, height, seed ^ width));
        for (const target of ["layer", "screen"] as const) {
          const reference =
            target === "screen" ? screen : device.surface(width, height);
          let expected: Uint8Array;
          if (target === "screen") {
            device.pass(COPY, screen, [source]);
            device.pass(PER_PIXEL_GRAIN, screen, [screen], uniforms);
            expected = read(screen);
            device.pass(COPY, screen, [source]);
            effects.apply(screen, [
              { id: "grain", effect: "stylize.grain", enabled: true, params },
            ]);
          } else {
            device.pass(PER_PIXEL_GRAIN, reference, [source], uniforms);
            expected = read(reference);
            device.pass(COPY, reference, [source]);
            effects.apply(reference, [
              { id: "grain", effect: "stylize.grain", enabled: true, params },
            ]);
          }
          const actual = read(reference);
          const differing = expected.findIndex((v, i) => v !== actual[i]);
          if (differing >= 0)
            throw new Error(
              `grain ${target} ${width}x${height} ${JSON.stringify(params)} differs at byte ${differing}: ${expected[differing]} != ${actual[differing]}`,
            );
          results.push({
            id: `${target}/${width}x${height}/${seed}/${amount}/${evolution}`,
            pixels: width * height,
          });
          if (reference !== screen) device.release(reference);
        }
        device.release(source);
      }
    } finally {
      device.dispose();
    }
  }
  raster.dispose();
  return results.length;
}

/**
 * Grain composites `g + d·(1−a)` with `g ∈ {0, a}`. Check fixed-function
 * source-over against the shader formula for every backdrop byte, alpha byte
 * and grain color on the active renderer, into a texture and the canvas.
 */
export function checkWebglGrainBlending() {
  let checked = 0;
  for (const screen of [false, true]) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const device = new WebglDevice(canvas);
    const gl = device.gl;
    // The opaque canvas keeps alpha at one; textures cover every alpha byte.
    const backdrop = device.surface(256, 256);
    const shaded = device.surface(256, 256, false, screen);
    const blended = screen
      ? device.surface(256, 256, false, true, true)
      : device.surface(256, 256);
    device.pass(
      `void main() { float d=floor(gl_FragCoord.x)/255.0; pixel=vec4(d,d,d,${screen ? "1.0" : "d"}); }`,
      backdrop,
      [],
    );
    try {
      for (const color of [0, 1]) {
        const source = `uniform float color; vec4 grain() { float a=floor(gl_FragCoord.y)/255.0; return vec4(vec3(color*a),a); }`;
        device.pass(
          `${source} void main() { vec4 g=grain(); pixel=bytes(g+texture(source,uv)*(1.0-g.a)); }`,
          shaded,
          [backdrop],
          { color },
        );
        device.pass(
          screen
            ? "void main() { pixel = texelFetch(source, ivec2(gl_FragCoord.xy), 0); }"
            : COPY,
          blended,
          [backdrop],
        );
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        try {
          device.pass(
            `${source} void main() { pixel=grain(); }`,
            blended,
            [],
            { color },
            true,
          );
        } finally {
          gl.disable(gl.BLEND);
        }
        const expected = device.read(shaded),
          actual = device.read(blended);
        const differing = expected.findIndex(
          (v, i) => v !== actual[i] && !(screen && i % 4 === 3),
        );
        if (differing >= 0) {
          const pixel = differing >> 2;
          throw new Error(
            `grain blending differs (${screen ? "canvas" : "texture"}): color ${color} backdrop ${pixel % 256} alpha ${pixel >> 8} channel ${differing % 4}: ${expected[differing]} != ${actual[differing]}`,
          );
        }
        checked += 256 * 256;
      }
    } finally {
      device.dispose();
    }
  }
  return checked;
}

/** Independent separable integer convolution with the raster reciprocal division. */
function referenceBlur(
  source: Uint8Array,
  width: number,
  height: number,
  lengths: number[],
) {
  let weights = [1];
  for (const length of lengths) {
    const next = Array<number>(weights.length + length - 1).fill(0);
    for (let i = 0; i < weights.length; i++)
      for (let j = 0; j < length; j++) next[i + j]! += weights[i]!;
    weights = next;
  }
  const radius = (weights.length - 1) / 2,
    divisor = lengths.reduce((a, b) => a * b, 1);
  const factor = BigInt(Math.round(4294967296 / divisor)),
    half = Math.floor((divisor + 1) / 2);
  let input = source;
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ] as const) {
    const output = new Uint8Array(source.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let channel = 0; channel < 4; channel++) {
          let sum = half;
          for (let tap = 0; tap < weights.length; tap++) {
            const sx = x + dx * (tap - radius),
              sy = y + dy * (tap - radius);
            if (sx >= 0 && sx < width && sy >= 0 && sy < height)
              sum += weights[tap]! * input[(sy * width + sx) * 4 + channel]!;
          }
          output[(y * width + x) * 4 + channel] = Number(
            (BigInt(sum) * factor) >> 32n,
          );
        }
    input = output;
  }
  return input;
}

/** Regrouped box sums must equal an independent byte-level convolution. */
export async function checkWebglBoxBlurSteps() {
  const { boxBlur, boxSteps } = await import(
    "../../packages/renderer-core/src/composition/render/webgl-box-blur.ts"
  );
  const { blurKernel } = await import(
    "../../packages/renderer-core/src/composition/render/webgl-blur-kernel.ts"
  );
  for (let length = 2; length <= 600; length++) {
    let count = 1;
    for (const { multiple, extra } of boxSteps(length)) {
      if (multiple < 2 || multiple > 8 || extra < 0 || extra >= multiple)
        throw new Error(`invalid box step for ${length}`);
      count = count * multiple + extra;
    }
    if (count !== length) throw new Error(`box steps miss ${length}`);
  }
  const width = 137,
    height = 109,
    canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const device = new WebglDevice(canvas);
  const results: { sigma: number; bounded: boolean; passes: number }[] = [];
  try {
    for (const sigma of [1, 2.2, 3.2, 4.2, 5, 8, 12, 16, 21.3, 22])
      for (const bounded of [false, true])
        for (const seed of [17, 29]) {
          const kernel = blurKernel(sigma);
          const region = bounded
            ? { left: 31, top: 27, right: 83, bottom: 65 }
            : undefined;
          const bitmap = document.createElement("canvas");
          bitmap.width = width;
          bitmap.height = height;
          const ctx = bitmap.getContext("2d")!,
            image = ctx.createImageData(width, height);
          let random = seed;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              if (
                region &&
                (x < region.left ||
                  x >= region.right ||
                  y < region.top ||
                  y >= region.bottom)
              )
                continue;
              for (let channel = 0; channel < 4; channel++) {
                random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
                image.data[(y * width + x) * 4 + channel] = random >>> 24;
              }
            }
          ctx.putImageData(image, 0, 0);
          const surface = device.surface(width, height);
          try {
            device.upload(surface, bitmap);
            const initial = device.read(surface);
            const before = device.passes;
            if (!boxBlur(device, surface, kernel, region)) {
              // Short boxes and sums beyond exact Float32 integers deliberately
              // use the generic weighted kernel.
              if (
                kernel.lengths.some((length) => length < 4) ||
                kernel.divisor * 255 >= 16777216
              )
                continue;
              throw new Error(`box blur declined sigma ${sigma}`);
            }
            const expected = referenceBlur(
                initial,
                width,
                height,
                kernel.lengths,
              ),
              actual = device.read(surface);
            const differing = expected.findIndex((v, i) => v !== actual[i]);
            if (differing >= 0)
              throw new Error(
                `box blur sigma ${sigma} bounded ${bounded} differs at byte ${differing}: ${expected[differing]} != ${actual[differing]}`,
              );
            results.push({ sigma, bounded, passes: device.passes - before });
          } finally {
            device.release(surface);
            bitmap.width = bitmap.height = 0;
          }
        }
  } finally {
    device.dispose();
  }
  return results;
}

/** Bounded particle neighborhoods must equal the full-canvas primitive blend. */
export async function checkWebglBoundedParticles() {
  const { paintRisingParticles } = await import(
    "../../packages/renderer-core/src/pixel-generators.ts"
  );
  const { blendShader } = await import(
    "../../packages/renderer-core/src/composition/render/webgl-blend.ts"
  );
  const { cssColor } = await import(
    "../../packages/renderer-core/src/composition/render/canvas2d.ts"
  );
  const raster = createCanvas2dBackend({
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
  });
  let checked = 0;
  for (const [width, height] of [
    [1080, 1350],
    [301, 257],
  ] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const device = new WebglDevice(canvas);
    const screen = device.surface(width, height, false, true, true);
    const effects = new WebglEffects(device, raster, new WebglBounds(screen));
    const backdrop = device.surface(width, height);
    device.upload(backdrop, content(width, height, width ^ height));
    const reset = () =>
      device.pass(
        "void main() { pixel = texelFetch(source, ivec2(gl_FragCoord.xy), 0); }",
        screen,
        [backdrop],
      );
    try {
      for (const params of [
        { progress: 0, count: 48, radius: 3, opacity: 0.24, seed: 37 },
        { progress: 0.37, count: 48, radius: 3, opacity: 0.24, seed: 37 },
        { progress: 0.999, count: 400, radius: 9, opacity: 0.8, seed: 5 },
        { progress: 0.5, count: 64, radius: 40, opacity: 1, seed: 11 },
        { progress: 0.25, count: 0, radius: 3, opacity: 1, seed: 1 },
      ]) {
        const color: [number, number, number, number] = [0.55, 0.47, 0.36, 1];
        reset();
        const pixels = raster.createSurface(width, height);
        const source = device.surface(width, height);
        try {
          paintRisingParticles(
            pixels.ctx,
            { ...params, color: cssColor(color) },
            width,
            height,
          );
          device.upload(source, pixels.canvas);
          device.pass(blendShader("normal", true), screen, [source, screen], {
            opacity: 1,
          });
        } finally {
          raster.releaseSurface(pixels);
          device.release(source);
        }
        const expected = device.read(screen);
        reset();
        effects.apply(screen, [
          {
            id: "particles",
            effect: "particles.rise",
            enabled: true,
            params: { ...params, color },
          },
        ]);
        const actual = device.read(screen);
        const differing = expected.findIndex((v, i) => v !== actual[i]);
        if (differing >= 0)
          throw new Error(
            `particles ${width}x${height} ${JSON.stringify(params)} differ at byte ${differing}: ${expected[differing]} != ${actual[differing]}`,
          );
        checked++;
      }
    } finally {
      device.dispose();
    }
  }
  raster.dispose();
  return checked;
}

/** Uploading only the placed sweep bounds must equal a full-canvas upload. */
export function checkWebglBoundedLightSweep() {
  const raster = createCanvas2dBackend({
    images: { images: new Map(), sizes: new Map() },
    drawText: () => {},
  });
  const width = 640,
    height = 480;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const device = new WebglDevice(canvas);
  const screen = device.surface(width, height, false, true, true);
  const bounds = new WebglBounds(screen);
  const effects = new WebglEffects(device, raster, bounds);
  const original = WebglDevice.prototype.uploadArea;
  const layer = device.surface(width, height);
  const input = content(width, height, 91);
  let checked = 0;
  try {
    for (const placement of [
      { matrix: [1, 0, 0, 1, 40, 30] },
      { matrix: [0.8, 0.3, -0.25, 0.9, 120.4, 17.6] },
      {
        matrix: [1, 0, 0, 1, 0, 0],
        transforms: [
          [1, 0, 0, 1, 300.5, 200.25],
          [0.7071, 0.7071, -0.7071, 0.7071, 0, 0],
          [1, 0, 0.4, 1, -150, -90],
        ],
      },
      { matrix: [-1.3, 0, 0, 1.2, 600, 10] },
    ])
      for (const progress of [0, 0.31, 0.77, 1]) {
        const effect = {
          id: "sweep",
          effect: "light.sweep",
          enabled: true,
          placement,
          params: {
            width: 420,
            height: 360,
            left: 0.34,
            top: 0.06,
            regionWidth: 0.32,
            regionHeight: 0.24,
            band: 0.13,
            progress,
            strength: 0.3,
          },
        } as unknown as Parameters<WebglEffects["apply"]>[1][number];
        const run = () => {
          device.upload(layer, input);
          bounds.full(layer);
          effects.apply(layer, [effect]);
          return device.read(layer);
        };
        WebglDevice.prototype.uploadArea = function (surface, source) {
          this.upload(surface, source);
        };
        const expected = run();
        WebglDevice.prototype.uploadArea = original;
        const actual = run();
        const differing = expected.findIndex((v, i) => v !== actual[i]);
        if (differing >= 0)
          throw new Error(
            `light sweep ${JSON.stringify(placement)} ${progress} differs at byte ${differing}: ${expected[differing]} != ${actual[differing]}`,
          );
        checked++;
      }
  } finally {
    WebglDevice.prototype.uploadArea = original;
    device.dispose();
    raster.dispose();
  }
  return checked;
}
