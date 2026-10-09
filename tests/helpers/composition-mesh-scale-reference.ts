import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type {
  Composition,
  CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";

type Kind = "distort.mesh-warp" | "distort.puppet";
export function smallScaleComposition(
  kind?: Kind,
  pinned = false,
): Composition {
  return {
    schemaVersion: "composition-1",
    id: "small-scale-mesh",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 4,
    background: null,
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        color: "#aa5522",
        size: [16, 16],
        transform: {
          anchor: [0, 0],
          position: [8, 8],
          scale: {
            keys: [
              { frame: 0, value: [1, 1] },
              { frame: 1, value: [1e-6, 1e-6] },
              { frame: 2, value: [1e-7, 1e-7] },
              { frame: 3, value: [1, 1] },
            ],
          },
        },
        ...(kind
          ? {
              effects: [
                {
                  id: "mesh",
                  effect: kind,
                  params:
                    kind === "distort.mesh-warp"
                      ? { size: [16, 16] }
                      : pinned
                        ? { rest: [[8, 8]], pins: [[8, 8]] }
                        : {},
                },
              ],
            }
          : {}),
      },
    ],
  };
}

/** Identity meshes must preserve ordinary pixels, including invisible tiny frames. */
export function checkSmallScaleMeshes() {
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const kind of ["distort.mesh-warp", "distort.puppet"] as const)
      for (const reflected of [false, true])
        for (const pinned of kind === "distort.puppet"
          ? [false, true]
          : [false]) {
          const comp = smallScaleComposition(kind, pinned);
          if (reflected) {
            const keys = (
              comp.layers[0]!.transform!.scale as {
                keys: { frame: number; value: [number, number] }[];
              }
            ).keys;
            for (const key of keys) key.value[0] *= -1;
            comp.layers[0]!.transform!.position = [24, 8];
          }
          const ordinary = structuredClone(comp);
          delete ordinary.layers[0]!.effects;
          check(comp, ordinary, backend, `${kind}/${reflected}`);
          reports.push({ backend, kind, reflected, pinned, frames: 7 });
        }
  // A tiny or large external coordinate space can still deform visible owner pixels.
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const scale of [1e-7, -1e-7, 1e6, -1e6]) {
      const ordinary = smallScaleComposition();
      const art = ordinary.layers[0]!;
      if (art.type !== "solid") throw Error("Expected solid scale fixture");
      art.size = [1, 1];
      art.transform!.scale = [1, 1];
      const parent: CompositionLayer = {
        id: "parent-space",
        type: "null",
        transform: { anchor: [0, 0], scale: [scale > 0 ? 1000 : -1000, 1000] },
      };
      const space: CompositionLayer = {
        id: "space",
        type: "null",
        ...(Math.abs(scale) > 1000 ? { parent: "parent-space" } : {}),
        transform: {
          anchor: [0, 0],
          scale:
            Math.abs(scale) > 1000 ? [1000, 1000] : [scale, Math.abs(scale)],
        },
      };
      ordinary.layers.unshift(parent, space);
      const comp = structuredClone(ordinary);
      comp.layers[2]!.effects = [
        {
          id: "mesh",
          effect: "distort.puppet",
          space: "space",
          params: { refinement: 3 },
        },
      ];
      check(comp, ordinary, backend, `external/${scale}`);
      reports.push({ backend, kind: "external-space", scale, frames: 7 });
    }
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const comp = smallScaleComposition("distort.puppet");
    comp.layers[0]!.effects![0]!.params = {
      rest: [[100, 100]],
      pins: [[100, 100]],
    };
    const preview = createCompositionPreview(
      document.createElement("canvas"),
      comp,
      { images: new Map(), fonts: new Map() },
      { backend, preserveAlpha: true },
    );
    try {
      preview.renderFrame(2);
      if (preview.readPixels().some((value) => value !== 0))
        throw Error("Empty puppet frame must remain transparent");
      let rejected = false;
      try {
        preview.renderFrame(0);
      } catch (error) {
        rejected = String(error).includes("comp-mesh-pin");
      }
      if (!rejected)
        throw Error("Visible recovery must restore pin validation");
      reports.push({ backend, kind: "pin-validation-recovery", frames: 1 });
    } finally {
      preview.dispose();
    }
  }
  return reports;
}
function check(
  comp: Composition,
  ordinary: Composition,
  backend: "canvas2d" | "webgl2",
  name: string,
) {
  const previews = [ordinary, comp].map((doc) =>
    createCompositionPreview(
      document.createElement("canvas"),
      doc,
      { images: new Map(), fonts: new Map() },
      { backend, preserveAlpha: true },
    ),
  );
  try {
    for (const frame of [0, 1, 2, 3, 2, 0, 1]) {
      for (const preview of previews) preview.renderFrame(frame);
      const expected = previews[0]!.readPixels(),
        actual = previews[1]!.readPixels();
      if (actual.some((value, i) => value !== expected[i]))
        throw Error(`Small-scale mesh differs: ${backend}/${name}/${frame}`);
    }
  } finally {
    for (const preview of previews) preview.dispose();
  }
}
