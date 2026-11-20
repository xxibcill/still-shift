import {
  applyCdl,
  applyGradePrimary,
  applyLinearMatrixEncoded,
  applyRgbMixer,
  gradePrimaryControls,
  HIGHLIGHT_RANGE,
  lumaCoefficients,
  perChannel,
  rgbMixer,
  SHADOW_RANGE,
  TONAL_AMOUNT,
  whiteBalanceMatrix,
  type Cdl,
  type GradePrimaryControls,
  type Mat3,
  type Rgb,
  type RgbMixer,
} from "@still-shift/color-science";
import {
  COLOR_MATRIX_COEFFICIENTS,
  COLOR_MATRIX_OFFSETS,
  compositionEffectDefinition,
  isFloatGradeEffect,
  type FloatGradeEffectId,
} from "@still-shift/scene-contract";
import { readRenderImageData } from "../../managed-memory-context.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";
import { assertEffectVersion, COPY_SHADER } from "./effect-shared.ts";
import type { RenderEffect } from "./graph.ts";

/**
 * CG2 float grade stage. A run of consecutive `grade.*` effects is evaluated
 * on straight color, unclamped, in float — one fused fragment shader (float32)
 * on WebGL, the @still-shift/color-science float64 references on Canvas — and
 * quantized once (round half up) on exit. Neutral operators are dropped, so a
 * neutral run is an exact identity on both backends. Parity rule (owner
 * decision 3): WebGL within one 8-bit code value of the float64 reference.
 */
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
const n = (p: Params, key: string) => p[key] as number;
const CHANNELS = ["R", "G", "B"] as const;
const rgb = (p: Params, name: string): Rgb =>
  perChannel((c) => n(p, `${name}${CHANNELS[c]}`));

export type FloatGradeOp =
  | { id: "grade.primary"; controls: GradePrimaryControls }
  | { id: "grade.white-balance"; matrix: Mat3 }
  | { id: "grade.cdl"; cdl: Cdl; clamp: boolean }
  | { id: "grade.rgb-mixer"; mixer: RgbMixer };

const isIdentity = (m: Mat3) => m.every((v, i) => v === (i % 4 === 0 ? 1 : 0));

/** Float64 controls for one effect, or null when its settings are neutral. */
export function floatGradeOp(
  id: FloatGradeEffectId,
  p: Params,
): FloatGradeOp | null {
  switch (id) {
    case "grade.primary": {
      const m = (name: string) => n(p, `${name}Master`);
      const channel = (name: string, combine: (v: number) => number) => {
        const values = rgb(p, name);
        return perChannel((c) => combine(values[c]));
      };
      const lift = channel("lift", (v) => v + m("lift"));
      const gamma = channel("gamma", (v) => v * m("gamma"));
      const gain = channel("gain", (v) => v * m("gain"));
      const offset = channel("offset", (v) => v + m("offset"));
      const settings = {
        lift,
        gamma,
        gain,
        offset,
        contrast: n(p, "contrast"),
        pivot: n(p, "pivot"),
        saturation: n(p, "saturation"),
        hue: n(p, "hue"),
        colorBoost: n(p, "colorBoost"),
        shadows: n(p, "shadows"),
        highlights: n(p, "highlights"),
      };
      const neutral =
        lift.every((v) => v === 0) &&
        gamma.every((v) => v === 1) &&
        gain.every((v) => v === 1) &&
        offset.every((v) => v === 0) &&
        settings.contrast === 1 &&
        settings.saturation === 1 &&
        settings.hue === 0 &&
        settings.colorBoost === 0 &&
        settings.shadows === 0 &&
        settings.highlights === 0;
      return neutral ? null : { id, controls: gradePrimaryControls(settings) };
    }
    case "grade.white-balance": {
      const matrix = whiteBalanceMatrix(n(p, "temperature"), n(p, "tint"));
      return matrix ? { id, matrix } : null;
    }
    case "grade.cdl": {
      const cdl: Cdl = {
        slope: rgb(p, "slope"),
        offset: rgb(p, "offset"),
        power: rgb(p, "power"),
        saturation: n(p, "saturation"),
      };
      const clamp = n(p, "clamp") >= 0.5;
      const neutral =
        !clamp &&
        cdl.slope.every((v) => v === 1) &&
        cdl.offset.every((v) => v === 0) &&
        cdl.power.every((v) => v === 1) &&
        cdl.saturation === 1;
      return neutral ? null : { id, cdl, clamp };
    }
    case "grade.rgb-mixer": {
      const mixer = rgbMixer(
        COLOR_MATRIX_COEFFICIENTS.flat().map((name) => n(p, name)),
        perChannel((c) => n(p, COLOR_MATRIX_OFFSETS[c]!)),
        n(p, "strength"),
      );
      return isIdentity(mixer.matrix) && mixer.offset.every((v) => v === 0)
        ? null
        : { id, mixer };
    }
  }
}

