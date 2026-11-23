import {
  BT709_LUMA,
  combineKey,
  encodedToOklab,
  finesseIsSpatial,
  gradientWindow,
  KEY_QUALIFIERS,
  KEY_VIEW_GRAY,
  KEY_VIEWS,
  matteRange,
  NEUTRAL_KEY_QUALIFIER,
  NEUTRAL_MATTE_FINESSE,
  qualify,
  refineMatte,
  type KeyQualifier,
  type MatteFinesse,
  type MatteKernel,
  type Rgb,
} from "@still-shift/color-science";
import {
  GRADE_KEY_MATTE_SLOT,
  type BezierPath,
  type EffectParameters,
} from "@still-shift/scene-contract";
import { ellipsePath, rectanglePath } from "../shapes/primitives.ts";
import type { RenderOp } from "./graph.ts";
import { releaseRenderMetadata } from "../../managed-metadata.ts";
import {
  inverseMatrix,
  multiplyMatrix,
  transformPoint,
  type Matrix,
} from "../../node-transform.ts";
import { blurKernel } from "./webgl-blur-kernel.ts";

/**
 * CG6 `grade.key` in the float grade stage: the key's spec from sampled
 * parameters, its float64 evaluation over a whole frame (Canvas, the
 * reference) and its GLSL (the fused run shader and the matte finesse
 * passes). See docs/color-grading-cg6-decisions.md.
 */
export const GRADE_KEY = "grade.key";
/** The renderer's own input slot carrying a shape window's mask coverage. */
export const GRADE_KEY_WINDOW_SLOT = "window";
/** A key member's layer slot inside its run (effect ids are unique per stack). */
export const keyLayerSlot = (effectId: string, slot: string) =>
  `${effectId}/${slot}`;
/** Textures a key may add to the run's shader: window, matte, matte finesse. */
export const MAX_RUN_KEY_TEXTURES = 12;

type KeyEffect = {
  id: string;
  params: EffectParameters;
  placement?: { matrix: Matrix } | undefined;
  inputs?: Readonly<Record<string, string>> | undefined;
};

export type KeySpec = {
  readonly id: string;
  readonly qualifier: KeyQualifier;
  readonly finesse: MatteFinesse;
  /** Finesse that reads neighbouring pixels (needs the whole matte first). */
  readonly spatial: boolean;
  readonly kernel: MatteKernel | undefined;
  readonly window: number;
  readonly windowInvert: number;
  readonly gradient: number;
  readonly gradientStart: readonly [number, number];
  readonly gradientEnd: readonly [number, number];
  /** Surface pixel → the key's layer space. */
  readonly toLayer: Matrix;
  readonly matte: boolean;
  readonly matteMode: number;
  readonly matteLow: number;
  readonly matteHigh: number;
  readonly matteInvert: number;
  readonly gain: number;
  readonly offset: number;
  readonly view: number;
};

const num = (p: EffectParameters, key: string) => p[key] as number;
const pair = (p: EffectParameters, key: string) =>
  p[key] as unknown as readonly [number, number];
/** A sampled color parameter: RGBA 0–1 (evaluated) or `#rrggbb`. */
const sampleRgb = (value: unknown): Rgb =>
  typeof value === "string"
    ? [
        parseInt(value.slice(1, 3), 16) / 255,
        parseInt(value.slice(3, 5), 16) / 255,
        parseInt(value.slice(5, 7), 16) / 255,
      ]
    : ([...(value as readonly number[]).slice(0, 3)] as unknown as Rgb);

/** The matte kernel for σ: `blur.gaussian`'s and mask feather's three boxes. */
function matteKernel(sigma: number): MatteKernel {
  const kernel = blurKernel(sigma);
  try {
    return { weights: [...kernel.weights], divisor: kernel.divisor };
  } finally {
    releaseRenderMetadata(kernel);
  }
}

