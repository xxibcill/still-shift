import { MESH_DIAGNOSTIC_LOCATION } from "../../packages/renderer-core/src/composition/mesh/diagnostics.ts";
import { expect, it } from "vitest";
import type { Composition } from "@still-shift/scene-contract";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { meshFrame } from "../../packages/renderer-core/src/composition/mesh/frame.ts";
import { alphaMesh } from "../../packages/renderer-core/src/composition/mesh/topology.ts";
import { rigidMlsPoint } from "../../packages/renderer-core/src/composition/mesh/geometry.ts";

function diagnostics(operation: () => unknown) {
  try {
    operation();
    throw Error("Expected mesh failure");
  } catch (error) {
    return passageDiagnostics(error);
  }
}
const puppet = {
  rest: [[10, 10]],
  pins: [[10, 10]],
  starchCenters: [],
  starch: [],
  overlapCenters: [],
  overlap: [],
  alphaThreshold: 1,
  refinement: 0,
};
it("returns a structured pin code with the exact invalid rest-pin path", () => {
  const result = diagnostics(() =>
    meshFrame("distort.puppet", puppet, 4, 4, new Uint8Array(64).fill(255)),
  );
  expect(result[0]).toMatchObject({
    code: "comp-mesh-pin",
    severity: "error",
    path: "rest.0",
  });
});
it("retains mesh solver and topology budget diagnostic codes", () => {
  expect(
    diagnostics(() =>
      rigidMlsPoint(
        [2, 2],
        [
          { rest: [0, 0], target: [0, 0] },
          { rest: [4, 0], target: [0, 0] },
        ],
      ),
    )[0],
  ).toMatchObject({ code: "comp-mesh-solver", path: "pins" });
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++)
      if ((x + y) % 2 === 0) pixels[(y * 256 + x) * 4 + 3] = 255;
  expect(diagnostics(() => alphaMesh(pixels, 256, 256, {}))[0]).toMatchObject({
    code: "comp-mesh-budget",
    severity: "error",
  });
});

it("keeps diagnostic frame changes out of both visual cache keys", async () => {
  const { buildRenderGraph } = await import(
    "../../packages/renderer-core/src/composition/render/graph.ts"
  );
  const { evaluateComp } = await import("@still-shift/renderer-core");
  const { compositionSurfaceVisualKey } = await import(
    "../../packages/renderer-core/src/composition/render/surface-cache.ts"
  );
  const { WebglVisualKey } = await import(
    "../../packages/renderer-core/src/composition/render/webgl-visual-key.ts"
  );
  const comp = {
    schemaVersion: "composition-1",
    id: "static-mesh",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 3,
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        size: [4, 4],
        color: "#ffffff",
        transform: { anchor: [0, 0] },
        effects: [{ id: "mesh", effect: "distort.puppet", params: {} }],
      },
    ],
  } satisfies Composition;
  const graphs = [0, 2].map((frame) =>
    buildRenderGraph(comp, evaluateComp(comp, frame)),
  );
  const effects = graphs.map((graph) => {
    const op = graph.root.ops[0]!;
    if (op.kind !== "isolate") throw Error("Expected isolated mesh");
    return op.effects;
  });
  expect(effects[0]![0]![MESH_DIAGNOSTIC_LOCATION]!.frame).toBe(0);
  expect(effects[1]![0]![MESH_DIAGNOSTIC_LOCATION]!.frame).toBe(2);
  expect(compositionSurfaceVisualKey(effects[0])).toBe(
    compositionSurfaceVisualKey(effects[1]),
  );
  const keys = new WebglVisualKey();
  try {
    expect(keys.of(effects[0])).toBe(keys.of(effects[1]));
  } finally {
    keys.dispose();
  }
});
