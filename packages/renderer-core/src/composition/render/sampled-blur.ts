import { compositionEffectDefinition } from "@still-shift/scene-contract";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
/** Integer affine rows: source = (2*x*a + 2*y*c + translation)/512. */
type SampleTransform = [number, number, number, number, number, number];
const IDENTITY: SampleTransform = [256, 0, 0, 0, 256, 0];
const scalar = (p: Params, key: string) => p[key] as number;
export function blurSampleTransforms(
  id: string,
  p: Params,
  w: number,
  h: number,
): SampleTransform[] {
  const amount = scalar(
    p,
    id === "blur.lens" ? "radius" : id === "blur.radial" ? "angle" : "amount",
  );
  if (amount === 0) return [[...IDENTITY]];
  const count = scalar(p, "samples");
  if (id === "blur.lens")
    return Array.from({ length: count }, (_, i) => {
      const radius = amount * Math.sqrt((i + 0.5) / count),
        angle = i * Math.PI * (3 - Math.sqrt(5));
      return [
        256,
        0,
        Math.round(Math.cos(angle) * radius * 16) * 32,
        0,
        256,
        Math.round(Math.sin(angle) * radius * 16) * 32,
      ];
    });
  const center = p.center as readonly number[];
  const cx = center[0]! * w,
    cy = center[1]! * h;
  return Array.from({ length: count }, (_, i) => {
    const position = i / (count - 1) - 0.5;
    const angle =
      id === "blur.radial" ? (amount * position * Math.PI) / 180 : 0;
    const scale = id === "blur.zoom" ? 1 + amount * position : 1;
    const a = Math.round(Math.cos(angle) * scale * 256),
      b = Math.round(Math.sin(angle) * scale * 256),
      c = -b,
      d = a;
    return [
      a,
      c,
      Math.round((cx - (a * cx + c * cy) / 256) * 16) * 32,
      b,
      d,
      Math.round((cy - (b * cx + d * cy) / 256) * 16) * 32,
    ];
  });
}
/** Bilinear premultiplied byte interpolation with 1/16 weights and transparent padding. */
export function samplePremultiplied(
  pixels: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  output: number[] = [0, 0, 0, 0],
): number[] {
  const left = Math.floor(x - 0.5),
    top = Math.floor(y - 0.5),
    wx = Math.floor((x - 0.5 - left) * 16),
    wy = Math.floor((y - 0.5 - top) * 16);
  const index = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < w && ty < h ? (ty * w + tx) * 4 : -1;
  const first = index(left, top),
    second = index(left + 1, top),
    third = index(left, top + 1),
    fourth = index(left + 1, top + 1);
  const firstWeight = (16 - wx) * (16 - wy),
    secondWeight = wx * (16 - wy),
    thirdWeight = (16 - wx) * wy,
    fourthWeight = wx * wy;
  for (let channel = 0; channel < 4; channel++)
    output[channel] = Math.floor(
      ((first < 0 ? 0 : pixels[first + channel]!) * firstWeight +
        (second < 0 ? 0 : pixels[second + channel]!) * secondWeight +
        (third < 0 ? 0 : pixels[third + channel]!) * thirdWeight +
        (fourth < 0 ? 0 : pixels[fourth + channel]!) * fourthWeight) /
        256 +
        0.5,
    );
  return output;
}
export const PREMULTIPLIED_SAMPLE_SHADER = `
vec4 pixelAt(ivec2 point){ivec2 size=textureSize(source,0);if(any(lessThan(point,ivec2(0)))||any(greaterThanEqual(point,size)))return vec4(0.0);return floor(texelFetch(source,point,0)*255.0+0.5);}
vec4 sampleBytes(vec2 point){vec2 base=floor(point-0.5),weight=floor((point-0.5-base)*16.0);ivec2 origin=ivec2(base);vec4 sum=pixelAt(origin)*(16.0-weight.x)*(16.0-weight.y)+pixelAt(origin+ivec2(1,0))*weight.x*(16.0-weight.y)+pixelAt(origin+ivec2(0,1))*(16.0-weight.x)*weight.y+pixelAt(origin+ivec2(1,1))*weight.x*weight.y;return floor(sum/256.0+0.5);}`;
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function sampledBlurKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["blur.radial", "blur.zoom", "blur.lens"].includes(id)) return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!;
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const transforms = blurSampleTransforms(
        id,
        params,
        input.width,
        input.height,
      );
      const declarations = transforms
        .map((_, i) => `uniform vec3 rowX${i};uniform vec3 rowY${i};`)
        .join("\n");
      const steps = transforms
        .map(
          (_, i) =>
            `sum+=sampleBytes(vec2(dot(vec3(gl_FragCoord.xy*2.0,1.0),rowX${i}),dot(vec3(gl_FragCoord.xy*2.0,1.0),rowY${i}))/512.0);`,
        )
        .join("\n");
      const uniforms = Object.fromEntries(
        transforms.flatMap((tap, i) => [
          [`rowX${i}`, tap.slice(0, 3)],
          [`rowY${i}`, tap.slice(3, 6)],
        ]),
      );
      const output = context.createSurface(input.width, input.height);
      context.pass(
        `${declarations}\n${PREMULTIPLIED_SAMPLE_SHADER}\nvoid main(){vec4 sum=vec4(0.0);${steps}pixel=floor(sum/${transforms.length}.0+0.5)/255.0;}`,
        output,
        [input],
        uniforms,
      );
      return output;
    },
    renderCanvas(context, input, params) {
      const transforms = blurSampleTransforms(
        id,
        params,
        input.width,
        input.height,
      );
      const image = input.ctx.getImageData(0, 0, input.width, input.height),
        premultiplied = new Uint8Array(image.data.length);
      for (let index = 0; index < image.data.length; index += 4) {
        const alpha = image.data[index + 3]!;
        for (let c = 0; c < 3; c++)
          premultiplied[index + c] = Math.round(
            (image.data[index + c]! * alpha) / 255,
          );
        premultiplied[index + 3] = alpha;
      }
      const sample = [0, 0, 0, 0];
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const sums = [0, 0, 0, 0];
          for (const tap of transforms) {
            samplePremultiplied(
              premultiplied,
              input.width,
              input.height,
              ((2 * x + 1) * tap[0] + (2 * y + 1) * tap[1] + tap[2]) / 512,
              ((2 * x + 1) * tap[3] + (2 * y + 1) * tap[4] + tap[5]) / 512,
              sample,
            );
            for (let c = 0; c < 4; c++) sums[c]! += sample[c]!;
          }
          const bytes = sums.map((v) =>
              Math.floor(v / transforms.length + 0.5),
            ),
            index = (y * input.width + x) * 4;
          for (let c = 0; c < 3; c++)
            image.data[index + c] = bytes[3]
              ? Math.round((bytes[c]! * 255) / bytes[3])
              : 0;
          image.data[index + 3] = bytes[3]!;
        }
      const output = context.createSurface(input.width, input.height);
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