export function keySpec(effect: KeyEffect): KeySpec {
  const p = effect.params;
  const qualifier: KeyQualifier = {
    ...NEUTRAL_KEY_QUALIFIER,
    ...Object.fromEntries(
      Object.keys(NEUTRAL_KEY_QUALIFIER)
        .filter((key) => key !== "samplesOklab")
        .map((key) => [key, num(p, key)]),
    ),
    samplesOklab: Array.from({ length: num(p, "sampleCount") }, (_, i) =>
      encodedToOklab(sampleRgb(p[`sample${i + 1}`])),
    ),
  };
  const finesse = Object.fromEntries(
    Object.keys(NEUTRAL_MATTE_FINESSE).map((key) => [key, num(p, key)]),
  ) as MatteFinesse;
  const spatial = qualifier.qualifier > 0 && finesseIsSpatial(finesse);
  return {
    id: effect.id,
    qualifier,
    finesse,
    spatial,
    kernel: spatial && finesse.blur > 0 ? matteKernel(finesse.blur) : undefined,
    window: num(p, "window"),
    windowInvert: num(p, "windowInvert"),
    gradient: num(p, "gradient"),
    gradientStart: pair(p, "gradientStart"),
    gradientEnd: pair(p, "gradientEnd"),
    toLayer: inverseMatrix(effect.placement?.matrix ?? [1, 0, 0, 1, 0, 0]),
    matte: effect.inputs?.[GRADE_KEY_MATTE_SLOT] !== undefined,
    matteMode: num(p, "matteMode"),
    matteLow: num(p, "matteLow"),
    matteHigh: num(p, "matteHigh"),
    matteInvert: num(p, "matteInvert"),
    gain: num(p, "gain"),
    offset: num(p, "offset"),
    view: num(p, "view"),
  };
}

/** A key that selects everything and shows nothing: its scope is unkeyed. */
export const keyIsNeutral = (k: KeySpec) =>
  !k.qualifier.qualifier &&
  !k.window &&
  !k.gradient &&
  !k.matte &&
  k.gain === 1 &&
  k.offset === 0 &&
  !k.view;

/** Layer slots (run-scoped names) the key reads. */
export const keySlots = (k: KeySpec) => [
  ...(k.window ? [keyLayerSlot(k.id, GRADE_KEY_WINDOW_SLOT)] : []),
  ...(k.matte ? [keyLayerSlot(k.id, GRADE_KEY_MATTE_SLOT)] : []),
];

// --- Float64 (Canvas, the reference) ----------------------------------------------

/** Premultiplied RGBA8 planes (window coverage, matte) by run-scoped slot. */
export type KeyPlanes = ReadonlyMap<string, ArrayLike<number>>;

/**
 * The key over a frame: `value` holds straight RGB per pixel (3 floats),
 * `alpha` the stored alpha bytes (transparent pixels qualify as 0).
 */
export function evaluateKey(
  k: KeySpec,
  width: number,
  height: number,
  value: Float64Array,
  alpha: ArrayLike<number>,
  planes: KeyPlanes,
): Float64Array {
  const count = width * height;
  let q: Float64Array = new Float64Array(count).fill(1);
  if (k.qualifier.qualifier) {
    for (let i = 0; i < count; i++)
      q[i] = alpha[i]
        ? qualify(
            [value[i * 3]!, value[i * 3 + 1]!, value[i * 3 + 2]!],
            k.qualifier,
          )
        : 0;
    q = refineMatte(q, width, height, k.finesse, k.kernel);
  }
  const window = planes.get(keyLayerSlot(k.id, GRADE_KEY_WINDOW_SLOT));
  const matte = planes.get(keyLayerSlot(k.id, GRADE_KEY_MATTE_SLOT));
  if ((k.window && !window) || (k.matte && !matte))
    throw Error(`comp-effect-layer: grade.key "${k.id}" lost its input`);
  const key = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let w = 1;
    if (k.window) {
      w = window![i * 4 + 3]! / 255;
      if (k.windowInvert) w = 1 - w;
    }
    let g = 1;
    if (k.gradient) {
      const [x, y] = transformPoint(k.toLayer, [
        (i % width) + 0.5,
        Math.floor(i / width) + 0.5,
      ]);
      g = gradientWindow(x, y, k.gradientStart, k.gradientEnd);
    }
    let m = 1;
    if (k.matte) {
      const at = i * 4;
      const raw = k.matteMode
        ? (BT709_LUMA[0] * matte![at]! +
            BT709_LUMA[1] * matte![at + 1]! +
            BT709_LUMA[2] * matte![at + 2]!) /
          255
        : matte![at + 3]! / 255;
      m = matteRange(raw, k.matteLow, k.matteHigh, k.matteInvert);
    }
    key[i] = combineKey(q[i]!, w, g, m, k.gain, k.offset);
  }
  return key;
}

