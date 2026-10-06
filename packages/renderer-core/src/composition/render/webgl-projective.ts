import type { Homography } from "../evaluate/spatial-geometry.ts";
import type { ProjectivePlacement } from "./projective-placement.ts";
export const homographyUniform = (m: Homography) => [
  m[0],
  m[3],
  m[6],
  m[1],
  m[4],
  m[7],
  m[2],
  m[5],
  m[8],
];
const POSITION = `uniform mat3 inverseProjection;
uniform vec2 size;
uniform vec3 planeDepth;
uniform vec2 depthRange;
uniform float clipsDepth;
bool localPoint(vec2 screen,out vec2 point) {
  vec3 h=inverseProjection*vec3(screen,1.0);
  if(abs(h.z)<1e-12) return false;
  point=h.xy/h.z;
  float depth=dot(planeDepth,vec3(point,1.0));
  return all(greaterThanEqual(point,vec2(0.0)))&&all(lessThan(point,size))&&(clipsDepth==0.0||(depth>=depthRange.x&&depth<=depthRange.y));
}`;
/** Four fixed quarter-pixel samples; RGBA8 premultiplied bilinear weights quantized to 1/16; a 1e-4 quantizer-unit tie bias bounds float32 boundary drift. */
export const PROJECTIVE_SHADER =
  POSITION +
  `
vec4 colorAt(vec2 point) {return floor(texture(source,point/size)*255.0+0.5);}
vec4 sampleAt(vec2 screen) {
  vec2 point;
  if(!localPoint(screen,point)) return vec4(0.0);
  vec2 base=floor(point-0.5),weight=min(floor(fract(point-0.5)*16.0+0.0001),vec2(15.0))/16.0;
  vec2 lo=clamp(base+0.5,vec2(0.5),size-0.5),hi=clamp(base+1.5,vec2(0.5),size-0.5);
  vec4 top=mix(colorAt(lo),colorAt(vec2(hi.x,lo.y)),weight.x);
  vec4 bottom=mix(colorAt(vec2(lo.x,hi.y)),colorAt(hi),weight.x);
  return floor(mix(top,bottom,weight.y));
}
void main() {
  vec2 p=gl_FragCoord.xy;
  pixel=floor((sampleAt(p+vec2(-0.25,-0.25))+sampleAt(p+vec2(0.25,-0.25))+sampleAt(p+vec2(-0.25,0.25))+sampleAt(p+vec2(0.25,0.25)))/4.0+0.5)/255.0;
}`;
export const PROJECTIVE_CLIP_SHADER =
  POSITION +
  `
float covered(vec2 p) {vec2 point;return localPoint(p,point) ? 1.0 : 0.0;}
void main() {
  vec2 p=gl_FragCoord.xy;
  float a=(covered(p+vec2(-0.25,-0.25))+covered(p+vec2(0.25,-0.25))+covered(p+vec2(-0.25,0.25))+covered(p+vec2(0.25,0.25)))/4.0;
  pixel=bytes(texture(source,uv)*a);
}`;
export function projectionUniforms(
  placement: ProjectivePlacement,
  width: number,
  height: number,
) {
  return {
    inverseProjection: homographyUniform(placement.inverse),
    size: [width, height],
    planeDepth: placement.depth ?? [0, 0, 1],
    depthRange: [placement.nearClip ?? 0, placement.farClip ?? 1],
    clipsDepth: placement.depth ? 1 : 0,
  };
}
