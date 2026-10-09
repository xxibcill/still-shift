import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import {
  validateComposition,
  type Composition,
  type CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";

/** Compare undeformed meshes with independently painted ordinary artwork. */
export function checkMeshRasterDegeneracy() {
  const source = document.createElement("canvas");
  source.width = source.height = 100;
  const ctx = source.getContext("2d")!;
  ctx.fillStyle = "#a05020";
  ctx.fillRect(0, 0, 100, 100);
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "raster-degeneracy",
    width: 256,
    height: 256,
    fps: 24,
    frameCount: 3,
    background: null,
    assets: [
      {
        id: "art",
        type: "image",
        path: "art.png",
        width: 100,
        height: 100,
        sha256: `sha256:${"0".repeat(64)}`,
      },
    ],
    layers: [],
  };
  const cases: {
    name: string;
    transform: CompositionLayer["transform"];
    effect: NonNullable<CompositionLayer["effects"]>[number];
  }[] = [
    {
      name: "scaled-bezier",
      transform: {
        anchor: [0, 0],
        position: [50, 50],
        scale: {
          keys: [
            { frame: 0, value: [0.01, 0.01] },
            { frame: 1, value: [0.05, 0.05] },
            { frame: 2, value: [1, 1] },
          ],
        },
      },
      effect: {
        id: "mesh",
        effect: "distort.mesh-warp",
        params: { size: [100, 100] },
      },
    },
    {
      name: "near-edge-puppet",
      transform: { anchor: [0, 0], position: [50, 50] },
      effect: {
        id: "mesh",
        effect: "distort.puppet",
        params: { rest: [[0.02, 50]], pins: [[0.02, 50]] },
      },
    },
    {
      name: "rotated-boundary-puppet",
      transform: {
        anchor: [50, 50],
        position: [90, 90],
        rotation: {
          keys: [
            { frame: 0, value: 1 },
            { frame: 1, value: 2 },
            { frame: 2, value: 12 },
          ],
        },
      },
      effect: {
        id: "mesh",
        effect: "distort.puppet",
        params: {
          rest: [
            [0, 50],
            [50, 50],
            [100, 50],
          ],
          pins: [
            [0, 50],
            [50, 50],
            [100, 50],
          ],
        },
      },
    },
  ];
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const item of cases) {
      const layer: CompositionLayer = {
        id: "art",
        type: "image",
        sources: [{ asset: "art" }],
        size: [100, 100],
        fit: "stretch",
        transform: item.transform,
      };
      const ordinary = { ...comp, layers: [layer] };
      const deformed = {
        ...comp,
        layers: [{ ...layer, effects: [item.effect] }],
      };
      if (!validateComposition(deformed).ok)
        throw Error(`Invalid raster fixture: ${item.name}`);
      const assets = { images: new Map([["art", source]]), fonts: new Map() };
      const expected = createCompositionPreview(
        document.createElement("canvas"),
        ordinary,
        assets,
        { backend, preserveAlpha: true },
      );
      const actual = createCompositionPreview(
        document.createElement("canvas"),
        deformed,
        assets,
        { backend, preserveAlpha: true },
      );
      const frames: ReturnType<typeof actual.readPixels>[] = [];
      let maxDelta = 0;
      try {
        for (let frame = 0; frame < comp.frameCount; frame++) {
          expected.renderFrame(frame);
          actual.renderFrame(frame);
          const reference = expected.readPixels(),
            pixels = actual.readPixels().slice();
          for (let i = 0; i < pixels.length; i++)
            maxDelta = Math.max(maxDelta, Math.abs(pixels[i]! - reference[i]!));
          if (maxDelta > 0)
            throw Error(
              `Raster identity changed: ${backend}/${item.name}/${frame}, delta=${maxDelta}`,
            );
          frames.push(pixels);
        }
        for (const frame of [2, 0, 1, 0]) {
          actual.renderFrame(frame);
          if (
            actual.readPixels().some((value, i) => value !== frames[frame]![i])
          )
            throw Error(
              `Raster seek changed: ${backend}/${item.name}/${frame}`,
            );
        }
        reports.push({
          backend,
          name: item.name,
          frames: frames.length,
          maxDelta,
        });
      } finally {
        actual.dispose();
        expected.dispose();
      }
    }
  return reports;
}
