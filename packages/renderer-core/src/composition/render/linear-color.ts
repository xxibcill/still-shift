import type { CompositionBlendMode } from "@still-shift/scene-contract";
import { BLEND_FUNCTIONS, BLEND_MODES } from "./webgl-blend.ts";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const divide = (value: number, denominator: number) =>
  Math.floor((value + Math.floor(denominator / 2)) / denominator);
const decode = new Uint16Array(256);
const encode = new Uint8Array(65536);
for (let byte = 0; byte < 256; byte++) {
  const value = byte / 255;
  decode[byte] = Math.round(
    (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
      65535,
  );
}
for (let word = 0; word < 65536; word++) {
  const value = word / 65535;
  encode[word] = Math.round(
    clamp(
      value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055,
    ) * 255,
  );
}
export const decodeSrgb = (byte: number) => decode[byte]!;
export const encodeSrgb = (word: number) =>
  encode[Math.max(0, Math.min(65535, word))]!;
/** A bounded transfer-control texture: encode R, decode low/high GB. */
export function linearTransferBytes() {
  const bytes = new Uint8Array(65536 * 4);
  for (let word = 0; word < 65536; word++) {
    bytes[word * 4] = encode[word]!;
    bytes[word * 4 + 3] = 255;
    if (word < 256) {
      bytes[word * 4 + 1] = decode[word]! & 255;
      bytes[word * 4 + 2] = decode[word]! >>> 8;
    }
  }
  return bytes;
}
export function decodeLinearPixel(
  bytes: ArrayLike<number>,
  offset: number,
  out: Uint32Array,
  outOffset = 0,
) {
  const alpha = bytes[offset + 3]!;
  out[outOffset + 3] = alpha;
  for (let channel = 0; channel < 3; channel++)
    out[outOffset + channel] = alpha
      ? divide(
          decode[divide(bytes[offset + channel]! * 255, alpha)]! * alpha,
          255,
        )
      : 0;
}
export function encodeLinearPixel(
  words: ArrayLike<number>,
  offset: number,
  out: Uint8ClampedArray,
  outOffset = 0,
) {
  const alpha = Math.min(255, words[offset + 3]!);
  out[outOffset + 3] = alpha;
  for (let channel = 0; channel < 3; channel++)
    out[outOffset + channel] = alpha
      ? divide(
          encodeSrgb(
            divide(Math.min(65535, words[offset + channel]!) * 255, alpha),
          ) * alpha,
          255,
        )
      : 0;
}
type Color = [number, number, number];
const lum = ([r, g, b]: Color) => 0.3 * r + 0.59 * g + 0.11 * b;
const sat = (c: Color) => Math.max(...c) - Math.min(...c);
function clipColor(c: Color): Color {
  const l = lum(c),
    n = Math.min(...c),
    x = Math.max(...c);
  if (n < 0) c = c.map((v) => l + ((v - l) * l) / (l - n)) as Color;
  if (x > 1) c = c.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as Color;
  return c;
}
const setLum = (c: Color, value: number) =>
  clipColor(c.map((v) => v + value - lum(c)) as Color);
function setSat(c: Color, value: number): Color {
  const n = Math.min(...c),
    x = Math.max(...c);
  return x > n
    ? (c.map((v) => ((v - n) * value) / (x - n)) as Color)
    : [0, 0, 0];
}
function blendColors(b: Color, s: Color, mode: CompositionBlendMode): Color {
  if (mode === "hue") return setLum(setSat(s, sat(b)), lum(b));
  if (mode === "saturation") return setLum(setSat(b, sat(s)), lum(b));
  if (mode === "color") return setLum(s, lum(b));
  if (mode === "luminosity") return setLum(b, lum(s));
  return s.map((source, channel) => {
    const backdrop = b[channel]!;
    switch (mode) {
      case "normal":
      case "add":
        return source;
      case "multiply":
        return backdrop * source;
      case "screen":
        return backdrop + source - backdrop * source;
      case "overlay":
        return backdrop < 0.5
          ? 2 * backdrop * source
          : 1 - 2 * (1 - backdrop) * (1 - source);
      case "darken":
        return Math.min(backdrop, source);
      case "lighten":
        return Math.max(backdrop, source);
      case "color-dodge":
        return backdrop === 0
          ? 0
          : source >= 1
            ? 1
            : Math.min(1, backdrop / (1 - source));
      case "color-burn":
        return backdrop >= 1
          ? 1
          : source === 0
            ? 0
            : 1 - Math.min(1, (1 - backdrop) / source);
      case "hard-light":
        return source < 0.5
          ? 2 * backdrop * source
          : 1 - 2 * (1 - backdrop) * (1 - source);
      case "soft-light": {
        const d =
          backdrop <= 0.25
            ? ((16 * backdrop - 12) * backdrop + 4) * backdrop
            : Math.sqrt(backdrop);
        return source <= 0.5
          ? backdrop - (1 - 2 * source) * backdrop * (1 - backdrop)
          : backdrop + (2 * source - 1) * (d - backdrop);
      }
      case "difference":
        return Math.abs(backdrop - source);
      case "exclusion":
        return backdrop + source - 2 * backdrop * source;
    }
  }) as Color;
}
/** A pass owns one workspace; pixels never allocate typed-array scratch. */
export function createLinearBlendKernel(
  mode: CompositionBlendMode,
  opacity = 1,
) {
  const src = new Uint8ClampedArray(4),
    s = new Uint32Array(4),
    b = new Uint32Array(4),
    words = new Uint32Array(4);
  const sourceColor: Color = [0, 0, 0],
    backdropColor: Color = [0, 0, 0];
  const scale = Math.round(clamp(opacity) * 255) + 1;
  return (
    source: ArrayLike<number>,
    sourceOffset: number,
    backdrop: ArrayLike<number>,
    backdropOffset: number,
    out: Uint8ClampedArray,
    outOffset: number,
  ) => {
    for (let c = 0; c < 4; c++)
      src[c] = Math.floor((source[sourceOffset + c]! * scale) / 256);
    if (!src[3]) {
      for (let c = 0; c < 4; c++)
        out[outOffset + c] = backdrop[backdropOffset + c]!;
      return;
    }
    if (!backdrop[backdropOffset + 3]) {
      out.set(src, outOffset);
      return;
    }
    decodeLinearPixel(src, 0, s);
    decodeLinearPixel(backdrop, backdropOffset, b);
    const sa = s[3]!,
      ba = b[3]!;
    words[3] =
      mode === "add"
        ? Math.min(255, sa + ba)
        : sa + divide(ba * (255 - sa), 255);
    if (mode === "add" || mode === "normal")
      for (let c = 0; c < 3; c++)
        words[c] = Math.min(
          65535,
          s[c]! + (mode === "add" ? b[c]! : divide(b[c]! * (255 - sa), 255)),
        );
    else {
      for (let c = 0; c < 3; c++) {
        sourceColor[c] = clamp((s[c]! * 255) / sa / 65535);
        backdropColor[c] = clamp((b[c]! * 255) / ba / 65535);
      }
      const blended = blendColors(backdropColor, sourceColor, mode);
      for (let c = 0; c < 3; c++)
        words[c] = divide(
          s[c]! * (255 - ba) * 255 +
            b[c]! * (255 - sa) * 255 +
            Math.round(clamp(blended[c]!) * 65535) * sa * ba,
          65025,
        );
    }
    encodeLinearPixel(words, 0, out, outOffset);
  };
}
/** Input and output are canonical premultiplied encoded-sRGB bytes. */
export function linearBlendPixel(
  source: ArrayLike<number>,
  backdrop: ArrayLike<number>,
  mode: CompositionBlendMode,
  opacity = 1,
) {
  const out = new Uint8ClampedArray(4);
  createLinearBlendKernel(mode, opacity)(source, 0, backdrop, 0, out, 0);
  return out;
}
export function createLinearLerpKernel() {
  const s = new Uint32Array(4),
    b = new Uint32Array(4),
    words = new Uint32Array(4);
  return (
    source: ArrayLike<number>,
    sourceOffset: number,
    backdrop: ArrayLike<number>,
    backdropOffset: number,
    coverage: number,
    out: Uint8ClampedArray,
    outOffset: number,
  ) => {
    decodeLinearPixel(source, sourceOffset, s);
    decodeLinearPixel(backdrop, backdropOffset, b);
    for (let c = 0; c < 4; c++)
      words[c] = divide(s[c]! * coverage + b[c]! * (255 - coverage), 255);
    encodeLinearPixel(words, 0, out, outOffset);
  };
}
export function linearLerpPixel(
  source: ArrayLike<number>,
  backdrop: ArrayLike<number>,
  coverage: number,
) {
  const out = new Uint8ClampedArray(4);
  createLinearLerpKernel()(source, 0, backdrop, 0, coverage, out, 0);
  return out;
}
export function linearShaderControls(table = "coverage") {
  return `
uint roundedDivide(uint n,uint d){n+=(d>>1);uint q=uint(floor(float(n)/float(d)));if(q*d>n)q--;else if((q+1u)*d<=n)q++;return q;}
uvec4 stored(vec4 value){return uvec4(floor(clamp(value,0.0,1.0)*255.0+0.5));}
uint decoded(uint value){uvec4 pair=stored(texelFetch(${table},ivec2(int(value),0),0));return pair.g|(pair.b<<8);}
uvec4 linearWords(uvec4 value){if(value.a==0u)return uvec4(0u);uvec4 result=uvec4(0u);result.a=value.a;for(int c=0;c<3;c++)result[c]=roundedDivide(decoded(roundedDivide(value[c]*255u,value.a))*value.a,255u);return result;}
uvec4 encodedWords(uvec4 words){uint a=min(255u,words.a);uvec4 result=uvec4(0u);result.a=a;if(a==0u)return result;for(int c=0;c<3;c++){uint word=min(65535u,roundedDivide(min(65535u,words[c])*255u,a));uint value=stored(texelFetch(${table},ivec2(int(word&255u),int(word>>8)),0)).r;result[c]=roundedDivide(value*a,255u);}return result;}
`;
}
export function linearBlendShader(mode: CompositionBlendMode) {
  return `${BLEND_FUNCTIONS}${linearShaderControls()}
uniform float opacity;
void main(){
 uvec4 src=stored(texture(source,uv)),dst=stored(texture(backdrop,uv));uint scale=uint(floor(clamp(opacity,0.0,1.0)*255.0+0.5))+1u;src=(src*scale)>>8;
 if(src.a==0u){pixel=vec4(dst)/255.0;return;}if(dst.a==0u){pixel=vec4(src)/255.0;return;}
 uvec4 sl=linearWords(src),bl=linearWords(dst),outWords=uvec4(0u);
 ${mode === "add" ? "outWords=min(uvec4(65535u,65535u,65535u,255u),sl+bl);" : mode === "normal" ? "outWords.a=sl.a+roundedDivide(bl.a*(255u-sl.a),255u);for(int c=0;c<3;c++)outWords[c]=min(65535u,sl[c]+roundedDivide(bl[c]*(255u-sl.a),255u));" : `vec3 s=clamp(vec3(sl.rgb)*255.0/float(sl.a)/65535.0,0.0,1.0),b=clamp(vec3(bl.rgb)*255.0/float(bl.a)/65535.0,0.0,1.0);uvec3 blended=uvec3(floor(clamp(${BLEND_MODES[mode]},0.0,1.0)*65535.0+0.5));outWords.a=sl.a+roundedDivide(bl.a*(255u-sl.a),255u);for(int c=0;c<3;c++)outWords[c]=roundedDivide(sl[c]*(255u-bl.a)*255u+bl[c]*(255u-sl.a)*255u+blended[c]*sl.a*bl.a,65025u);`}
 pixel=vec4(encodedWords(outWords))/255.0;
 }`;
}
export const LINEAR_LERP_SHADER = `uniform float opacity;uniform sampler2D input3;${linearShaderControls("input3")}
void main(){uint k=(stored(texture(coverage,uv)).a*(uint(floor(clamp(opacity,0.0,1.0)*255.0+0.5))+1u))>>8;uvec4 s=linearWords(stored(texture(source,uv))),b=linearWords(stored(texture(backdrop,uv))),words=uvec4(0u);for(int c=0;c<4;c++)words[c]=roundedDivide(s[c]*k+b[c]*(255u-k),255u);pixel=vec4(encodedWords(words))/255.0;}`;
