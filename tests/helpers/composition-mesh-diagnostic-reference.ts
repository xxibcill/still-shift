import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import type {
  Composition,
  CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";

/** Observe diagnostics from real preview rendering, including a nested scope. */
export function checkMeshDiagnostics() {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "mesh-diagnostics",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 3,
    assets: [],
    layers: [],
  };
  const cases = [
    {
      code: "comp-mesh-pin",
      path: "rest.0",
      effect: "distort.puppet",
      params: { rest: [[10, 10]], pins: [[10, 10]] },
    },
    {
      code: "comp-mesh-flip",
      path: "controls",
      effect: "distort.mesh-warp",
      params: {
        size: [4, 4],
        controls: [
          [0, 0],
          [-1, 0],
          [0, 1],
          [-1, 1],
        ],
      },
    },
    {
      code: "comp-mesh-solver",
      path: "pins",
      effect: "distort.puppet",
      params: {
        rest: [
          [1, 1],
          [3, 1],
        ],
        pins: [
          [2, 2],
          [2, 2],
        ],
      },
    },
  ];
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const nested of [false, true])
      for (const item of cases) {
        const art: CompositionLayer = {
          id: "art",
          type: "solid",
          size: [4, 4],
          color: "#ffffff",
          transform: { anchor: [0, 0] },
          effects: [{ id: "deform", effect: item.effect, params: item.params }],
        };
        const fixture: Composition = nested
          ? {
              ...comp,
              layers: [
                {
                  id: "host",
                  type: "precomp",
                  comp: "child",
                  transform: { anchor: [0, 0] },
                },
              ],
              precomps: [
                {
                  id: "child",
                  width: 32,
                  height: 32,
                  fps: 24,
                  frameCount: 3,
                  layers: [art],
                },
              ],
            }
          : { ...comp, layers: [art] };
        const preview = createCompositionPreview(
          document.createElement("canvas"),
          fixture,
          { images: new Map(), fonts: new Map() },
          { backend },
        );
        try {
          let failed = false;
          try {
            preview.renderFrame(2);
          } catch (error) {
            failed = true;
            const diagnostic = passageDiagnostics(error)[0]!;
            const path = `${nested ? "precomps.0." : ""}layers.0.effects.0.params.${item.path}`;
            if (
              diagnostic.code !== item.code ||
              diagnostic.path !== path ||
              diagnostic.node !== (nested ? "host/art" : "art") ||
              diagnostic.frame !== 2 ||
              diagnostic.severity !== "error"
            )
              throw Error(
                `Mesh diagnostic lost location: ${JSON.stringify(diagnostic)}`,
              );
            reports.push({ backend, nested, diagnostic });
          }
          if (!failed) throw Error(`Expected mesh failure: ${item.code}`);
        } finally {
          preview.dispose();
        }
      }
  return reports;
}
