import {
  BT709_CB_SCALE,
  BT709_CR_SCALE,
  applyCdl,
  applyGradeCurves,
  applyGradeHueCurves,
  applyGradeTonal,
  CURVE_TABLE_SIZE,
  gradeCurvesControls,
  gradeHueCurvesControls,
  HUE_CURVE_CHROMA_FADE,
  HUE_CURVE_KEYS,
  HUE_CURVE_LUMA_AMOUNT,
  HUE_CURVE_SATURATION_SCALE,
  NEUTRAL_GRADE_TONAL,
  type CurvePoints,
  type GradeTonal,
  applyGradePrimary,
  applyLinearMatrixEncoded,
  applyRgbMixer,
  gradePrimaryControls,
  GRADE_LIMIT,
  HIGHLIGHT_RANGE,
  LOG2_GRADE_LIMIT,
  IDENTITY,
  limitGrade,
  lumaCoefficients,
  NEUTRAL_CDL,
  NEUTRAL_GRADE_PRIMARY,
  perChannel,
  rgbMixer,
  sampleLut,
  SHADOW_RANGE,
  TONAL_AMOUNT,
  whiteBalanceMatrix,
  type Cdl,
  type GradePrimary,
  type Mat3,
  type Rgb,
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
import {
  EFFECT_LUTS,
  LUT_TEXTURE_WIDTH,
  lutTextureBytes,
  type PreparedLut,
} from "./luts.ts";

/**
 * CG2 float grade stage. A run of consecutive `grade.*` effects is evaluated
 * on straight color, unclamped within ±GRADE_LIMIT (every operator saturates
 * there, so nothing overflows to Infinity or NaN on either backend), in
 * float — one fused fragment shader (float32)
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

type Uniforms = Record<string, number | number[]>;
type OpGlsl = { declare: string; call: string; uniforms: Uniforms };

/** One operator of a run: its float64 reference and its fused-shader GLSL. */
export type FloatGradeOp = {
  readonly id: FloatGradeEffectId;
  /** The float64 reference (the Canvas path and tests). */
  apply(v: Rgb): Rgb;
  /**
   * CG4: baked curve tables (CURVE_TABLE_SIZE float32 entries each) the
   * kernel samples; the run uploads them as rows of one texture.
   */
  readonly tables?: readonly Float32Array[];
  /**
   * CG5: LUT floats (PreparedLut.floats) the kernel reads; the run packs
   * every op's into one texture.
   */
  readonly lutFloats?: Float32Array;
  /**
   * Uniform declarations, the call and uniform values; `uniform` names them,
   * `rows[i]` is the texture row of `tables[i]` and `lutBase` the float offset
   * of `lutFloats` in the run's LUT texture.
   */
  glsl(
    uniform: (name: string) => string,
    rows: readonly number[],
    lutBase: number,
  ): OpGlsl;
};

/** The effect a run member came from (its prepared LUTs ride under a symbol). */
type OpSource = { [EFFECT_LUTS]?: Readonly<Record<string, PreparedLut>> };

/**
 * The baked tables of the curves that are present (null: identity or flat),
 * and, given the run's texture rows for those tables, every curve's row (−1
 * when absent) in the order the kernel reads them.
 */
function curveTables(present: readonly (Float32Array | null)[]) {
  return {
    tables: present.filter((t): t is Float32Array => t !== null),
    rowsOf(rows: readonly number[]) {
      let next = 0;
      return present.map((t) => (t ? rows[next++]! : -1));
    },
  };
}

/** Every control of `value` equals `neutral`'s, except those in `ignore`. */
function isNeutral<T extends object>(
  value: T,
  neutral: T,
  ignore: readonly (keyof T)[] = [],
) {
  return (Object.keys(neutral) as (keyof T)[]).every((key) => {
    if (ignore.includes(key)) return true;
    const a = value[key] as number | Rgb,
      b = neutral[key] as number | Rgb;
    return typeof a === "number"
      ? a === b
      : a.every((v, c) => v === (b as Rgb)[c]);
  });
}

const isIdentity = (m: Mat3) => m.every((v, i) => v === (i % 4 === 0 ? 1 : 0));

/** Column-major (GLSL) from row-major. */
const columns = (m: Mat3) =>
  [0, 1, 2].flatMap((c) => [m[c]!, m[3 + c]!, m[6 + c]!]);

/**
 * Each operator in one place: its sampled parameters → an op (float64
 * reference and GLSL), or null when the settings are neutral.
 */
const OPERATORS: Readonly<
  Record<
    FloatGradeEffectId,
    (p: Params, source?: OpSource) => FloatGradeOp | null
  >
> = {
  "grade.primary": (p) => {
    const master = (name: string) => n(p, `${name}Master`);
    const channel = (name: string, combine: (v: number) => number) => {
      const values = rgb(p, name);
      return perChannel((c) => combine(values[c]));
    };
    const lift = channel("lift", (v) => v + master("lift"));
    const gamma = channel("gamma", (v) => v * master("gamma"));
    const gain = channel("gain", (v) => v * master("gain"));
    const offset = channel("offset", (v) => v + master("offset"));
    const settings: GradePrimary = {
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
    // The pivot only matters when the contrast is not neutral.
    if (isNeutral(settings, NEUTRAL_GRADE_PRIMARY, ["pivot"])) return null;
    const controls = gradePrimaryControls(settings);
    return {
      id: "grade.primary",
      apply: (v) => applyGradePrimary(v, controls),
      glsl: (u) => ({
        declare: `uniform vec3 ${u("Lift")};uniform vec3 ${u("Gamma")};uniform vec3 ${u("Gain")};uniform vec3 ${u("Offset")};uniform vec4 ${u("Tone")};uniform vec2 ${u("Tonal")};uniform float ${u("HueOn")};uniform mat3 ${u("Hue")};`,
        call: `v=gPrimary(v,${u("Lift")},${u("Gamma")},${u("Gain")},${u("Offset")},${u("Tone")},${u("Tonal")},${u("HueOn")},${u("Hue")});`,
        uniforms: {
          [u("Lift")]: [...controls.lift],
          [u("Gamma")]: controls.gamma.map((g) => 1 / g),
          [u("Gain")]: [...controls.gain],
          [u("Offset")]: [...controls.offset],
          [u("Tone")]: [
            controls.contrast,
            controls.pivot,
            controls.saturation,
            controls.colorBoost,
          ],
          [u("Tonal")]: [controls.shadows, controls.highlights],
          [u("HueOn")]: controls.hueMatrix ? 1 : 0,
          [u("Hue")]: columns(controls.hueMatrix ?? IDENTITY),
        },
      }),
    };
  },
  "grade.white-balance": (p) => {
    const matrix = whiteBalanceMatrix(n(p, "temperature"), n(p, "tint"));
    if (!matrix) return null;
    return {
      id: "grade.white-balance",
      apply: (v) => applyLinearMatrixEncoded(v, matrix),
      glsl: (u) => ({
        declare: `uniform mat3 ${u("White")};`,
        call: `v=gWhite(v,${u("White")});`,
        uniforms: { [u("White")]: columns(matrix) },
      }),
    };
  },
  "grade.cdl": (p) => {
    const cdl: Cdl = {
      slope: rgb(p, "slope"),
      offset: rgb(p, "offset"),
      power: rgb(p, "power"),
      saturation: n(p, "saturation"),
    };
    const clamp = n(p, "clamp") >= 0.5;
    // The Release 1.2 clamp is never neutral: it clips values outside 0–1.
    if (!clamp && isNeutral(cdl, NEUTRAL_CDL)) return null;
    return {
      id: "grade.cdl",
      apply: (v) => applyCdl(v, cdl, clamp ? "asc" : "no-clamp"),
      glsl: (u) => ({
        declare: `uniform vec3 ${u("Slope")};uniform vec3 ${u("CdlOffset")};uniform vec3 ${u("Power")};uniform vec2 ${u("Sat")};`,
        call: `v=gCdl(v,${u("Slope")},${u("CdlOffset")},${u("Power")},${u("Sat")});`,
        uniforms: {
          [u("Slope")]: [...cdl.slope],
          [u("CdlOffset")]: [...cdl.offset],
          [u("Power")]: [...cdl.power],
          [u("Sat")]: [cdl.saturation, clamp ? 1 : 0],
        },
      }),
    };
  },
  "grade.rgb-mixer": (p) => {
    const mixer = rgbMixer(
      COLOR_MATRIX_COEFFICIENTS.flat().map((name) => n(p, name)),
      perChannel((c) => n(p, COLOR_MATRIX_OFFSETS[c]!)),
      n(p, "strength"),
    );
    if (isIdentity(mixer.matrix) && mixer.offset.every((v) => v === 0))
      return null;
    return {
      id: "grade.rgb-mixer",
      apply: (v) => applyRgbMixer(v, mixer),
      glsl: (u) => ({
        declare: `uniform mat3 ${u("Mix")};uniform vec3 ${u("MixOffset")};`,
        call: `v=gLimit3(${u("Mix")}*v+${u("MixOffset")});`,
        uniforms: {
          [u("Mix")]: columns(mixer.matrix),
          [u("MixOffset")]: [...mixer.offset],
        },
      }),
    };
  },
  "grade.curves": (p) => {
    const points = (name: string) => p[name] as unknown as CurvePoints;
    const controls = gradeCurvesControls({
      master: points("master"),
      red: points("red"),
      green: points("green"),
      blue: points("blue"),
      lumaMix: n(p, "lumaMix"),
    });
    if (!controls) return null;
    const { tables, rowsOf } = curveTables([
      controls.red,
      controls.green,
      controls.blue,
      controls.master,
    ]);
    return {
      id: "grade.curves",
      apply: (v) => applyGradeCurves(v, controls),
      tables,
      glsl: (u, rows) => {
        const row = rowsOf(rows);
        return {
          declare: `uniform vec4 ${u("Rows")};uniform float ${u("LumaMix")};`,
          call: `v=gCurves(v,${u("Rows")},${u("LumaMix")});`,
          uniforms: { [u("Rows")]: row, [u("LumaMix")]: controls.lumaMix },
        };
      },
    };
  },
  "grade.hue-curves": (p) => {
    const controls = gradeHueCurvesControls(
      Object.fromEntries(
        HUE_CURVE_KEYS.map((key) => [key, p[key] as unknown as CurvePoints]),
      ) as Parameters<typeof gradeHueCurvesControls>[0],
    );
    if (!controls) return null;
    const { tables, rowsOf } = curveTables(
      HUE_CURVE_KEYS.map((key) => controls[key]),
    );
    return {
      id: "grade.hue-curves",
      apply: (v) => applyGradeHueCurves(v, controls),
      tables,
      glsl: (u, rows) => {
        const row = rowsOf(rows);
        return {
          declare: `uniform vec3 ${u("HueRows")};uniform vec3 ${u("SatRows")};`,
          call: `v=gHueCurves(v,${u("HueRows")},${u("SatRows")});`,
          uniforms: {
            [u("HueRows")]: row.slice(0, 3),
            [u("SatRows")]: row.slice(3, 6),
          },
        };
      },
    };
  },
  "grade.tonal": (p) => {
    const settings: GradeTonal = {
      shadowOffset: rgb(p, "shadow"),
      midOffset: rgb(p, "mid"),
      highlightOffset: rgb(p, "highlight"),
      shadowExposure: n(p, "shadowExposure"),
      midExposure: n(p, "midExposure"),
      highlightExposure: n(p, "highlightExposure"),
      shadowEnd: n(p, "shadowEnd"),
      highlightStart: n(p, "highlightStart"),
      falloff: n(p, "falloff"),
      softClipHigh: n(p, "softClipHigh"),
      softClipLow: n(p, "softClipLow"),
    };
    // The range boundaries only matter when a range changes something.
    if (
      isNeutral(settings, NEUTRAL_GRADE_TONAL, [
        "shadowEnd",
        "highlightStart",
        "falloff",
      ])
    )
      return null;
    return {
      id: "grade.tonal",
      apply: (v) => applyGradeTonal(v, settings),
      glsl: (u) => ({
        declare: `uniform vec3 ${u("ShadowOffset")};uniform vec3 ${u("MidOffset")};uniform vec3 ${u("HighOffset")};uniform vec3 ${u("Exposure")};uniform vec3 ${u("Ranges")};uniform vec2 ${u("Clip")};`,
        call: `v=gTonal(v,${u("ShadowOffset")},${u("MidOffset")},${u("HighOffset")},${u("Exposure")},${u("Ranges")},${u("Clip")});`,
        uniforms: {
          [u("ShadowOffset")]: [...settings.shadowOffset],
          [u("MidOffset")]: [...settings.midOffset],
          [u("HighOffset")]: [...settings.highlightOffset],
          [u("Exposure")]: [
            settings.shadowExposure,
            settings.midExposure,
            settings.highlightExposure,
          ],
          [u("Ranges")]: [
            settings.shadowEnd,
            settings.highlightStart,
            settings.falloff,
          ],
          [u("Clip")]: [settings.softClipHigh, settings.softClipLow],
        },
      }),
    };
  },
  "grade.lut": (p, source) => {
    const intensity = n(p, "intensity");
    if (intensity === 0) return null;
    const prepared = source?.[EFFECT_LUTS]?.lut;
    if (!prepared)
      throw Error(
        "comp-lut-not-ready: grade.lut needs its LUT asset loaded with the composition resources",
      );
    const { lut } = prepared;
    const trilinear = n(p, "interpolation") >= 0.5;
    const interpolation = trilinear ? "trilinear" : "tetrahedral";
    return {
      id: "grade.lut",
      apply: (v) => {
        const o = sampleLut(lut, v, interpolation);
        return perChannel((c) => limitGrade(v[c] + intensity * (o[c] - v[c])));
      },
      lutFloats: prepared.floats,
      glsl: (u, _rows, lutBase) => ({
        declare: `uniform vec4 ${u("Lut")};uniform vec3 ${u("LutLo")};uniform vec3 ${u("LutHi")};uniform vec4 ${u("Shaper")};uniform vec3 ${u("ShaperLo")};uniform vec3 ${u("ShaperHi")};`,
        call: `v=gLut(v,${u("Lut")},${u("LutLo")},${u("LutHi")},${u("Shaper")},${u("ShaperLo")},${u("ShaperHi")});`,
        uniforms: {
          [u("Lut")]: [
            lutBase + prepared.base,
            lut.size,
            lut.kind === "3d" ? 1 : 0,
            trilinear ? 1 : 0,
          ],
          [u("LutLo")]: [...lut.domainMin],
          [u("LutHi")]: [...lut.domainMax],
          [u("Shaper")]: [lutBase, lut.shaper?.size ?? 0, intensity, 0],
          [u("ShaperLo")]: [...(lut.shaper?.domainMin ?? [0, 0, 0])],
          [u("ShaperHi")]: [...(lut.shaper?.domainMax ?? [1, 1, 1])],
        },
      }),
    };
  },
};

/** The op for one effect's sampled parameters, or null when neutral. */
export const floatGradeOp = (
  id: FloatGradeEffectId,
  p: Params,
  source?: OpSource,
): FloatGradeOp | null => OPERATORS[id](p, source);

/** Straight float → straight byte, half up, clamped (the one quantization). */
export const quantizeGrade = (v: number) =>
  v >= 1 ? 255 : v > 0 ? Math.floor(v * 255 + 0.5) : 0;

/** The run on one straight color (0–1 floats in, bytes out). */
export function floatGradeBytes(ops: readonly FloatGradeOp[], v: Rgb): Rgb {
  let value = v;
  for (const op of ops) value = op.apply(value);
  return perChannel((c) => quantizeGrade(value[c]));
}

// --- GPU ----------------------------------------------------------------------

const GLSL_COMMON = `
const vec3 LUMA=vec3(${lumaCoefficients("bt709").join(",")});
float gSmooth(float e0,float e1,float x){float t=clamp((x-e0)/(e1-e0),0.0,1.0);return t*t*(3.0-2.0*t);}
const float LIMIT=${GRADE_LIMIT.toFixed(1)};
vec3 gLimit3(vec3 v){return clamp(v,-LIMIT,LIMIT);}
float gPow(float x,float p){return (x<0.0||p==1.0)?x:(x>1.0&&log2(x)*p>=${LOG2_GRADE_LIMIT})?LIMIT:pow(x,p);}
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
  return gLimit3(y2*(1.0-f)+s*f);
}
vec3 gWhite(vec3 v,mat3 m){vec3 l=m*vec3(gDec(v.r),gDec(v.g),gDec(v.b));return gLimit3(vec3(gEnc(l.r),gEnc(l.g),gEnc(l.b)));}
vec3 gCdl(vec3 v,vec3 slope,vec3 offs,vec3 power,vec2 sc){
  vec3 t=v*slope+offs;
  if(sc.y>0.5)t=clamp(t,0.0,1.0);
  vec3 p=gPow3(t,power);
  float y=dot(p,LUMA);
  vec3 o=y+sc.x*(p-y);
  return sc.y>0.5?clamp(o,0.0,1.0):gLimit3(o);
}
// CG4/CG5: curve and LUT tables are float32 bit patterns, one per RGBA8
// texel (little-endian), read back exactly.
float gBits(vec4 texel){uvec4 b=uvec4(floor(texel*255.0+0.5));return uintBitsToFloat(b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u));}
// CG4: curve tables are rows of the backdrop texture (row = curve).
const float TABLE_N=${CURVE_TABLE_SIZE.toFixed(1)};
float gTex(int i,int row){return gBits(texelFetch(backdrop,ivec2(i,row),0));}
float gCurve(int row,float x){
  if(x<=0.0){float a=gTex(0,row);return a+x*(gTex(1,row)-a)*(TABLE_N-1.0);}
  if(x>=1.0){float a=gTex(${CURVE_TABLE_SIZE - 1},row);return a+(x-1.0)*(a-gTex(${CURVE_TABLE_SIZE - 2},row))*(TABLE_N-1.0);}
  float t=x*(TABLE_N-1.0);int i=min(int(floor(t)),${CURVE_TABLE_SIZE - 2});float a=gTex(i,row);return a+(gTex(i+1,row)-a)*(t-float(i));
}
float gCurveWrap(int row,float x){
  float t=(x-floor(x))*TABLE_N;int i=int(floor(t))%${CURVE_TABLE_SIZE};float a=gTex(i,row);
  return a+(gTex((i+1)%${CURVE_TABLE_SIZE},row)-a)*(t-floor(t));
}
float gLimit(float v){return clamp(v,-LIMIT,LIMIT);}
vec3 gCurves(vec3 v,vec4 rows,float lumaMix){
  vec3 c=vec3(rows.x>=0.0?gLimit(gCurve(int(rows.x),v.r)):v.r,rows.y>=0.0?gLimit(gCurve(int(rows.y),v.g)):v.g,rows.z>=0.0?gLimit(gCurve(int(rows.z),v.b)):v.b);
  if(rows.w<0.0)return c;
  int m=int(rows.w);
  vec3 rgb=gLimit3(vec3(gCurve(m,c.r),gCurve(m,c.g),gCurve(m,c.b)));
  if(lumaMix==0.0)return rgb;
  float y=dot(c,LUMA);
  float lift=gCurve(m,y)-y;
  return gLimit3(rgb*(1.0-lumaMix)+(c+lift)*lumaMix);
}
vec3 gHueCurves(vec3 v,vec3 hueRows,vec3 satRows){
  float y=dot(v,LUMA);
  float cb=(v.b-y)/${BT709_CB_SCALE},cr=(v.r-y)/${BT709_CR_SCALE};
  float radius=length(vec2(cb,cr));
  float hue=radius>0.0?atan(cr,cb)/6.283185307179586:0.0;
  float sat=min(1.0,radius/${HUE_CURVE_SATURATION_SCALE.toFixed(4)});
  float t=min(1.0,radius/${HUE_CURVE_CHROMA_FADE.toFixed(4)});
  float w=t*t*(3.0-2.0*t);
  float gain=1.0,offs=0.0;
  if(hueRows.y>=0.0)gain*=1.0+w*(2.0*gCurveWrap(int(hueRows.y),hue)-1.0);
  if(satRows.x>=0.0)gain*=2.0*gCurve(int(satRows.x),clamp(y,0.0,1.0));
  if(satRows.y>=0.0)gain*=2.0*gCurve(int(satRows.y),sat);
  if(hueRows.z>=0.0)offs+=w*(gCurveWrap(int(hueRows.z),hue)-0.5)*${HUE_CURVE_LUMA_AMOUNT.toFixed(4)};
  if(satRows.z>=0.0)offs+=(gCurve(int(satRows.z),sat)-0.5)*${HUE_CURVE_LUMA_AMOUNT.toFixed(4)};
  float cb2=cb*gain,cr2=cr*gain;
  if(hueRows.x>=0.0){
    float turn=w*(gCurveWrap(int(hueRows.x),hue)-0.5)*6.283185307179586;
    float c=cos(turn),s=sin(turn);
    float nb=cb2*c-cr2*s;cr2=cb2*s+cr2*c;cb2=nb;
  }
  float y2=y+offs;
  float r=y2+${BT709_CR_SCALE}*cr2,b=y2+${BT709_CB_SCALE}*cb2;
  return gLimit3(vec3(r,(y2-LUMA.r*r-LUMA.b*b)/LUMA.g,b));
}
float gSoftClip(float x,vec2 clip){
  float hk=clip.x,lk=clip.y;
  if(hk<1.0&&x>hk)x=hk+(1.0-hk)*(1.0-exp(-(x-hk)/(1.0-hk)));
  if(lk>0.0&&x<lk)x=lk*exp(-(lk-x)/lk);
  return x;
}
vec3 gTonal(vec3 v,vec3 so,vec3 mo,vec3 ho,vec3 ex,vec3 rng,vec2 clip){
  float y=dot(v,LUMA);
  float ws=1.0-gSmooth(rng.x-rng.z,rng.x+rng.z,y);
  float wh=gSmooth(rng.y-rng.z,rng.y+rng.z,y);
  float wm=max(0.0,1.0-ws-wh);
  vec3 x=v*exp2(ws*ex.x+wm*ex.y+wh*ex.z)+(ws*so+wm*mo+wh*ho);
  return gLimit3(vec3(gSoftClip(x.r,clip),gSoftClip(x.g,clip),gSoftClip(x.b,clip)));
}
// CG5: LUT tables fill the coverage texture (LUT_W wide). Mirrors sampleLut.
const int LUT_W=${LUT_TEXTURE_WIDTH};
float gLutTex(int i){return gBits(texelFetch(coverage,ivec2(i%LUT_W,i/LUT_W),0));}
vec3 gLut1(vec3 v,int base,int size,vec3 lo,vec3 hi){
  vec3 x=(clamp(v,lo,hi)-lo)/(hi-lo)*float(size-1);
  vec3 o;
  for(int c=0;c<3;c++){int i=min(int(floor(x[c])),size-2);float a=gLutTex(base+i*3+c);o[c]=a+(gLutTex(base+(i+1)*3+c)-a)*(x[c]-float(i));}
  return o;
}
vec3 gLutNode(int base,int size,ivec3 p){int k=base+((p.z*size+p.y)*size+p.x)*3;return vec3(gLutTex(k),gLutTex(k+1),gLutTex(k+2));}
vec3 gLut3(vec3 v,int base,int size,vec3 lo,vec3 hi,bool tri){
  vec3 x=(clamp(v,lo,hi)-lo)/(hi-lo)*float(size-1);
  ivec3 i=min(ivec3(floor(x)),ivec3(size-2));
  vec3 f=x-vec3(i);
  vec3 c000=gLutNode(base,size,i),c111=gLutNode(base,size,i+ivec3(1));
  vec3 c100=gLutNode(base,size,i+ivec3(1,0,0)),c010=gLutNode(base,size,i+ivec3(0,1,0)),c001=gLutNode(base,size,i+ivec3(0,0,1));
  vec3 c110=gLutNode(base,size,i+ivec3(1,1,0)),c101=gLutNode(base,size,i+ivec3(1,0,1)),c011=gLutNode(base,size,i+ivec3(0,1,1));
  if(tri){
    vec3 c00=c000+(c100-c000)*f.x,c10=c010+(c110-c010)*f.x,c01=c001+(c101-c001)*f.x,c11=c011+(c111-c011)*f.x;
    vec3 c0=c00+(c10-c00)*f.y,c1=c01+(c11-c01)*f.y;
    return c0+(c1-c0)*f.z;
  }
  if(f.x>f.y){
    if(f.y>f.z)return c000+f.x*(c100-c000)+f.y*(c110-c100)+f.z*(c111-c110);
    if(f.x>f.z)return c000+f.x*(c100-c000)+f.z*(c101-c100)+f.y*(c111-c101);
    return c000+f.z*(c001-c000)+f.x*(c101-c001)+f.y*(c111-c101);
  }
  if(f.z>f.y)return c000+f.z*(c001-c000)+f.y*(c011-c001)+f.x*(c111-c011);
  if(f.z>f.x)return c000+f.y*(c010-c000)+f.z*(c011-c010)+f.x*(c111-c011);
  return c000+f.y*(c010-c000)+f.x*(c110-c010)+f.z*(c111-c110);
}
vec3 gLut(vec3 v,vec4 lut,vec3 lo,vec3 hi,vec4 sh,vec3 slo,vec3 shi){
  vec3 x=v;
  int shSize=int(sh.y+0.5);
  if(shSize>0)x=gLut1(x,int(sh.x+0.5),shSize,slo,shi);
  int base=int(lut.x+0.5),size=int(lut.y+0.5);
  vec3 o=lut.z>0.5?gLut3(x,base,size,lo,hi,lut.w>0.5):gLut1(x,base,size,lo,hi);
  return gLimit3(v+sh.z*(o-v));
}`;

/** One fused shader for the run (cached by the device per text). */
export function floatGradeShader(ops: readonly FloatGradeOp[]) {
  // Every op's tables, in order, become consecutive texture rows.
  const tables: Float32Array[] = [];
  // Every op's LUT floats, in order, are packed into one texture.
  const lutFloats: Float32Array[] = [];
  let lutLength = 0;
  const parts = ops.map((op, i) => {
    const rows = (op.tables ?? []).map((table) => tables.push(table) - 1);
    const lutBase = lutLength;
    if (op.lutFloats) {
      lutFloats.push(op.lutFloats);
      lutLength += op.lutFloats.length;
    }
    return op.glsl((name) => `g${i}${name}`, rows, lutBase);
  });
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
    uniforms: Object.assign({}, ...parts.map((p) => p.uniforms)) as Uniforms,
    tables,
    lutFloats,
  };
}

/** Curve tables as texture bytes: each float32's bits, little-endian, per texel. */
export function curveTableBytes(tables: readonly Float32Array[]) {
  const bytes = new Uint8Array(CURVE_TABLE_SIZE * tables.length * 4);
  tables.forEach((table, row) =>
    bytes.set(
      new Uint8Array(table.buffer, table.byteOffset, table.byteLength),
      row * CURVE_TABLE_SIZE * 4,
    ),
  );
  return bytes;
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
      const { fragment, uniforms, tables, lutFloats } = floatGradeShader(ops);
      if (!tables.length && !lutFloats.length) {
        context.pass(fragment, output, [input], uniforms);
        return output;
      }
      const inputs = [input, input];
      if (tables.length) {
        const table = context.createSurface(CURVE_TABLE_SIZE, tables.length);
        context.uploadBytes(table, curveTableBytes(tables));
        inputs[1] = table;
      }
      if (lutFloats.length) {
        const { bytes, width, height } = lutTextureBytes(lutFloats);
        const luts = context.createSurface(width, height);
        context.uploadBytes(luts, bytes);
        inputs.push(luts);
      }
      context.pass(fragment, output, inputs, uniforms);
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

const opsOf = (
  effects: readonly ({ effect: string; params: Params } & OpSource)[],
) =>
  effects.flatMap((e) => {
    const op = floatGradeOp(e.effect as FloatGradeEffectId, e.params, e);
    return op ? [op] : [];
  });

/** Effects whose op needs data beyond its parameters (CG5: a LUT asset). */
const needsSource = (id: string) => id === "grade.lut";

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
 * undefined when `start` does not begin a run of two or more (a lone
 * `grade.lut` is a run of one: its op needs the effect's prepared LUT).
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
  // A lone grade.lut still runs as a run: its op needs the effect's LUT.
  if (members.length < 2 && !members.some((m) => needsSource(m.effect)))
    return undefined;
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
