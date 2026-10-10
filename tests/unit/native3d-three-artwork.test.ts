import { describe, expect, it } from "vitest";
import { FramebufferTexture } from "three";
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
