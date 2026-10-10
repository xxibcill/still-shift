import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  DoubleSide,
  FrontSide,
  NoBlending,
  UniformsLib,
  UniformsUtils,
} from "three";
import type { Texture } from "three";
import type { NativeWorldGraphicArtwork } from "../composition/render/graph.ts";

export const NATIVE_ARTWORK_TRANSFER_GLSL = `
vec3 nativeSrgbToLinear(vec3 c) {
  return mix(c/12.92, pow((c+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));
}`;
/** Surface storage is top-row-first premultiplied encoded RGBA8. */
export function nativeArtworkCorners(
  artwork: NativeWorldGraphicArtwork,
): number[] {
  const [a, b, c, d, tx, ty] = artwork.artworkMatrix;
  const [rx, ry] = artwork.rasterOriginPixels;
  const [ox, oy] = artwork.originPixels;
  const w = artwork.surface.width,
    h = artwork.surface.height;
  return [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].flatMap(([qx, qy]) => {
    const x = rx + qx!,
      y = ry + qy!;
    return [
      (a * x + c * y + tx - ox) / artwork.pixelsPerUnit,
      -(b * x + d * y + ty - oy) / artwork.pixelsPerUnit,
      0,
    ];
  });
}
export function createNativeThreeGraphic(
  artwork: NativeWorldGraphicArtwork,
  texture: Texture,
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(nativeArtworkCorners(artwork), 3),
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  // Counteract the raster Y reversal once. Authored local negative determinants
  // still reverse physical winding; front/double side remains the author's choice.
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  const material = new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      nativeArtwork: { value: texture },
      nativeOpacity: { value: artwork.opacity },
      nativeCutoff: {
        value: artwork.alphaMode === "mask" ? artwork.alphaCutoff : 0,
      },
    },
    vertexShader: `varying vec2 nativeUv;
#include <fog_pars_vertex>
void main(){ nativeUv=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform sampler2D nativeArtwork; uniform float nativeOpacity; uniform float nativeCutoff; varying vec2 nativeUv;
#include <fog_pars_fragment>
${NATIVE_ARTWORK_TRANSFER_GLSL}
void main(){ vec4 encoded=texture2D(nativeArtwork,nativeUv); float alpha=encoded.a*nativeOpacity;
if(alpha<nativeCutoff || alpha<=0.0) discard;
vec3 straight=encoded.a>0.0 ? encoded.rgb/encoded.a : vec3(0.0);
gl_FragColor=vec4(nativeSrgbToLinear(straight),1.0);
#include <fog_fragment>
}`,
    fog: true,
    transparent: false,
    blending: NoBlending,
    depthTest: true,
    depthWrite: true,
    side: artwork.side === "double" ? DoubleSide : FrontSide,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = artwork.layer;
  mesh.matrixAutoUpdate = false;
  mesh.matrix.fromArray(artwork.worldMatrix);
  mesh.frustumCulled = true;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