// --- GLSL ---------------------------------------------------------------------------

/** Shared key functions (mirror @still-shift/color-science keys.ts). */
export const KEY_GLSL = `
float kLin(float v,float lo,float hi,float s){
  float a=min(lo,hi),b=max(lo,hi);
  if(s<=0.0)return (v>=a&&v<=b)?1.0:0.0;
  return min(gSmooth(a-s,a,v),1.0-gSmooth(b,b+s,v));
}
float kHsl(vec3 v,vec4 h,vec3 s,vec3 l){
  float mx=max(max(v.r,v.g),v.b),mn=min(min(v.r,v.g),v.b),d=mx-mn;
  float hue=-1.0,sat=0.0;
  if(d>0.0){
    float lig=(mx+mn)*0.5;
    sat=clamp(d/(1.0-abs(2.0*lig-1.0)),0.0,1.0);
    float sec=mx==v.r?mod((v.g-v.b)/d,6.0):mx==v.g?(v.b-v.r)/d+2.0:(v.r-v.g)/d+4.0;
    hue=mod(sec*60.0,360.0);
  }
  float ht=1.0;
  if(h.z<360.0){
    if(hue<0.0)ht=0.0;
    else{
      float raw=mod(abs(hue-h.y),360.0),dist=min(raw,360.0-raw),half_=h.z*0.5;
      ht=h.w<=0.0?(dist<=half_?1.0:0.0):1.0-gSmooth(half_,half_+h.w,dist);
    }
  }
  return ht*kLin(sat,s.x,s.y,s.z)*kLin(dot(v,LUMA),l.x,l.y,l.z);
}
vec3 kOklab(vec3 v){
  vec3 c=vec3(gDec(v.r),gDec(v.g),gDec(v.b));
  vec3 lms=vec3(
    0.4122214708*c.r+0.5363325363*c.g+0.0514459929*c.b,
    0.2119034982*c.r+0.6806995451*c.g+0.1073969566*c.b,
    0.0883024619*c.r+0.2817188376*c.g+0.6299787005*c.b);
  lms=pow(lms,vec3(1.0/3.0));
  return vec3(
    0.2104542553*lms.x+0.793617785*lms.y-0.0040720468*lms.z,
    1.9779984951*lms.x-2.428592205*lms.y+0.4505937099*lms.z,
    0.0259040371*lms.x+0.7827717662*lms.y-0.808675766*lms.z);
}
float kNear(float d,vec2 rs){
  if(d<=rs.x)return 1.0;
  if(rs.y<=0.0)return 0.0;
  return 1.0-gSmooth(rs.x,rs.x+rs.y,d);
}
float kClip(float v,vec2 c){return (c.x==0.0&&c.y==1.0)?v:clamp((v-c.x)/(c.y-c.x),0.0,1.0);}
float kByte(vec4 t,int c){return floor(t[c]*255.0+0.5);}
vec4 kPack(float f){uint u=floatBitsToUint(f);return vec4(float(u&255u),float((u>>8u)&255u),float((u>>16u)&255u),float(u>>24u))/255.0;}
vec3 kView(float view,float k,vec3 scoped){
  if(view==${KEY_VIEWS.key.toFixed(1)})return vec3(k);
  if(view==${KEY_VIEWS.highlight.toFixed(1)})return k<=0.0?vec3(${KEY_VIEW_GRAY.toFixed(1)}):k>=1.0?scoped:${KEY_VIEW_GRAY.toFixed(1)}+(scoped-${KEY_VIEW_GRAY.toFixed(1)})*k;
  return vec3(k>0.0?1.0:0.0);
}`;

