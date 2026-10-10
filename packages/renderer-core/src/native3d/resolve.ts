/** Explicit coverage resolve matches pinned Three ACES, then encoded sRGB. */
export const NATIVE_DEPTH_RENDERER_VERSION =
  "native-three-aces-hdr-msaa4-1" as const;
export const NATIVE_COVERAGE_RESOLVE_GLSL = `
uniform sampler2D nativeHdr;
uniform float nativeExposure;
uniform vec3 nativeBackground;
uniform bool nativeOpaque;
varying vec2 nativeUv;
vec3 nativeEncodeSrgb(vec3 c) {
  return mix(c*12.92, 1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));
}
vec3 nativeAces(vec3 color) {
  const mat3 inputMatrix=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
  const mat3 outputMatrix=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
  color=inputMatrix*(color*(nativeExposure/0.6));
  color=(color*(color+0.0245786)-0.000090537)/(color*(0.983729*color+0.4329510)+0.238081);
  return clamp(outputMatrix*color,0.0,1.0);
}
void main(){
  vec4 covered=texture2D(nativeHdr,nativeUv);
  float alpha=clamp(covered.a,0.0,1.0);
  vec3 encoded=alpha>0.0 ? nativeEncodeSrgb(nativeAces(covered.rgb/alpha))*alpha : vec3(0.0);
  gl_FragColor=nativeOpaque ? vec4(encoded+nativeBackground*(1.0-alpha),1.0) : vec4(encoded,alpha);
}`;