/** The float64 reference for one op (the Canvas path and tests). */
export function applyFloatGradeOp(op: FloatGradeOp, v: Rgb): Rgb {
  switch (op.id) {
    case "grade.primary":
      return applyGradePrimary(v, op.controls);
    case "grade.white-balance":
      return applyLinearMatrixEncoded(v, op.matrix);
    case "grade.cdl":
      return applyCdl(v, op.cdl, op.clamp ? "asc" : "no-clamp");
    case "grade.rgb-mixer":
      return applyRgbMixer(v, op.mixer);
  }
}

/** Straight float → straight byte, half up, clamped (the one quantization). */
export const quantizeGrade = (v: number) =>
  v >= 1 ? 255 : v > 0 ? Math.floor(v * 255 + 0.5) : 0;

/** The run on one straight color (0–1 floats in, bytes out). */
export function floatGradeBytes(ops: readonly FloatGradeOp[], v: Rgb): Rgb {
  let value = v;
  for (const op of ops) value = applyFloatGradeOp(op, value);
  return perChannel((c) => quantizeGrade(value[c]));
}

// --- GPU ----------------------------------------------------------------------

const GLSL_COMMON = `
const vec3 LUMA=vec3(${lumaCoefficients("bt709").join(",")});
float gSmooth(float e0,float e1,float x){float t=clamp((x-e0)/(e1-e0),0.0,1.0);return t*t*(3.0-2.0*t);}
float gPow(float x,float p){return (x<0.0||p==1.0)?x:pow(x,p);}
vec3 gPow3(vec3 x,vec3 p){return vec3(gPow(x.r,p.r),gPow(x.g,p.g),gPow(x.b,p.b));}
float gDec(float v){float a=abs(v);float l=a<=0.04045?a/12.92:pow((a+0.055)/1.055,2.4);return v<0.0?-l:l;}
float gEnc(float l){float a=abs(l);float v=a<=0.0031308?a*12.92:1.055*pow(a,1.0/2.4)-0.055;return l<0.0?-v:v;}
vec3 gPrimary(vec3 v,vec3 lift,vec3 gammaInv,vec3 gain,vec3 offs,vec4 tone,vec2 sh,float hueOn,mat3 hue){
  vec3 l=v+lift*(1.0-v);
  vec3 d=(gPow3(l,gammaInv)*gain+offs)*tone.x+tone.y*(1.0-tone.x);
  float y0=dot(d,LUMA);
  vec3 e=d+${TONAL_AMOUNT.toFixed(2)}*(sh.x*(1.0-gSmooth(${SHADOW_RANGE[0].toFixed(1)},${SHADOW_RANGE[1].toFixed(1)},y0))+sh.y*gSmooth(${HIGHLIGHT_RANGE[0].toFixed(1)},${HIGHLIGHT_RANGE[1].toFixed(1)},y0));
  float y1=dot(e,LUMA);
  vec3 s=y1*(1.0-tone.z)+e*tone.z;
  if(hueOn>0.5)s=hue*s;
  float mx=max(max(s.r,s.g),s.b),mn=min(min(s.r,s.g),s.b);
  float sat=mx>0.0?clamp((mx-mn)/mx,0.0,1.0):0.0;
  float f=1.0+tone.w*(1.0-sat);
  float y2=dot(s,LUMA);
  return y2*(1.0-f)+s*f;
}
vec3 gWhite(vec3 v,mat3 m){vec3 l=m*vec3(gDec(v.r),gDec(v.g),gDec(v.b));return vec3(gEnc(l.r),gEnc(l.g),gEnc(l.b));}
vec3 gCdl(vec3 v,vec3 slope,vec3 offs,vec3 power,vec2 sc){
  vec3 t=v*slope+offs;
  if(sc.y>0.5)t=clamp(t,0.0,1.0);
  vec3 p=gPow3(t,power);
  float y=dot(p,LUMA);
  vec3 o=y+sc.x*(p-y);
  return sc.y>0.5?clamp(o,0.0,1.0):o;
}`;

