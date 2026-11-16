import { readRenderImageData } from "../../managed-memory-context.ts";
import {
  COLOR_MATRIX_COEFFICIENTS,
  COLOR_MATRIX_OFFSETS,
  GRADE_EFFECT_IDS,
  compositionEffectDefinition,
  type GradeEffectId,
} from "@still-shift/scene-contract";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
import { linearToSrgb, srgbToLinear } from "./linear-color.ts";

/**
 * CGA grade effects: `color.matrix`, `color.white-balance` and
 * `color.vibrance`. Each one maps straight encoded-sRGB bytes to bytes with
 * integer arithmetic or a host-built byte table, so the Canvas reference, the
 * GPU kernel and Node-side measurement give identical bytes. Neutral controls
 * are an exact identity.
 */
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
const scalar = (p: Params, key: string) => p[key] as number;

/** Matrix and offset fixed-point scales: coefficients in 1/4096. */
export const GRADE_MATRIX_SCALE = 4096;
/** Vibrance factor fixed point (1/4096) and its bound (factor ≤ 4). */
export const GRADE_VIBRANCE_SCALE = 4096;
const VIBRANCE_FACTOR_LIMIT = 4 * GRADE_VIBRANCE_SCALE;
/** Encoded-sRGB luma weights over bytes, summing to 256 (as the map effects). */
export const GRADE_LUMA_WEIGHTS = [54, 183, 19] as const;

export type GradeControls =
  | { id: "color.matrix"; matrix: Int32Array }
  | { id: "color.white-balance"; table: Uint8Array }
  | { id: "color.vibrance"; factors: Uint16Array };

export { GRADE_EFFECT_IDS, type GradeEffectId };
export const isGradeEffect = (id: string): id is GradeEffectId =>
  (GRADE_EFFECT_IDS as readonly string[]).includes(id);

/** Rows of [r, g, b, offset] in 1/4096 code values per code value. */
export function colorMatrixControls(p: Params): Int32Array {
  const strength = scalar(p, "strength") ?? 1;
  const matrix = new Int32Array(12);
  for (let output = 0; output < 3; output++) {
    for (let input = 0; input < 3; input++) {
      const identity = output === input ? 1 : 0;
      const value = scalar(p, COLOR_MATRIX_COEFFICIENTS[output]![input]!);
      matrix[output * 4 + input] = Math.round(
        (identity + strength * (value - identity)) * GRADE_MATRIX_SCALE,
      );
    }
    matrix[output * 4 + 3] = Math.round(
      strength *
        scalar(p, COLOR_MATRIX_OFFSETS[output]!) *
        255 *
        GRADE_MATRIX_SCALE,
    );
  }
  return matrix;
}

export { linearToSrgb, srgbToLinear };

/**
 * Linear-light channel gains. Temperature ±100 is a one-stop red/blue ratio
 * (positive is amber); tint ±100 moves green by half a stop (positive is
 * magenta). Gains are normalized so a neutral keeps its BT.709 luminance.
 */
export function whiteBalanceGains(temperature: number, tint: number) {
  const stops = [temperature / 200, -tint / 200, -temperature / 200];
  const raw = stops.map((stop) => 2 ** stop);
  const luminance = raw[0]! * 0.2126 + raw[1]! * 0.7152 + raw[2]! * 0.0722;
  return raw.map((gain) => gain / luminance) as [number, number, number];
}

/** Three 256-entry byte tables (r, g, b), computed in float64 then rounded. */
export function whiteBalanceTable(p: Params): Uint8Array {
  const gains = whiteBalanceGains(scalar(p, "temperature"), scalar(p, "tint"));
  const table = new Uint8Array(768);
  for (let channel = 0; channel < 3; channel++)
    for (let value = 0; value < 256; value++) {
      const linear = Math.min(1, srgbToLinear(value / 255) * gains[channel]!);
      table[channel * 256 + value] = Math.round(linearToSrgb(linear) * 255);
    }
  return table;
}

/** Skin hue weight for hue in degrees, 0 outside 0–50°, 1 at 25°. */
export function vibranceSkinWeight(hue: number) {
  const t = Math.max(0, Math.min(1, 1 - Math.abs(hue - 25) / 25));
  return t * t * (3 - 2 * t);
}