/** Where a key's textures sit among the run shader's samplers. */
export type KeyTextures = {
  window?: number;
  matte?: number;
  mask?: number;
};

/**
 * One key's uniform declarations, its qualifier function (`k<j>Q`, the
 * clipped qualifier before neighbourhood finesse) and its key function
 * (`k<j>(vec3 a)`), given the samplers of its textures.
 */
export function keyGlsl(j: number, k: KeySpec, textures: KeyTextures) {
  const u = (name: string) => `k${j}${name}`;
  const sampler = (i: number) => `input${i}`;
  const q = k.qualifier;
  const samples = q.samplesOklab;
  const declare: string[] = [];
  const uniforms: Record<string, number | number[]> = {};
  const add = (name: string, type: string, value: number | number[]) => {
    declare.push(`uniform ${type} ${u(name)};`);
    uniforms[u(name)] = value;
  };
  let qual = "1.0";
  if (q.qualifier === KEY_QUALIFIERS.hsl) {
    add("H", "vec4", [0, q.hueCenter, q.hueWidth, q.hueSoftness]);
    add("S", "vec3", [q.saturationMin, q.saturationMax, q.saturationSoftness]);
    add("L", "vec3", [q.luminanceMin, q.luminanceMax, q.luminanceSoftness]);
    qual = `kHsl(c,${u("H")},${u("S")},${u("L")})`;
  } else if (q.qualifier === KEY_QUALIFIERS.rgb) {
    add("Lo", "vec3", [q.redMin, q.greenMin, q.blueMin]);
    add("Hi", "vec3", [q.redMax, q.greenMax, q.blueMax]);
    add("Soft", "float", q.rgbSoftness);
    qual = [0, 1, 2]
      .map(
        (c) => `kLin(c[${c}],${u("Lo")}[${c}],${u("Hi")}[${c}],${u("Soft")})`,
      )
      .join("*");
  } else if (q.qualifier === KEY_QUALIFIERS.luma) {
    add("L", "vec3", [q.luminanceMin, q.luminanceMax, q.luminanceSoftness]);
    qual = `kLin(dot(c,LUMA),${u("L")}.x,${u("L")}.y,${u("L")}.z)`;
  } else if (q.qualifier === KEY_QUALIFIERS.sampled) {
    add("RS", "vec2", [q.sampleRadius, q.sampleSoftness]);
    samples.forEach((s, i) => add(`s${i}`, "vec3", [...s]));
    qual = samples.length
      ? `kNear(${samples
          .map((_, i) => `distance(lab,${u(`s${i}`)})`)
          .reduce((a, b) => `min(${a},${b})`)},${u("RS")})`
      : "0.0";
  }
  const f = k.finesse;
  if (q.qualifier) add("Clip", "vec2", [f.clipBlack, f.clipWhite]);
  const at = "ivec2(gl_FragCoord.xy)";
  const lines = [`float ${u("Q")}(vec3 a){`];
  if (q.qualifier) {
    lines.push(`  vec3 c=clamp(a,0.0,1.0);`);
    if (q.qualifier === KEY_QUALIFIERS.sampled)
      lines.push(`  vec3 lab=kOklab(c);`);
    lines.push(`  return kClip(${qual},${u("Clip")});`);
  } else lines.push(`  return 1.0;`);
  lines.push(`}`, `float ${u("")}(vec3 a){`);
  if (!q.qualifier) lines.push(`  float q=1.0;`);
  else if (k.spatial)
    lines.push(
      `  float q=gBits(texelFetch(${sampler(textures.mask!)},${at},0));`,
    );
  else lines.push(`  float q=${u("Q")}(a);${f.invert ? "q=1.0-q;" : ""}`);
  if (k.window)
    lines.push(
      `  float w=kByte(texelFetch(${sampler(textures.window!)},${at},0),3)/255.0;${k.windowInvert ? "w=1.0-w;" : ""}`,
    );
  else lines.push(`  float w=1.0;`);
  if (k.gradient) {
    const [a, b, c, d, e, g] = k.toLayer;
    add("M", "vec4", [a, b, c, d]);
    add("T", "vec4", [e, g, 0, 0]);
    add("G", "vec4", [...k.gradientStart, ...k.gradientEnd]);
    lines.push(
      `  vec2 p=vec2(${u("M")}.x*gl_FragCoord.x+${u("M")}.z*gl_FragCoord.y+${u("T")}.x,${u("M")}.y*gl_FragCoord.x+${u("M")}.w*gl_FragCoord.y+${u("T")}.y);`,
      `  vec2 dir=${u("G")}.zw-${u("G")}.xy;float len2=dot(dir,dir);`,
      `  float g=len2==0.0?1.0:clamp(dot(p-${u("G")}.xy,dir)/len2,0.0,1.0);`,
    );
  } else lines.push(`  float g=1.0;`);
  if (k.matte) {
    add("Mt", "vec4", [k.matteMode, k.matteLow, k.matteHigh, k.matteInvert]);
    lines.push(
      `  vec4 mt=texelFetch(${sampler(textures.matte!)},${at},0);`,
      `  float raw=${u("Mt")}.x>0.5?(LUMA.r*kByte(mt,0)+LUMA.g*kByte(mt,1)+LUMA.b*kByte(mt,2))/255.0:kByte(mt,3)/255.0;`,
      `  float m=(${u("Mt")}.y==0.0&&${u("Mt")}.z==1.0)?clamp(raw,0.0,1.0):clamp((raw-${u("Mt")}.y)/(${u("Mt")}.z-${u("Mt")}.y),0.0,1.0);`,
      `  if(${u("Mt")}.w>0.5)m=1.0-m;`,
    );
  } else lines.push(`  float m=1.0;`);
  add("Out", "vec2", [k.gain, k.offset]);
  lines.push(
    `  return clamp(${u("Out")}.x*q*w*g*m+${u("Out")}.y,0.0,1.0);`,
    `}`,
  );
  return {
    declare: [
      ...declare,
      ...Object.values(textures).map((i) => `uniform sampler2D ${sampler(i)};`),
      ...lines,
    ].join("\n"),
    uniforms,
  };
}

