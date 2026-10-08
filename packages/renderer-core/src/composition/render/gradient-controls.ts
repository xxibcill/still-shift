import {
  allocateRenderPixels,
  releaseRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
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
type GradientControlWork = {
  start?: readonly number[] | undefined;
  end?: readonly number[] | undefined;
  controls?: GradientControls | undefined;
};
type GradientControlsPhase = GradientControlWork & {
  managed: boolean;
  producer?: (() => GradientControls) | undefined;
};
function clearGradientControls(value: GradientControls) {
  for (const key in value)
    delete (value as Partial<GradientControls>)[key as keyof GradientControls];
}
function clearGradientControlsPhase(phase: GradientControlsPhase) {
  if (phase.controls) clearGradientControls(phase.controls);
  for (const key in phase)
    delete (phase as Partial<GradientControlsPhase>)[
      key as keyof GradientControlsPhase
    ];
}
/** Mixed-radix projected ranks; very thin ramps become an oriented midpoint step. */
export function gradientControls(
  p: Params,
  work?: GradientControlWork,
): GradientControls {
  if (work || !renderMemory()) return produceGradientControls(p, work);
  const phase = allocateRenderMetadata<GradientControlsPhase>(
    1024,
    () => ({ managed: true }),
    false,
    clearGradientControlsPhase,
  );
  let result: GradientControls | undefined,
    failed = false,
    failure: unknown;
  try {
    result = allocateRenderMetadata<GradientControls>(
      512,
      (phase.producer = () => produceGradientControls(p, phase)),
      false,
      clearGradientControls,
    );
    phase.controls = undefined;
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    try {
      releaseRenderMetadata(phase);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) {
    try {
      if (result) releaseRenderMetadata(result);
    } catch {
      /* Preserve the first producer/admission/cleanup error. */
    }
    throw failure;
  }
  return result!;
}
function produceGradientControls(
  p: Params,
  work?: GradientControlWork,
): GradientControls {
  const start = p.start as readonly number[];
  if (work) work.start = start;
  const end = p.end as readonly number[];
  if (work) work.end = end;
  const dx = end[0]! - start[0]!,
    dy = end[1]! - start[1]!,
    length = Math.hypot(dx, dy);
  if (length === 0) {
    const result = { a: 0, b: 0, translation: 0, mode: 0, divisorBits: 0 };
    if (work) work.controls = result;
    return result;
  }
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
  const result = {} as GradientControls;
  if (work) work.controls = result;
  result.a = a;
  result.b = b;
  result.translation = Math.round(-2 * (cx * a + cy * b));
  result.mode = thin ? 2 : 1;
  result.divisorBits = bits - 15;
  return result;
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
type GradientUniformWork = {
  uniforms?: Record<string, number | readonly number[]> | undefined;
  row?: number[] | undefined;
  translation?: number[] | undefined;
  divisors?: number[] | undefined;
};
type GradientUniformPhase = GradientUniformWork & {
  managed: boolean;
  producer?: (() => Record<string, number | readonly number[]>) | undefined;
};
function clearGradientUniformWork(work: GradientUniformWork) {
  if (work.row) work.row.length = 0;
  if (work.translation) work.translation.length = 0;
  if (work.divisors) work.divisors.length = 0;
  if (work.uniforms) for (const key in work.uniforms) delete work.uniforms[key];
}
function clearGradientUniformPhase(phase: GradientUniformPhase) {
  clearGradientUniformWork(phase);
  for (const key in phase)
    delete (phase as Partial<GradientUniformPhase>)[
      key as keyof GradientUniformPhase
    ];
}
function clearGradientUniformResult(
  value: Record<string, number | readonly number[]>,
) {
  if (Array.isArray(value.gradientRow)) value.gradientRow.length = 0;
  if (Array.isArray(value.gradientTranslation))
    value.gradientTranslation.length = 0;
  if (Array.isArray(value.gradientDivisors)) value.gradientDivisors.length = 0;
  for (const key in value) delete value[key];
}
export function gradientUniforms(
  c: GradientControls,
  work?: GradientUniformWork,
): Record<string, number | readonly number[]> {
  if (work || !renderMemory()) return produceGradientUniforms(c, work);
  const phase = allocateRenderMetadata<GradientUniformPhase>(
    1024,
    () => ({ managed: true }),
    false,
    clearGradientUniformPhase,
  );
  let result: Record<string, number | readonly number[]> | undefined,
    failed = false,
    failure: unknown;
  try {
    result = allocateRenderMetadata<Record<string, number | readonly number[]>>(
      2048,
      (phase.producer = () => produceGradientUniforms(c, phase)),
      false,
      clearGradientUniformResult,
    );
    phase.uniforms = phase.row = phase.translation = phase.divisors = undefined;
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    try {
      releaseRenderMetadata(phase);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) {
    try {
      if (result) releaseRenderMetadata(result);
    } catch {
      /* Preserve the first producer/admission/cleanup error. */
    }
    throw failure;
  }
  return result!;
}
function produceGradientUniforms(
  c: GradientControls,
  work?: GradientUniformWork,
): Record<string, number | readonly number[]> {
  const t = c.translation;
  const result = {} as Record<string, number | readonly number[]>;
  if (work) work.uniforms = result;
  const row: number[] = [];
  if (work) work.row = row;
  row[0] = c.a;
  row[1] = c.b;
  result.gradientRow = row;
  const translation: number[] = [];
  if (work) work.translation = translation;
  translation[0] = t - Math.floor(t / 1024) * 1024;
  translation[1] = Math.floor(t / 1024) - Math.floor(t / 1048576) * 1024;
  translation[2] = Math.floor(t / 1048576) - Math.floor(t / 1073741824) * 1024;
  translation[3] = Math.floor(t / 1073741824);
  result.gradientTranslation = translation;
  result.gradientMode = c.mode;
  const divisors: number[] = [];
  if (work) work.divisors = divisors;
  divisors[0] = 2 ** (30 - c.divisorBits);
  divisors[1] = 2 ** (20 - c.divisorBits);
  divisors[2] = 2 ** (10 - c.divisorBits);
  divisors[3] = 2 ** -c.divisorBits;
  result.gradientDivisors = divisors;
  return result;
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