/** Column-major (GLSL) from row-major. */
const columns = (m: Mat3) =>
  [0, 1, 2].flatMap((c) => [m[c]!, m[3 + c]!, m[6 + c]!]);

function opGlsl(op: FloatGradeOp, i: number) {
  const u = (name: string) => `g${i}${name}`;
  switch (op.id) {
    case "grade.primary": {
      const k = op.controls;
      return {
        declare: `uniform vec3 ${u("Lift")};uniform vec3 ${u("Gamma")};uniform vec3 ${u("Gain")};uniform vec3 ${u("Offset")};uniform vec4 ${u("Tone")};uniform vec2 ${u("Tonal")};uniform float ${u("HueOn")};uniform mat3 ${u("Hue")};`,
        call: `v=gPrimary(v,${u("Lift")},${u("Gamma")},${u("Gain")},${u("Offset")},${u("Tone")},${u("Tonal")},${u("HueOn")},${u("Hue")});`,
        uniforms: {
          [u("Lift")]: [...k.lift],
          [u("Gamma")]: k.gamma.map((g) => 1 / g),
          [u("Gain")]: [...k.gain],
          [u("Offset")]: [...k.offset],
          [u("Tone")]: [k.contrast, k.pivot, k.saturation, k.colorBoost],
          [u("Tonal")]: [k.shadows, k.highlights],
          [u("HueOn")]: k.hueMatrix ? 1 : 0,
          [u("Hue")]: columns(k.hueMatrix ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]),
        },
      };
    }
    case "grade.white-balance":
      return {
        declare: `uniform mat3 ${u("White")};`,
        call: `v=gWhite(v,${u("White")});`,
        uniforms: { [u("White")]: columns(op.matrix) },
      };
    case "grade.cdl":
      return {
        declare: `uniform vec3 ${u("Slope")};uniform vec3 ${u("CdlOffset")};uniform vec3 ${u("Power")};uniform vec2 ${u("Sat")};`,
        call: `v=gCdl(v,${u("Slope")},${u("CdlOffset")},${u("Power")},${u("Sat")});`,
        uniforms: {
          [u("Slope")]: [...op.cdl.slope],
          [u("CdlOffset")]: [...op.cdl.offset],
          [u("Power")]: [...op.cdl.power],
          [u("Sat")]: [op.cdl.saturation, op.clamp ? 1 : 0],
        },
      };
    case "grade.rgb-mixer":
      return {
        declare: `uniform mat3 ${u("Mix")};uniform vec3 ${u("MixOffset")};`,
        call: `v=${u("Mix")}*v+${u("MixOffset")};`,
        uniforms: {
          [u("Mix")]: columns(op.mixer.matrix),
          [u("MixOffset")]: [...op.mixer.offset],
        },
      };
  }
}

/** One fused shader for the run (cached by the device per text). */
export function floatGradeShader(ops: readonly FloatGradeOp[]) {
  const parts = ops.map(opGlsl);
  const fragment = `${GLSL_COMMON}
${parts.map((p) => p.declare).join("\n")}
void main(){
  vec4 sourcePixel=texelFetch(source,ivec2(gl_FragCoord.xy),0);
  vec4 stored=floor(sourcePixel*255.0+0.5);
  if(stored.a<=0.0){pixel=vec4(0.0);return;}
  vec3 v=stored.rgb/stored.a;
  ${parts.map((p) => p.call).join("\n  ")}
  vec3 o=clamp(floor(v*255.0+0.5),0.0,255.0);
  pixel=bytes(vec4(o/255.0*sourcePixel.a,sourcePixel.a));
}`;
  return {
    fragment,
    uniforms: Object.assign({}, ...parts.map((p) => p.uniforms)) as Record<
      string,
      number | number[]
    >,
  };
}

