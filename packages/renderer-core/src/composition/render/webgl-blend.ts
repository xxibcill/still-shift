import type { CompositionBlendMode } from "@still-shift/scene-contract";

/** CSS Compositing blend functions operate on unpremultiplied sRGB colors. */
export const BLEND_FUNCTIONS = `
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
float sat(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 clipColor(vec3 c) {
  float l = lum(c), n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + (c - l) * l / (l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l);
  return c;
}
vec3 setLum(vec3 c, float l) { return clipColor(c + l - lum(c)); }
vec3 setSat(vec3 c, float s) {
  float n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b);
  return x > n ? (c - n) * s / (x - n) : vec3(0.0);
}
float dodge(float b, float s) { return b == 0.0 ? 0.0 : s == 1.0 ? 1.0 : min(1.0, b / (1.0-s)); }
float burn(float b, float s) { return b == 1.0 ? 1.0 : s == 0.0 ? 0.0 : 1.0-min(1.0, (1.0-b)/s); }
float soft(float b, float s) {
  float d = b <= 0.25 ? ((16.0*b-12.0)*b+4.0)*b : sqrt(b);
  return s <= 0.5 ? b - (1.0-2.0*s)*b*(1.0-b) : b+(2.0*s-1.0)*(d-b);
}
`;
export const BLEND_MODES: Record<CompositionBlendMode, string> = {
  normal: "s",
  multiply: "b*s",
  screen: "b+s-b*s",
  overlay: "mix(2.0*b*s, 1.0-2.0*(1.0-b)*(1.0-s), step(vec3(0.5), b))",
  darken: "min(b,s)",
  lighten: "max(b,s)",
  "color-dodge": "vec3(dodge(b.r,s.r),dodge(b.g,s.g),dodge(b.b,s.b))",
  "color-burn": "vec3(burn(b.r,s.r),burn(b.g,s.g),burn(b.b,s.b))",
  "hard-light": "mix(2.0*b*s, 1.0-2.0*(1.0-b)*(1.0-s), step(vec3(0.5), s))",
  "soft-light": "vec3(soft(b.r,s.r),soft(b.g,s.g),soft(b.b,s.b))",
  difference: "abs(b-s)",
  exclusion: "b+s-2.0*b*s",
  hue: "setLum(setSat(s,sat(b)),lum(b))",
  saturation: "setLum(setSat(b,sat(s)),lum(b))",
  color: "setLum(s,lum(b))",
  luminosity: "setLum(b,lum(s))",
  add: "s",
};

export function blendShader(mode: CompositionBlendMode, primitive = false) {
  return `${BLEND_FUNCTIONS}
uniform float opacity;
void main() {
  vec4 src = floor(floor(texture(source, uv) * 255.0 + 0.5) * (floor(opacity * 255.0 + 0.5) + 1.0) / 256.0) / 255.0, dst = texture(backdrop, uv);
  ${
    mode === "add"
      ? "pixel = min(vec4(1.0), src + dst);"
      : mode === "normal"
        ? primitive
          ? "pixel = (floor(src*255.0+0.5)+floor(floor(dst*255.0+0.5)*(256.0-floor(src.a*255.0+0.5))/256.0))/255.0;"
          : "pixel = bytes(src + dst * (1.0-src.a));"
        : `
  vec3 s = src.a > 0.0 ? src.rgb / src.a : vec3(0.0);
  vec3 b = dst.a > 0.0 ? dst.rgb / dst.a : vec3(0.0);
  vec3 blended = ${BLEND_MODES[mode]};
  pixel = bytes(vec4(src.rgb*(1.0-dst.a) + dst.rgb*(1.0-src.a) + src.a*dst.a*blended, src.a + dst.a*(1.0-src.a)));`
  }
}`;
}
