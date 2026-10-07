import {
  allocateRenderPixels,
  releaseRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
export type GradientControls = {
  a: number;
  b: number;
  translation: number;
  mode: number;
  divisorBits: number;
};
/** Mixed-radix projected ranks; very thin ramps become an oriented midpoint step. */
export function gradientControls(p: Params): GradientControls {
  const start = p.start as readonly number[],
    end = p.end as readonly number[],
    dx = end[0]! - start[0]!,
    dy = end[1]! - start[1]!,
    length = Math.hypot(dx, dy);
  if (length === 0)
    return { a: 0, b: 0, translation: 0, mode: 0, divisorBits: 0 };
  const thin = length < 1 / 256,
    ax = dx / (thin ? length : length * length),
    by = dy / (thin ? length : length * length),
    bits = thin
      ? 16
      : Math.floor(Math.log2(8388608 / Math.max(Math.abs(ax), Math.abs(by)))),
    a = Math.round(ax * 2 ** bits),
    b = Math.round(by * 2 ** bits),
    cx = thin ? (start[0]! + end[0]!) / 2 : start[0]!,
    cy = thin ? (start[1]! + end[1]!) / 2 : start[1]!;
  return {
    a,
    b,
    translation: Math.round(-2 * (cx * a + cy * b)),
    mode: thin ? 2 : 1,
    divisorBits: bits - 15,
  };
}
export function gradientRank(
  c: GradientControls,
  x: number,
  y: number,
): number {
  if (c.mode === 0) return 0;
  const value = 2 * x * c.a + 2 * y * c.b + c.translation;
  if (c.mode === 2) return value === 0 ? 32768 : value > 0 ? 65535 : 0;
  return Math.max(0, Math.min(65535, Math.floor(value / 2 ** c.divisorBits)));
}
export function gradientUniforms(
  c: GradientControls,
): Record<string, number | readonly number[]> {
  const t = c.translation;
  return {
    gradientRow: [c.a, c.b],
    gradientTranslation: [
      t - Math.floor(t / 1024) * 1024,
      Math.floor(t / 1024) - Math.floor(t / 1048576) * 1024,
      Math.floor(t / 1048576) - Math.floor(t / 1073741824) * 1024,
      Math.floor(t / 1073741824),
    ],
    gradientMode: c.mode,
    gradientDivisors: [
      2 ** (30 - c.divisorBits),
      2 ** (20 - c.divisorBits),
      2 ** (10 - c.divisorBits),
      2 ** -c.divisorBits,
    ],
  };
}
export const GRADIENT_RANK_SHADER = `uniform vec2 gradientRow;uniform vec4 gradientTranslation;uniform float gradientMode;uniform vec4 gradientDivisors;
int gradientRank(vec2 point){if(gradientMode==0.0)return 0;point*=2.0;vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;vec2 highCoefficients=floor(gradientRow/1048576.0),middleCoefficients=floor(gradientRow/1024.0)-highCoefficients*1024.0,lowCoefficients=gradientRow-floor(gradientRow/1024.0)*1024.0;
float low=dot(pointLow,lowCoefficients)+gradientTranslation.x;float middle=dot(pointHigh,lowCoefficients)+dot(pointLow,middleCoefficients)+gradientTranslation.y+floor(low/1024.0);float high=dot(pointHigh,middleCoefficients)+dot(pointLow,highCoefficients)+gradientTranslation.z+floor(middle/1024.0);float highest=dot(pointHigh,highCoefficients)+gradientTranslation.w+floor(high/1024.0);float remainderHigh=high-floor(high/1024.0)*1024.0,remainderMiddle=middle-floor(middle/1024.0)*1024.0,remainderLow=low-floor(low/1024.0)*1024.0;
if(highest<0.0)return 0;if(gradientMode==2.0)return highest==0.0&&remainderHigh==0.0&&remainderMiddle==0.0&&remainderLow==0.0?32768:65535;float rank=highest*gradientDivisors.x+floor(remainderHigh*gradientDivisors.y)+floor(remainderMiddle*gradientDivisors.z)+floor(remainderLow*gradientDivisors.w);return int(min(65535.0,rank));}`;
const tables = new Map<string, Uint8Array<ArrayBuffer>>();
const scopedTables = new WeakMap<
  object,
  Map<string, Uint8Array<ArrayBuffer>>
>();
export function gradientColorTable(p: Params): Uint8Array<ArrayBuffer> {
  const memory = renderMemory();
  let cache = tables;
  if (memory) {
    cache = scopedTables.get(memory) ?? new Map();
    scopedTables.set(memory, cache);
  }
  const start = p.startColor as readonly number[],
    end = p.endColor as readonly number[],
    key = JSON.stringify([start, end]);
  const found = cache.get(key);
  if (found) return found;
  const bytes = allocateRenderPixels(
    65536 * 4,
    () => new Uint8Array(65536 * 4),
    true,
  );
  for (let i = 0; i < 65536; i++)
    for (let c = 0; c < 4; c++)
      bytes[i * 4 + c] = Math.round(
        (start[c]! + ((end[c]! - start[c]!) * i) / 65535) * 255,
      );
  if (cache.size >= 8) {
    const oldest = cache.keys().next().value!;
    releaseRenderPixels(cache.get(oldest));
    cache.delete(oldest);
  }
  cache.set(key, bytes);
  return bytes;
}