/**
 * Saturation factors indexed by [hue row][saturation index]: saturation index
 * floor(255·chroma/max); hue row floor(254·(g−b)/chroma) when r ≥ g ≥ b (the
 * skin sector), otherwise row 255. Factor = (1 + saturation)·(1 + vibrance·
 * (1 − sat)·(1 − protectSkin·skin)), bounded to 0–4, in 1/4096.
 */
export function vibranceFactors(p: Params): Uint16Array {
  const saturation = scalar(p, "saturation") / 100,
    vibrance = scalar(p, "vibrance") / 100,
    protect = scalar(p, "protectSkin");
  const factors = new Uint16Array(65536);
  for (let row = 0; row < 256; row++) {
    const skin = row === 255 ? 0 : vibranceSkinWeight((60 * row) / 254);
    for (let index = 0; index < 256; index++) {
      const factor =
        (1 + saturation) *
        (1 + vibrance * (1 - index / 255) * (1 - protect * skin));
      factors[row * 256 + index] = Math.max(
        0,
        Math.min(
          VIBRANCE_FACTOR_LIMIT,
          Math.round(factor * GRADE_VIBRANCE_SCALE),
        ),
      );
    }
  }
  return factors;
}

export function gradeControls(id: GradeEffectId, p: Params): GradeControls {
  if (id === "color.matrix") return { id, matrix: colorMatrixControls(p) };
  if (id === "color.white-balance") return { id, table: whiteBalanceTable(p) };
  return { id, factors: vibranceFactors(p) };
}

const clampByte = (value: number) =>
  value < 0 ? 0 : value > 255 ? 255 : value;
/**
 * Straight bytes in, straight bytes out (written to `out` at `at`). This is
 * the reference that both backends and Node measurement share.
 */
export function gradeBytes(
  controls: GradeControls,
  r: number,
  g: number,
  b: number,
  out: Uint8Array | Uint8ClampedArray | number[],
  at = 0,
) {
  if (controls.id === "color.white-balance") {
    const table = controls.table;
    out[at] = table[r]!;
    out[at + 1] = table[256 + g]!;
    out[at + 2] = table[512 + b]!;
    return;
  }
  if (controls.id === "color.matrix") {
    const m = controls.matrix;
    for (let channel = 0; channel < 3; channel++) {
      const row = channel * 4;
      const sum =
        m[row]! * r + m[row + 1]! * g + m[row + 2]! * b + m[row + 3]! + 2048;
      out[at + channel] = clampByte(sum >> 12);
    }
    return;
  }
  const maximum = Math.max(r, g, b),
    chroma = maximum - Math.min(r, g, b);
  const index = maximum ? Math.floor((255 * chroma) / maximum) : 0;
  const row =
    chroma > 0 && r >= g && g >= b ? Math.floor((254 * (g - b)) / chroma) : 255;
  const factor = controls.factors[row * 256 + index]!;
  const luma =
    GRADE_LUMA_WEIGHTS[0] * r +
    GRADE_LUMA_WEIGHTS[1] * g +
    GRADE_LUMA_WEIGHTS[2] * b;
  const base = luma * GRADE_VIBRANCE_SCALE + 524288;
  out[at] = clampByte((base + (r * 256 - luma) * factor) >> 20);
  out[at + 1] = clampByte((base + (g * 256 - luma) * factor) >> 20);
  out[at + 2] = clampByte((base + (b * 256 - luma) * factor) >> 20);
}

/** Apply in place to straight RGBA8 (alpha untouched), e.g. decoded frames. */
export function applyGradeToRgba(
  controls: GradeControls,
  pixels: Uint8Array | Uint8ClampedArray,
) {
  for (let i = 0; i < pixels.length; i += 4)
    gradeBytes(controls, pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels, i);
}

/** Stored premultiplied byte to straight byte, half-up (as color effects). */
const straight = (premultiplied: number, alpha: number) =>
  Math.floor((2 * premultiplied * 255 + alpha) / (2 * alpha));

const PRELUDE = `
    vec4 sourcePixel=texelFetch(source,ivec2(gl_FragCoord.xy),0);
    vec4 stored=floor(sourcePixel*255.0+0.5);
    uint alpha=uint(stored.a);
    uvec3 premultiplied=uvec3(stored.rgb);
    ivec3 c=alpha>0u?ivec3((premultiplied*510u+uvec3(alpha))/(2u*alpha)):ivec3(0);
    ivec3 o;`;
