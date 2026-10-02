import { describe, expect, it } from "vitest";
import type { Composition } from "@still-shift/scene-contract";
import { validateStoryCompositionCoverage } from "../../packages/renderer-core/src/composition/adapters/story-coverage.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const composition = (): Composition => ({
  schemaVersion: "composition-1",
  id: "covered",
  width: 16,
  height: 16,
  fps: 24,
  frameCount: 4,
  assets: [
    {
      id: "image",
      type: "image",
      path: "image.png",
      sha256: `sha256:${"0".repeat(64)}`,
      width: 8,
      height: 8,
    },
  ],
  layers: [
    {
      id: "cover",
      type: "image",
      size: [16, 16],
      fit: "stretch",
      sources: [{ asset: "image" }],
      transform: { anchor: [0, 0] },
    },
  ],
  metadata: { storyCameraCover: ["cover"] },
});
const pixels = () => ({
  width: 8,
  height: 8,
  data: new Uint8ClampedArray(8 * 8 * 4).fill(255),
});

function diagnostics(comp: Composition, data: ReturnType<typeof pixels>) {
  try {
    validateStoryCompositionCoverage(comp, () => data);
    return [];
  } catch (error) {
    return passageDiagnostics(error);
  }
}

describe("persisted story camera coverage", () => {
  it("accepts opaque covers and reads each asset only once", () => {
    let reads = 0;
    validateStoryCompositionCoverage(composition(), () => {
      reads++;
      return pixels();
    });
    expect(reads).toBe(1);
  });

  it("rejects transparent pixels with the cover, frame and declaration path", () => {
    const data = pixels();
    data.data[(3 * 8 + 3) * 4 + 3] = 0;
    expect(diagnostics(composition(), data)).toContainEqual(
      expect.objectContaining({
        code: "comp-camera-coverage",
        node: "cover",
        frame: 0,
        path: "metadata.storyCameraCover",
      }),
    );
  });

  it("checks later image states", () => {
    const comp = composition();
    const layer = comp.layers[0]!;
    if (layer.type !== "image") throw new Error("expected image");
    comp.assets.push({ ...comp.assets[0]!, id: "transparent" });
    layer.sources.push({ asset: "transparent" });
    layer.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 2, value: 1 },
      ],
    };
    try {
      validateStoryCompositionCoverage(comp, (id) => {
        const data = pixels();
        if (id === "transparent") data.data[3] = 0;
        return data;
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({ code: "comp-camera-coverage", frame: 2 }),
      );
    }
  });

  it("checks only the crop pixels sampled by the viewport", () => {
    const comp = composition();
    const layer = comp.layers[0]!;
    if (layer.type !== "image") throw new Error("expected image");
    layer.sources[0]!.crop = [2, 2, 4, 4];
    const data = pixels();
    data.data[3] = 0;
    expect(diagnostics(comp, data)).toEqual([]);
    data.data[(2 * 8 + 2) * 4 + 3] = 0;
    expect(diagnostics(comp, data)[0]?.code).toBe("comp-camera-coverage");
  });

  it("checks camera motion against source pixels at every frame", () => {
    const comp = composition();
    const layer = comp.layers[0]!;
    layer.cameraDepth = 1;
    if (layer.type !== "image") throw new Error("expected image");
    layer.size = [32, 16];
    comp.camera2d = {
      keys: [
        { frame: 0, x: 8, y: 8, zoom: 1 },
        { frame: 3, x: 24, y: 8, zoom: 1 },
      ],
      easeIn: false,
      easeOut: false,
    };
    const data = pixels();
    data.data[(3 * 8 + 7) * 4 + 3] = 0;
    expect(diagnostics(comp, data)[0]).toMatchObject({
      code: "comp-camera-coverage",
      frame: 3,
    });
  });

  it("rejects missing covers and covers that leave the viewport", () => {
    const comp = composition();
    comp.metadata = { storyCameraCover: ["missing"] };
    expect(diagnostics(comp, pixels())[0]?.code).toBe("comp-camera-coverage");
    comp.metadata = { storyCameraCover: ["cover"] };
    comp.layers[0]!.transform = { anchor: [0, 0], position: [1, 0] };
    expect(diagnostics(comp, pixels())[0]?.code).toBe("comp-camera-coverage");
  });

  it("skips pixel reads when no cover is declared", () => {
    const comp = composition();
    delete comp.metadata;
    validateStoryCompositionCoverage(comp, () => {
      throw new Error("unexpected pixel read");
    });
    comp.metadata = { storyCameraCover: [] };
    validateStoryCompositionCoverage(comp, () => {
      throw new Error("unexpected pixel read");
    });
  });
});
