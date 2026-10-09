import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type {
  Composition,
  CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";

type MeshKind = "distort.mesh-warp" | "distort.puppet";

/** Each mesh translates the incoming art; the complete stack cancels exactly. */
export function stackedMeshComposition(
  kinds: MeshKind[],
  deltas: number[],
  group = false,
  scope = false,
): Composition {
  const y = group ? 8 : 0;
  let offset = 0;
  const effects: NonNullable<CompositionLayer["effects"]> = kinds.map(
    (kind, i) => {
      const origin = offset;
      const move = deltas[i]!;
      offset += move;
      return {
        id: `mesh-${i}`,
        effect: kind,
        params:
          kind === "distort.mesh-warp"
            ? {
                origin: [origin, y],
                size: [16, 16],
                subdivisions: 1,
                controls: [
                  [move / 16, 0],
                  [move / 16 + 1, 0],
                  [move / 16, 1],
                  [move / 16 + 1, 1],
                ],
              }
            : {
                rest: [[8 + origin, 8 + y]],
                pins: [[8 + origin + move, 8 + y]],
                refinement: 0,
              },
      };
    },
  );
  if (scope)
    effects.splice(1, 0, {
      id: "viewport-clear",
      effect: "transition.linear-wipe",
      params: { progress: 1 },
    });
  // A disabled trailing mesh must not expand the capture or become its last mesh.
  effects.push({
    id: "disabled",
    effect: "distort.puppet",
    enabled: false,
    params: { rest: [[8, 8]], pins: [[10008, 8]] },
  });
  const art: CompositionLayer = {
    id: "art",
    type: "solid",
    color: "#aa5522",
    size: [16, 16],
    transform: { anchor: [0, 0], position: [0, 8] },
  };
  return {
    schemaVersion: "composition-1",
    id: "stacked-mesh",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 4,
    background: null,
    assets: [],
    layers: group
      ? [
          {
            id: "owner",
            type: "group",
            size: [16, 24],
            transform: { anchor: [0, 0] },
            effects,
          },
          { ...art, parent: "owner" },
        ]
      : [{ ...art, effects }],
  };
}

/** Compare every byte against the ordinary artwork, independently of mesh math. */
export function checkStackedMeshes() {
  const reports = [];
  const render = (comp: Composition, backend: "canvas2d" | "webgl2") => {
    const preview = createCompositionPreview(
      document.createElement("canvas"),
      comp,
      { images: new Map(), fonts: new Map() },
      { backend, preserveAlpha: true },
    );
    try {
      preview.renderFrame(0);
      const pixels = preview.readPixels().slice();
      for (const frame of [3, 1, 0]) {
        preview.renderFrame(frame);
        if (preview.readPixels().some((value, i) => value !== pixels[i]))
          throw Error(`Stacked mesh seek differs: ${backend}/${frame}`);
      }
      return pixels;
    } finally {
      preview.dispose();
    }
  };
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const group of [false, true])
      for (const delta of [-32, 32])
        for (const first of ["distort.mesh-warp", "distort.puppet"] as const)
          for (const second of ["distort.mesh-warp", "distort.puppet"] as const)
            for (const scope of [false, true])
              for (const three of [false, true]) {
                const comp = stackedMeshComposition(
                  three ? [first, second, first] : [first, second],
                  three ? [delta, delta, -2 * delta] : [delta, -delta],
                  group,
                  scope,
                );
                const ordinary = structuredClone(comp);
                delete ordinary.layers[0]!.effects;
                const expected = render(ordinary, backend);
                const actual = render(comp, backend);
                if (actual.some((value, i) => value !== expected[i]))
                  throw Error(
                    `Stacked mesh differs: ${backend}/${group}/${delta}/${first}/${second}/${scope}/${three}`,
                  );
                reports.push({
                  backend,
                  group,
                  delta,
                  first,
                  second,
                  scope,
                  three,
                });
              }
  return reports;
}