const POSTLUDE = `
    o=clamp(o,ivec3(0),ivec3(255));
    pixel=bytes(vec4(vec3(o)/255.0*sourcePixel.a,sourcePixel.a));`;
const bodies: Readonly<Record<GradeEffectId, string>> = {
  "color.matrix": `uniform vec4 rowRed;uniform vec4 rowGreen;uniform vec4 rowBlue;
  void main(){${PRELUDE}
    ivec4 rr=ivec4(rowRed),rg=ivec4(rowGreen),rb=ivec4(rowBlue);
    o=ivec3(rr.x*c.r+rr.y*c.g+rr.z*c.b+rr.w+2048,
            rg.x*c.r+rg.y*c.g+rg.z*c.b+rg.w+2048,
            rb.x*c.r+rb.y*c.g+rb.z*c.b+rb.w+2048)>>12;${POSTLUDE}
  }`,
  "color.white-balance": `
  int entry(int channel,int value){return int(floor(texelFetch(backdrop,ivec2(value,0),0)[channel]*255.0+0.5));}
  void main(){${PRELUDE}
    o=ivec3(entry(0,c.r),entry(1,c.g),entry(2,c.b));${POSTLUDE}
  }`,
  "color.vibrance": `
  void main(){${PRELUDE}
    int maximum=max(max(c.r,c.g),c.b),chroma=maximum-min(min(c.r,c.g),c.b);
    int index=maximum>0?int(uint(255*chroma)/uint(maximum)):0;
    int row=chroma>0&&c.r>=c.g&&c.g>=c.b?int(uint(254*(c.g-c.b))/uint(chroma)):255;
    vec4 t=floor(texelFetch(backdrop,ivec2(index,row),0)*255.0+0.5);
    int factor=int(t.r)+256*int(t.g);
    int luma=54*c.r+183*c.g+19*c.b;
    o=(ivec3(luma*4096+524288)+(c*256-ivec3(luma))*factor)>>20;${POSTLUDE}
  }`,
};

/** RGBA control texture bytes: 256×1 white-balance tables or 256×256 factors. */
function controlTexture(controls: GradeControls): Uint8Array<ArrayBuffer> {
  if (controls.id === "color.white-balance") {
    const bytes = new Uint8Array(256 * 4);
    for (let value = 0; value < 256; value++) {
      bytes[value * 4] = controls.table[value]!;
      bytes[value * 4 + 1] = controls.table[256 + value]!;
      bytes[value * 4 + 2] = controls.table[512 + value]!;
      bytes[value * 4 + 3] = 255;
    }
    return bytes;
  }
  const factors = (controls as { factors: Uint16Array }).factors;
  const bytes = new Uint8Array(65536 * 4);
  for (let i = 0; i < 65536; i++) {
    bytes[i * 4] = factors[i]! & 255;
    bytes[i * 4 + 1] = factors[i]! >>> 8;
    bytes[i * 4 + 3] = 255;
  }
  return bytes;
}

const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function gradeEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!isGradeEffect(id)) return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!;
  const shader = bodies[id];
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      const controls = gradeControls(id, params);
      if (controls.id === "color.matrix") {
        const m = controls.matrix;
        context.pass(shader, output, [input], {
          rowRed: [m[0]!, m[1]!, m[2]!, m[3]!],
          rowGreen: [m[4]!, m[5]!, m[6]!, m[7]!],
          rowBlue: [m[8]!, m[9]!, m[10]!, m[11]!],
        });
        return output;
      }
      const table = context.createSurface(
        256,
        controls.id === "color.white-balance" ? 1 : 256,
      );
      context.uploadBytes(table, controlTexture(controls));
      context.pass(shader, output, [input, table], {});
      return output;
    },
    renderCanvas(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      const controls = gradeControls(id, params);
      const image = readRenderImageData(
        input.ctx,
        0,
        0,
        input.width,
        input.height,
      );
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3]!;
        if (!alpha) continue;
        // Recover the stored premultiplied bytes (platform readback rounding),
        // then the straight bytes with the GPU's half-up rule.
        const r = straight(Math.round((data[i]! * alpha) / 255), alpha),
          g = straight(Math.round((data[i + 1]! * alpha) / 255), alpha),
          b = straight(Math.round((data[i + 2]! * alpha) / 255), alpha);
        gradeBytes(controls, r, g, b, data, i);
      }
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
