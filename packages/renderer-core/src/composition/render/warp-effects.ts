import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  PREMULTIPLIED_SAMPLE_SHADER,
  samplePremultiplied,
} from "./sampled-blur.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
type Mapping = {
  uniforms: Record<string, readonly number[]>;
  shader: string;
  sourcePoint(x: number, y: number): number[] | undefined;
};
const f = Math.fround;
const point = (p: Params, key: string) => p[key] as readonly number[];
function inverse3(m: number[]): number[] {
  const [a, b, c, d, e, g, h, i, j] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const values = [
    e * j - g * i,
    c * i - b * j,
    b * g - c * e,
    g * h - d * j,
    a * j - c * h,
    c * d - a * g,
    d * i - e * h,
    b * h - a * i,
    a * e - b * d,
  ];
  const determinant = a * values[0]! + b * values[3]! + c * values[6]!;
  if (Math.abs(determinant) < 1e-12)
    throw Error("Corner pin homography is singular");
  return values.map((v) => f(v / determinant));
}
function cornerInverse(p: Params): number[] {
  const [a, b, c, d] = ["topLeft", "topRight", "bottomRight", "bottomLeft"].map(
    (key) => point(p, key),
  ) as [
    readonly number[],
    readonly number[],
    readonly number[],
    readonly number[],
  ];
  const dx1 = b[0]! - c[0]!,
    dx2 = d[0]! - c[0]!,
    sx = a[0]! - b[0]! + c[0]! - d[0]!,
    dy1 = b[1]! - c[1]!,
    dy2 = d[1]! - c[1]!,
    sy = a[1]! - b[1]! + c[1]! - d[1]!;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / determinant,
    h = (dx1 * sy - sx * dy1) / determinant;
  return inverse3([
    b[0]! - a[0]! + g * b[0]!,
    d[0]! - a[0]! + h * d[0]!,
    a[0]!,
    b[1]! - a[1]! + g * b[1]!,
    d[1]! - a[1]! + h * d[1]!,
    a[1]!,
    g,
    h,
    1,
  ]);
}
const row = (values: readonly number[], x: number, y: number) =>
  f(f(f(x * values[0]!) + f(y * values[1]!)) + values[2]!);
export function warpMapping(
  id: string,
  p: Params,
  w: number,
  h: number,
): Mapping {
  compositionEffectDefinition(id)!.validateParams?.(p);
  if (id === "distort.transform") {
    const anchor = point(p, "anchor"),
      offset = point(p, "offset"),
      scale = point(p, "scale"),
      angle = (((p.rotation as number) % 360) * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle),
      cx = anchor[0]! * w,
      cy = anchor[1]! * h;
    const a = Math.round((cos / scale[0]!) * 65536),
      c = Math.round((sin / scale[0]!) * 65536),
      b = Math.round((-sin / scale[1]!) * 65536),
      d = Math.round((cos / scale[1]!) * 65536);
    const tx = Math.round(
        (cx - ((cx + offset[0]!) * a + (cy + offset[1]!) * c) / 65536) * 131072,
      ),
      ty = Math.round(
        (cy - ((cx + offset[0]!) * b + (cy + offset[1]!) * d) / 65536) * 131072,
      );
    const split = (value: number) => [
      value - Math.floor(value / 1024) * 1024,
      Math.floor(value / 1024) - Math.floor(value / 1048576) * 1024,
      Math.floor(value / 1048576) - Math.floor(value / 1073741824) * 1024,
      Math.floor(value / 1073741824),
    ];
    return {
      uniforms: {
        rowX: [a, c],
        rowY: [b, d],
        translationX: split(tx),
        translationY: split(ty),
      },
      shader: `uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;
// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.
float affineRow(vec2 point,vec2 coefficients,vec4 translation){
 vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;
 vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;
 float low=dot(pointLow,coefficientLow)+translation.x;
 float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);
 float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);
 float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);
 // Floor to 1/16 pixel directly, avoiding a large floating numerator.
 return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);
}
vec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}`,
      sourcePoint: (x, y) => [
        (2 * x * a + 2 * y * c + tx) / 131072,
        (2 * x * b + 2 * y * d + ty) / 131072,
      ],
    };
  }
  const matrix = cornerInverse(p),
    rowX = matrix.slice(0, 3),
    rowY = matrix.slice(3, 6),
    rowW = matrix.slice(6, 9);
  return {
    uniforms: { rowX, rowY, rowW, dimensions: [w, h] },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    sourcePoint: (x, y) => {
      const px = f(x / w),
        py = f(y / h),
        weight = row(rowW, px, py);
      return Math.abs(weight) < 1e-6
        ? undefined
        : [
            f(f(row(rowX, px, py) / weight) * w),
            f(f(row(rowY, px, py) / weight) * h),
          ];
    },
  };
}
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function warpEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!["distort.transform", "distort.corner-pin"].includes(id))
    return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!;
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const mapping = warpMapping(id, params, input.width, input.height),
        output = context.createSurface(input.width, input.height);
      context.pass(
        `${mapping.shader}\n${PREMULTIPLIED_SAMPLE_SHADER}\nvoid main(){pixel=sampleBytes(sourcePoint(gl_FragCoord.xy))/255.0;}`,
        output,
        [input],
        mapping.uniforms,
      );
      return output;
    },
    renderCanvas(context, input, params) {
      const mapping = warpMapping(id, params, input.width, input.height),
        image = input.ctx.getImageData(0, 0, input.width, input.height),
        premultiplied = new Uint8Array(image.data.length);
      for (let i = 0; i < image.data.length; i += 4) {
        const alpha = image.data[i + 3]!;
        for (let c = 0; c < 3; c++)
          premultiplied[i + c] = Math.round((image.data[i + c]! * alpha) / 255);
        premultiplied[i + 3] = alpha;
      }
      const sample = [0, 0, 0, 0];
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const source = mapping.sourcePoint(x + 0.5, y + 0.5);
          if (source)
            samplePremultiplied(
              premultiplied,
              input.width,
              input.height,
              source[0]!,
              source[1]!,
              sample,
            );
          else sample.fill(0);
          const i = (y * input.width + x) * 4;
          for (let c = 0; c < 3; c++)
            image.data[i + c] = sample[3]
              ? Math.round((sample[c]! * 255) / sample[3])
              : 0;
          image.data[i + 3] = sample[3]!;
        }
      const output = context.createSurface(input.width, input.height);
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
