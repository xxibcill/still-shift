import { describe, expect, it } from "vitest";
import {
  FramebufferTexture,
  Mesh,
  MeshBasicMaterial,
  BoxGeometry,
} from "three";
import { WebGLRenderList } from "three/src/renderers/webgl/WebGLRenderLists.js";
import { WebGLProperties } from "three/src/renderers/webgl/WebGLProperties.js";
import type { NativeWorldGraphicArtwork } from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  nativeArtworkCorners,
  createNativeThreeGraphic,
} from "../../packages/renderer-core/src/native3d/three-graphics.ts";
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
function artwork(): NativeWorldGraphicArtwork {
  return {
    layer: "label",
    surface: { id: "label", width: 200, height: 80, background: null, ops: [] },
    localBounds: { left: 0, top: 0, right: 200, bottom: 80 },
    rasterOriginPixels: [0, 0],
    artworkMatrix: [1, 0, 0, 1, 0, 0],
    originPixels: [100, 40],
    pixelsPerUnit: 100,
    worldMatrix: [...identity],
    side: "front",
    opacity: 1,
    alphaMode: "mask",
    alphaCutoff: 0.5,
  };
}
describe("native local artwork storage/placement separation", () => {
  it("keeps a centered 200x80 solid exactly 2x0.8 world units", () => {
    expect(nativeArtworkCorners(artwork())).toEqual([
      -1, 0.4, 0, 1, 0.4, 0, 1, -0.4, 0, -1, -0.4, 0,
    ]);
  });
  it("retains negative local glyph coordinates and never substitutes crop origin for authored origin", () => {
    const value = artwork();
    value.rasterOriginPixels = [-20, -10];
    value.surface = { ...value.surface, width: 50, height: 20 };
    expect(nativeArtworkCorners(value)).toEqual([
      -1.2, 0.5, 0, -0.7, 0.5, 0, -0.7, 0.3, 0, -1.2, 0.3, 0,
    ]);
    value.artworkMatrix = [-1, 0, 0, 1, 0, 0];
    expect(nativeArtworkCorners(value)[0]).toBe(-0.8);
  });
  it("keeps physical opaque meshes before world artwork in the actual Three sort across cold and warm material creation", () => {
    for (const graphicFirst of [true, false]) {
      const texture = new FramebufferTexture(200, 80);
      const makePhysical = () =>
        new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
      const priorPhysical = graphicFirst ? undefined : makePhysical();
      const graphic = createNativeThreeGraphic(artwork(), texture);
      const physical = priorPhysical ?? makePhysical();
      const list = new WebGLRenderList(new WebGLProperties());
      try {
        list.unshift(
          graphic.mesh,
          graphic.mesh.geometry,
          graphic.mesh.material,
          0,
          0,
          null,
        );
        list.unshift(
          physical,
          physical.geometry,
          physical.material,
          0,
          0,
          null,
        );
        // Pinned Three uses its default sorter when runtime arguments are omitted.
        Reflect.apply(list.sort, list, []);
        expect(list.opaque.map((item) => item.object)).toEqual([
          physical,
          graphic.mesh,
        ]);
        expect(graphic.mesh.material.depthTest).toBe(true);
        expect(graphic.mesh.material.depthWrite).toBe(true);
      } finally {
        graphic.dispose();
        texture.dispose();
        physical.geometry.dispose();
        physical.material.dispose();
      }
    }
  });
  it("uses the copied GPU texture directly, top-row UVs and one opacity/cutoff", () => {
    const value = artwork();
    value.opacity = 0.4;
    const texture = new FramebufferTexture(200, 80),
      graphic = createNativeThreeGraphic(value, texture);
    try {
      expect(graphic.mesh.material.uniforms.nativeArtwork!.value).toBe(texture);
      expect(
        Array.from(graphic.mesh.geometry.getAttribute("uv").array),
      ).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
      expect(graphic.mesh.material.uniforms.nativeOpacity!.value).toBe(0.4);
      expect(graphic.mesh.material.depthWrite).toBe(true);
      expect(graphic.mesh.material.transparent).toBe(false);
      expect(graphic.mesh.material.alphaToCoverage).toBe(false);
    } finally {
      graphic.dispose();
      texture.dispose();
    }
  });
});
