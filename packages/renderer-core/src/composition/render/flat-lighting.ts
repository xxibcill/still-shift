import { passageError } from "../../passage-diagnostics.ts";
import {
  FLAT_LIGHTING_VERSION,
  decodeLightColor,
  planeNormal,
  type WorldLight,
} from "../evaluate/lighting.ts";
import {
  worldPoint,
  type Matrix4,
  type Point3,
} from "../evaluate/spatial-geometry.ts";

type Vec4 = [number, number, number, number];
export type PackedLight = {
  positionKind: Vec4;
  colorWeight: Vec4;
  directionOuter: Vec4;
  falloffInner: Vec4;
};
export type FlatLighting = {
  version: typeof FLAT_LIGHTING_VERSION;
  x: Point3;
  y: Point3;
  normal: Point3;
  lights: PackedLight[];
};

/** Receiver-relative world positions avoid cancellation of large absolute coordinates on GPU. */
export function prepareFlatLighting(
  world: Matrix4,
  origin: [number, number],
  lights: readonly WorldLight[],
): FlatLighting {
  const at = worldPoint(world, [origin[0], origin[1], 0]);
  return {
    version: FLAT_LIGHTING_VERSION,
    x: [world[0], world[1], world[2]],
    y: [world[4], world[5], world[6]],
    normal: planeNormal(world),
    lights: lights.map((light) => ({
      positionKind: [
        light.position[0] - at[0],
        light.position[1] - at[1],
        light.position[2] - at[2],
        light.type === "ambient" ? 0 : light.type === "point" ? 1 : 2,
      ],
      colorWeight: [
        decodeLightColor(light.color[0]),
        decodeLightColor(light.color[1]),
        decodeLightColor(light.color[2]),
        light.intensity * light.color[3],
      ],
      directionOuter: [
        ...light.direction,
        Math.cos((light.outerCone * Math.PI) / 360),
      ],
      falloffInner: [
        light.falloffStart,
        light.range,
        Math.cos((light.innerCone * Math.PI) / 360),
        0,
      ],
    })),
  };
}

export function validateFlatLighting(
  lighting: FlatLighting,
  node: string,
  width = 1,
  height = 1,
) {
  if (
    lighting.version !== FLAT_LIGHTING_VERSION ||
    !lighting.lights.length ||
    lighting.lights.length > 8
  )
    passageError(
      "comp-light-settings",
      "Lighting requires the supported model and one to eight active scoped lights",
      { node },
    );
  const values = [
    ...lighting.x,
    ...lighting.y,
    ...lighting.normal,
    ...[0, 1, 2].flatMap((axis) => [
      lighting.x[axis]! * width,
      lighting.y[axis]! * height,
      lighting.x[axis]! * width + lighting.y[axis]! * height,
    ]),
    ...lighting.lights.flatMap((light) => [
      ...light.positionKind,
      ...light.colorWeight,
      ...light.directionOuter,
      ...light.falloffInner,
    ]),
  ];
  if (!values.every((value) => Number.isFinite(Math.fround(value))))
    passageError(
      "comp-light-settings",
      "World lighting coefficients exceed finite WebGL2 precision",
      { node },
    );
}

export function flatLightingUniforms(
  lighting: FlatLighting,
): Record<string, number | readonly number[]> {
  const uniforms: Record<string, number | readonly number[]> = {
    worldX: lighting.x,
    worldY: lighting.y,
    planeNormal: lighting.normal,
    lightCount: lighting.lights.length,
  };
  lighting.lights.forEach((light, index) => {
    uniforms[`lightPosition${index}`] = light.positionKind;
    uniforms[`lightColor${index}`] = light.colorWeight;
    uniforms[`lightDirection${index}`] = light.directionOuter;
    uniforms[`lightFalloff${index}`] = light.falloffInner;
  });
  return uniforms;
}

const declarations = Array.from(
  { length: 8 },
  (_, i) =>
    `uniform vec4 lightPosition${i}, lightColor${i}, lightDirection${i}, lightFalloff${i};`,
).join("\n");
const contributions = Array.from(
  { length: 8 },
  (_, i) =>
    `if (lightCount > ${i}.5) illumination += contribution(lightPosition${i},lightColor${i},lightDirection${i},lightFalloff${i}, offset);`,
).join("\n");
export const FLAT_LIGHTING_SHADER = `
uniform vec3 worldX, worldY, planeNormal;
uniform float lightCount;
${declarations}
vec3 decode(vec3 v) { return mix(pow((v+0.055)/1.055,vec3(2.4)),v/12.92,lessThanEqual(v,vec3(0.04045))); }
vec3 encode(vec3 v) { return mix(1.055*pow(v,vec3(1.0/2.4))-0.055,12.92*v,lessThanEqual(v,vec3(0.0031308))); }
float edge(float lo,float hi,float v) {
  if (hi == lo) return step(hi,v);
  float t=clamp((v-lo)/(hi-lo),0.0,1.0); return t*t*(3.0-2.0*t);
}
vec3 contribution(vec4 position,vec4 color,vec4 direction,vec4 falloff,vec3 offset) {
  float weight=color.a;
  if(position.w > 0.5) {
    vec3 delta=position.xyz-offset;
    // Bound each component before length: distant lights must not overflow normalization.
    if(any(greaterThanEqual(abs(delta),vec3(falloff.y)))) return vec3(0.0);
    float distance=length(delta);
    if(distance >= falloff.y) return vec3(0.0);
    vec3 toward=distance > 1e-12 ? delta/distance : planeNormal;
    weight *= abs(dot(planeNormal,toward)) * (1.0-edge(falloff.x,falloff.y,distance));
    if(position.w > 1.5 && distance > 1e-12)
      weight *= edge(direction.w,falloff.z,-dot(direction.xyz,toward));
  }
  return color.rgb*weight;
}
void main() {
  vec4 sourcePixel=bytes(texture(source,uv));
  if(sourcePixel.a == 0.0) { pixel=vec4(0.0); return; }
  vec3 offset=worldX*gl_FragCoord.x+worldY*gl_FragCoord.y;
  vec3 illumination=vec3(0.0);
  ${contributions}
  vec3 straight=clamp(sourcePixel.rgb/sourcePixel.a,0.0,1.0);
  pixel=vec4(bytes(vec4(encode(clamp(decode(straight)*illumination,0.0,1.0))*sourcePixel.a,sourcePixel.a)).rgb,sourcePixel.a);
}`;