// --- Matte finesse passes (GPU) ------------------------------------------------------

const FINESSE_HEADER = `
float kBits(vec4 texel){uvec4 b=uvec4(floor(texel*255.0+0.5));return uintBitsToFloat(b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u));}
vec4 kPack(float f){uint u=floatBitsToUint(f);return vec4(float(u&255u),float((u>>8u)&255u),float((u>>16u)&255u),float(u>>24u))/255.0;}
float kAt(sampler2D t,ivec2 p){ivec2 n=textureSize(t,0);return kBits(texelFetch(t,clamp(p,ivec2(0),n-1),0));}`;

const MEDIAN_SHADER = `${FINESSE_HEADER}
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);
  float w[9];
  int k=0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)w[k++]=kAt(source,p+ivec2(x,y));
  for(int i=1;i<9;i++){float v=w[i];int j=i-1;while(j>=0&&w[j]>v){w[j+1]=w[j];j--;}w[j+1]=v;}
  pixel=kPack(w[4]);
}`;
const MORPH_SHADER = `${FINESSE_HEADER}
uniform vec4 kMorph;
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy),step_=kMorph.y>0.5?ivec2(0,1):ivec2(1,0);
  int r=int(kMorph.x);
  float v=kAt(source,p);
  for(int d=-r;d<=r;d++){float s=kAt(source,p+step_*d);v=kMorph.z>0.5?max(v,s):min(v,s);}
  pixel=kPack(v);
}`;
const BLUR_SHADER = `${FINESSE_HEADER}
uniform vec4 kBlur;
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy),step_=kBlur.y>0.5?ivec2(0,1):ivec2(1,0);
  int r=int(kBlur.x);
  float sum=0.0;
  for(int i=0;i<=2*r;i++)sum+=kBits(texelFetch(backdrop,ivec2(i,0),0))*kAt(source,p+step_*(i-r));
  pixel=kPack(sum/kBlur.z);
}`;
const FINISH_SHADER = `${FINESSE_HEADER}
uniform vec4 kFinish;
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);
  float s=kAt(source,p),v=s;
  if(kFinish.x>0.5){
    float b=kAt(backdrop,p),ratio=kFinish.y;
    if(ratio==0.0)v=b;
    else{float bound=ratio<0.0?min(s,b):max(s,b),t=abs(ratio);v=t==1.0?bound:b+(bound-b)*t;}
  }
  if(kFinish.z>0.5)v=1.0-v;
  pixel=kPack(v);
}`;