// --- Plugins and runs -----------------------------------------------------------

/** Stored premultiplied byte from a Canvas readback (as the CGA effects). */
const stored = (value: number, alpha: number) =>
  Math.round((value * alpha) / 255);

function runPlugin(
  id: string,
  opsFor: (params: Params) => FloatGradeOp[],
): CompositionEffectPlugin {
  return {
    id,
    definition: compositionEffectDefinition(id)!,
    renderGpu(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      const ops = opsFor(params);
      if (!ops.length) {
        context.pass(COPY_SHADER, output, [input]);
        return output;
      }
      const { fragment, uniforms } = floatGradeShader(ops);
      context.pass(fragment, output, [input], uniforms);
      return output;
    },
    renderCanvas(context, input, params) {
      const output = context.createSurface(input.width, input.height);
      const ops = opsFor(params);
      if (!ops.length) {
        output.ctx.drawImage(input.canvas, 0, 0);
        return output;
      }
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
        const out = floatGradeBytes(ops, [
          stored(data[i]!, alpha) / alpha,
          stored(data[i + 1]!, alpha) / alpha,
          stored(data[i + 2]!, alpha) / alpha,
        ]);
        data[i] = out[0];
        data[i + 1] = out[1];
        data[i + 2] = out[2];
      }
      output.ctx.putImageData(image, 0, 0);
      return output;
    },
  };
}

const opsOf = (effects: readonly { effect: string; params: Params }[]) =>
  effects.flatMap((e) => {
    const op = floatGradeOp(e.effect as FloatGradeEffectId, e.params);
    return op ? [op] : [];
  });

const single = new Map<string, Readonly<CompositionEffectPlugin>>();
/** One `grade.*` effect alone: a run of length one. */
export function floatGradeKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!isFloatGradeEffect(id)) return undefined;
  let kernel = single.get(id);
  if (!kernel)
    single.set(
      id,
      (kernel = Object.freeze(
        runPlugin(id, (params) => opsOf([{ effect: id, params }])),
      )),
    );
  return kernel;
}

/**
 * The run starting at `start` (consecutive `grade.*` effects without a
 * window; disabled effects inside it are skipped), as one plugin, or
 * undefined when `start` does not begin a run of two or more.
 */
export function floatGradeRun(
  stack: readonly RenderEffect[],
  start: number,
): { plugin: Readonly<CompositionEffectPlugin>; end: number } | undefined {
  const first = stack[start];
  if (!first?.enabled || !isFloatGradeEffect(first.effect) || first.window)
    return undefined;
  const members: RenderEffect[] = [];
  let end = start;
  for (let i = start; i < stack.length; i++) {
    const effect = stack[i]!;
    if (!effect.enabled) {
      end = i;
      continue;
    }
    if (!isFloatGradeEffect(effect.effect) || effect.window) break;
    assertEffectVersion(
      effect,
      compositionEffectDefinition(effect.effect)!.version,
    );
    members.push(effect);
    end = i;
  }
  if (members.length < 2) return undefined;
  return {
    plugin: Object.freeze(runPlugin(first.effect, () => opsOf(members))),
    end,
  };
}

/**
 * The enabled effects of a stack in order, with each run of two or more
 * `grade.*` effects collapsed to its first effect and the fused plugin that
 * stands in for the whole run (both backends walk stacks with this).
 */
export function* effectStages(stack: readonly RenderEffect[]): Generator<{
  effect: RenderEffect;
  run: Readonly<CompositionEffectPlugin> | undefined;
}> {
  for (let index = 0; index < stack.length; index++) {
    const effect = stack[index]!;
    if (!effect.enabled) continue;
    const run = floatGradeRun(stack, index);
    if (run) index = run.end;
    yield { effect, run: run?.plugin };
  }
}
