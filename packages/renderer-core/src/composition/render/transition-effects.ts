import { compositionEffectDefinition } from "@still-shift/scene-contract";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
const scalar = (p: Params, key: string) => p[key] as number;
const unit = (v: number) => Math.max(0, Math.min(1, v));
const mod = (v: number, d: number) => ((v % d) + d) % d;
/** Unsigned integer avalanche, mirrored directly in the GPU shader. */
export function transitionBlockRank(
  x: number,
  y: number,
  seed: number,
): number {
  let hash = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ seed) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return (hash & 65535) / 65536;
}
function direction(angle: number): number[] {
  const a = (mod(angle, 360) * Math.PI) / 180;
  return [Math.round(Math.cos(a) * 256), Math.round(Math.sin(a) * 256)];
}
function coverage(rank: number, p: Params): number {
  const progress = scalar(p, "progress");
  if (progress === 0) return 1;
  if (progress === 1) return 0;
  const softness = scalar(p, "softness");
  return (
    Math.round(
      (softness === 0
        ? rank >= progress
          ? 1
          : 0
        : unit((rank - progress) / softness + 0.5)) * 255,
    ) / 255
  );
}
/** Pure surface-pixel reference, with quantized directions and radial tie convention. */
export function transitionCoverage(
  id: string,
  p: Params,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  let rank: number;
  if (id === "transition.block-dissolve")
    rank = transitionBlockRank(
      Math.floor(x / scalar(p, "width")),
      Math.floor(y / scalar(p, "height")),
      scalar(p, "seed"),
    );
  else if (id === "transition.radial-wipe") {
    const c = p.center as readonly number[];
    const turns = mod(
      Math.atan2(y - c[1]! * h, x - c[0]! * w) / (2 * Math.PI) -
        mod(scalar(p, "angle"), 360) / 360,
      1,
    );
    rank = Math.min(65535, Math.floor((turns + 1e-6) * 65536)) / 65536;
  } else {
    const [nx, ny] = direction(scalar(p, "angle"));
    if (id === "transition.venetian-blinds")
      rank =
        mod((x * nx! + y * ny!) / 256, scalar(p, "width")) / scalar(p, "width");
    else {
      const extent = Math.abs(nx!) * w + Math.abs(ny!) * h;
      rank = ((2 * x - w) * nx! + (2 * y - h) * ny! + extent) / (2 * extent);
    }
  }
  return coverage(rank, p);
}
const HASH = `uint blockHash(uvec2 point,uint seedValue){uint value=point.x*0x9e3779b1u^point.y*0x85ebca77u^seedValue;value=(value^(value>>16u))*0x7feb352du;value=(value^(value>>15u))*0x846ca68bu;return value^(value>>16u);}`;
const ranks: Readonly<Record<string, string>> = {
  "transition.linear-wipe":
    "float extent=abs(direction.x)*dimensions.x+abs(direction.y)*dimensions.y;rank=(dot(gl_FragCoord.xy*2.0-dimensions,direction)+extent)/(2.0*extent);",
  "transition.venetian-blinds":
    "rank=mod(dot(gl_FragCoord.xy,direction)/256.0,width)/width;",
  "transition.radial-wipe":
    "vec2 relative=gl_FragCoord.xy-center*dimensions;float turns=mod((all(equal(relative,vec2(0.0)))?0.0:atan(relative.y,relative.x))/6.283185307179586-angle/360.0,1.0);rank=min(65535.0,floor((turns+0.000001)*65536.0))/65536.0;",
  "transition.block-dissolve":
    "uvec2 point=uvec2(floor(gl_FragCoord.xy/vec2(width,height)));uint seedValue=uint(seedParts.x)|(uint(seedParts.y)<<16u);rank=float(blockHash(point,seedValue)&65535u)/65536.0;",
};
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function transitionEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!Object.hasOwn(ranks, id)) return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!;
  const declarations = Object.entries(definition.properties)
    .filter(([name]) => name !== "seed")
    .map(
      ([name, p]) => `uniform ${p.type === "vec2" ? "vec2" : "float"} ${name};`,
    )
    .join("\n");
  const shader = `${declarations}\nuniform vec2 dimensions;uniform vec2 direction;uniform vec2 seedParts;\n${HASH}\nvoid main(){float rank;${ranks[id]}float coverage=progress==0.0?1.0:progress==1.0?0.0:softness==0.0?step(progress,rank):clamp((rank-progress)/softness+0.5,0.0,1.0);coverage=floor(coverage*255.0+0.5)/255.0;pixel=bytes(texelFetch(source,ivec2(gl_FragCoord.xy),0)*coverage);}`;
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      const seed = scalar(params, "seed") || 0;
      const uniforms = Object.fromEntries(
        Object.entries(params).filter(([name]) => name !== "seed"),
      ) as Record<string, number | readonly number[]>;
      if (Object.hasOwn(uniforms, "angle"))
        uniforms.angle = mod(scalar(params, "angle"), 360);
      context.pass(shader, output, [input], {
        ...uniforms,
        dimensions: [input.width, input.height],
        direction: direction(scalar(params, "angle") || 0),
        seedParts: [seed & 65535, seed >>> 16],
      });
      return output;
    },
    renderCanvas(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      const image = input.ctx.getImageData(0, 0, input.width, input.height);
      for (let y = 0; y < input.height; y++)
        for (let x = 0; x < input.width; x++) {
          const index = (y * input.width + x) * 4;
          const amount = transitionCoverage(
            id,
            params,
            x + 0.5,
            y + 0.5,
            input.width,
            input.height,
          );
          image.data[index + 3] = Math.round(image.data[index + 3]! * amount);
          if (!image.data[index + 3])
            image.data[index] =
              image.data[index + 1] =
              image.data[index + 2] =
                0;
        }
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