/** The minimal GPU context the finesse passes need. */
type FinesseContext<S> = {
  createSurface(width: number, height: number): S;
  releaseSurface(surface: S): void;
  uploadBytes(surface: S, bytes: Uint8Array<ArrayBuffer>): void;
  pass(
    fragment: string,
    output: S,
    inputs: readonly S[],
    uniforms?: Record<string, number | readonly number[]>,
  ): void;
};

/** Matte finesse on the GPU: `mask` holds clipped qualifier bits; returns the refined mask. */
export function refineMaskGpu<S extends { width: number; height: number }>(
  context: FinesseContext<S>,
  mask: S,
  k: KeySpec,
): S {
  let current = mask;
  const next = (
    fragment: string,
    inputs: S[],
    uniforms: Record<string, number[]>,
  ) => {
    const out = context.createSurface(mask.width, mask.height);
    context.pass(fragment, out, inputs, uniforms);
    return out;
  };
  const replace = (out: S) => {
    if (current !== mask) context.releaseSurface(current);
    current = out;
  };
  const morph = (r: number, dilate: boolean) => {
    for (const vertical of [0, 1])
      replace(
        next(MORPH_SHADER, [current], {
          kMorph: [r, vertical, dilate ? 1 : 0, 0],
        }),
      );
  };
  const f = k.finesse;
  for (let i = 0; i < f.denoise; i++)
    replace(next(MEDIAN_SHADER, [current], {}));
  if (f.cleanBlack > 0) {
    morph(f.cleanBlack, false);
    morph(f.cleanBlack, true);
  }
  if (f.cleanWhite > 0) {
    morph(f.cleanWhite, true);
    morph(f.cleanWhite, false);
  }
  if (f.shrinkGrow !== 0) morph(Math.abs(f.shrinkGrow), f.shrinkGrow > 0);
  let blurred: S | undefined;
  if (f.blur > 0) {
    const { weights, divisor } = k.kernel!;
    const table = context.createSurface(weights.length, 1);
    try {
      context.uploadBytes(
        table,
        new Uint8Array(Float32Array.from(weights).buffer),
      );
      const radius = (weights.length - 1) / 2;
      const across = next(BLUR_SHADER, [current, table], {
        kBlur: [radius, 0, divisor, 0],
      });
      try {
        blurred = next(BLUR_SHADER, [across, table], {
          kBlur: [radius, 1, divisor, 0],
        });
      } finally {
        context.releaseSurface(across);
      }
    } finally {
      context.releaseSurface(table);
    }
  }
  if (blurred || f.invert) {
    const out = next(FINISH_SHADER, [current, blurred ?? current], {
      kFinish: [blurred ? 1 : 0, f.inOutRatio, f.invert, 0],
    });
    if (blurred) context.releaseSurface(blurred);
    replace(out);
  }
  return current;
}

// --- Shape windows as layer-mask data (graph) -------------------------------------------

/**
 * A `grade.key` with an ellipse or rectangle window gets its coverage as a
 * renderer input: a white solid carrying the window as a layer mask (the
 * path a shape layer's ellipse or rectangle makes, rotated about its centre,
 * with the mask feather and expansion), in the key's layer space, drawn by
 * the layer-mask rasterizer.
 */
export function withKeyWindow<
  E extends {
    effect: string;
    id: string;
    params: EffectParameters;
    placement?: { matrix: Matrix; transforms: Matrix[] } | undefined;
    layerInputs?: Readonly<Record<string, RenderOp[]>> | undefined;
  },
>(effect: E, layer: string): E {
  if (effect.effect !== GRADE_KEY || !effect.params.window) return effect;
  const p = effect.params;
  const centre = pair(p, "windowCenter"),
    size = pair(p, "windowSize");
  const base =
    num(p, "window") === 1
      ? ellipsePath({ size: [...size], position: [...centre] })
      : rectanglePath({
          size: [...size],
          position: [...centre],
          roundness: num(p, "windowRoundness"),
        });
  const matrix = effect.placement?.matrix ?? [1, 0, 0, 1, 0, 0];
  const transforms = effect.placement?.transforms ?? [matrix];
  let ops: RenderOp[] = [];
  if (base) {
    const angle = (num(p, "windowRotation") * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    const turn = ([x, y]: readonly number[]): [number, number] => [
      x! * cos - y! * sin,
      x! * sin + y! * cos,
    ];
    const path: BezierPath = {
      ...base,
      vertices: base.vertices.map(([x, y]) => {
        const [rx, ry] = turn([x! - centre[0], y! - centre[1]]);
        return [rx + centre[0], ry + centre[1]];
      }),
      ...(base.inTangents ? { inTangents: base.inTangents.map(turn) } : {}),
      ...(base.outTangents ? { outTangents: base.outTangents.map(turn) } : {}),
    };
    const feather = num(p, "windowFeather"),
      expansion = num(p, "windowExpansion");
    const margin = 2 * feather + Math.abs(expansion) + 4;
    const xs = path.vertices.flatMap(([x], i) => [
      x!,
      x! + (path.inTangents?.[i]?.[0] ?? 0),
      x! + (path.outTangents?.[i]?.[0] ?? 0),
    ]);
    const ys = path.vertices.flatMap(([, y], i) => [
      y!,
      y! + (path.inTangents?.[i]?.[1] ?? 0),
      y! + (path.outTangents?.[i]?.[1] ?? 0),
    ]);
    const left = Math.min(...xs) - margin,
      top = Math.min(...ys) - margin;
    const draw = multiplyMatrix(matrix, [1, 0, 0, 1, left, top]);
    const name = `${layer}#${effect.id}-window`;
    ops = [
      {
        kind: "isolate",
        layer: name,
        ops: [
          {
            kind: "draw",
            layer: name,
            content: {
              type: "solid",
              width: Math.max(...xs) + margin - left,
              height: Math.max(...ys) + margin - top,
              color: [1, 1, 1, 1],
            },
            matrix: draw,
            transforms: [draw],
            opacity: 1,
            blend: "normal",
            clips: [],
          },
        ],
        effects: [],
        masks: [
          {
            id: `${effect.id}-window`,
            path,
            mode: "add",
            inverted: false,
            feather,
            expansion,
            opacity: 1,
            matrix,
            transforms,
          },
        ],
        matte: null,
        opacity: 1,
        blend: "normal",
        clips: [],
      },
    ];
  }
  return {
    ...effect,
    layerInputs: { ...effect.layerInputs, [GRADE_KEY_WINDOW_SLOT]: ops },
  };
}
