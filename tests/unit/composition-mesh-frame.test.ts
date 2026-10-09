import { expect, it } from "vitest";
import { evaluateComp } from "@still-shift/renderer-core";
import {
  validateComposition,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import {
  multiplyMatrix,
  type Matrix,
} from "../../packages/renderer-core/src/node-transform.ts";
import { meshFrame } from "../../packages/renderer-core/src/composition/mesh/frame.ts";
import {
  triangleFlips,
  isCollapsedMeshPlacement,
} from "../../packages/renderer-core/src/composition/mesh/geometry.ts";
import { rasterizeMesh } from "../../packages/renderer-core/src/composition/mesh/raster.ts";

function effect(
  effect: string,
  params: NonNullable<
    NonNullable<CompositionLayer["effects"]>[number]["params"]
  >,
) {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "mesh-frame",
    width: 100,
    height: 100,
    fps: 24,
    frameCount: 1,
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        color: "#ffffff",
        size: [100, 100],
        effects: [{ id: "deform", effect, params }],
      },
    ],
  };
  expect(validateComposition(comp).ok).toBe(true);
  return evaluateComp(comp, 0).layers[0]!.effects[0]!.params;
}

it("renders the minimum identity Bezier size with default tessellation", () => {
  const mesh = meshFrame(
    "distort.mesh-warp",
    effect("distort.mesh-warp", { size: [1, 1] }),
    1,
    1,
  );
  const input = Uint8Array.from([120, 80, 40, 255]);
  const output = new Uint8Array(4);
  rasterizeMesh(mesh, input, output, 1, 1);
  expect(output).toEqual(input);
  expect(triangleFlips(mesh.source, mesh.destination, mesh.indices)).toEqual(
    [],
  );
});

it("preserves an identity puppet with a pin near the alpha edge", () => {
  const input = new Uint8Array(100 * 100 * 4).fill(255);
  const params = effect("distort.puppet", {
    rest: [[0.02, 50]],
    pins: [[0.02, 50]],
  });
  const mesh = meshFrame("distort.puppet", params, 100, 100, input);
  const output = new Uint8Array(input.length);
  rasterizeMesh(mesh, input, output, 100, 100);
  expect(output).toEqual(input);
  expect(triangleFlips(mesh.source, mesh.destination, mesh.indices)).toEqual(
    [],
  );
});

it("still rejects genuine Bezier folds and collapsed deformation", () => {
  for (const controls of [
    [
      [0, 0],
      [-1, 0],
      [0, 1],
      [-1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 0],
      [1, 0],
    ],
  ]) {
    expect(() =>
      meshFrame(
        "distort.mesh-warp",
        effect("distort.mesh-warp", { controls }),
        100,
        100,
      ),
    ).toThrow(/comp-mesh-flip/);
  }
});

it.each(["distort.mesh-warp", "distort.puppet"])(
  "renders collapsed owner placement as empty before %s deformation",
  (id) => {
    const params = effect(
      id,
      id === "distort.puppet"
        ? {
            rest: [
              [20, 20],
              [80, 80],
            ],
            pins: [
              [20, 20],
              [80, 80],
            ],
          }
        : { size: [100, 100] },
    );
    const pixels = new Uint8Array(100 * 100 * 4).fill(255);
    const identity: Matrix = [1, 0, 0, 1, 0, 0];
    for (const owner of [
      [0, 0, 0, 0, 10, 10],
      [0, 0, 0, 1, 10, 10],
      [1, 0, 0, 0, 10, 10],
      [1, 1, 2, 2, 10, 10],
    ] as Matrix[]) {
      for (const reference of [owner, identity]) {
        const input =
          reference === owner ? pixels : new Uint8Array(pixels.length);
        const mesh = meshFrame(
          id,
          params,
          100,
          100,
          input,
          reference,
          isCollapsedMeshPlacement(owner),
          isCollapsedMeshPlacement(reference),
        );
        const output = new Uint8Array(pixels.length).fill(1);
        rasterizeMesh(mesh, input, output, 100, 100);
        expect(output.every((value) => value === 0)).toBe(true);
      }
    }
    const restored = meshFrame(id, params, 100, 100, pixels, identity);
    const output = new Uint8Array(pixels.length);
    rasterizeMesh(restored, pixels, output, 100, 100);
    expect(output).toEqual(pixels);
  },
);

it("keeps tiny nonzero and reflected owners distinct from collapsed mesh placement", () => {
  const params = effect("distort.puppet", {});
  const pixels = new Uint8Array(100 * 100 * 4).fill(255);
  const reference: Matrix = [1, 0, 0, 1, 0, 0];
  for (const owner of [
    [1e-7, 0, 0, 1e-7, 0, 0],
    [-1, 0, 0, 1, 0, 0],
  ] as Matrix[]) {
    const mesh = meshFrame(
      "distort.puppet",
      params,
      100,
      100,
      pixels,
      reference,
      isCollapsedMeshPlacement(owner),
    );
    expect(mesh.indices.length).toBeGreaterThan(0);
  }
});

it.each(["distort.mesh-warp", "distort.puppet"])(
  "preserves visible input from earlier scope effects in an external %s space",
  (id) => {
    const params = effect(
      id,
      id === "distort.puppet" ? {} : { size: [100, 100] },
    );
    const pixels = new Uint8Array(100 * 100 * 4).fill(255);
    const mesh = meshFrame(
      id,
      params,
      100,
      100,
      pixels,
      [1, 0, 0, 1, 0, 0],
      true,
    );
    const output = new Uint8Array(pixels.length);
    rasterizeMesh(mesh, pixels, output, 100, 100);
    expect(output).toEqual(pixels);
  },
);

it("retains zero-scale factor provenance through rounded matrix products", () => {
  const radians = (value: number) => (value * Math.PI) / 180;
  const p = radians(37),
    c = radians(29);
  const parent: Matrix = [0, 0, -Math.sin(p), Math.cos(p), 0, 0];
  const child: Matrix = [
    Math.cos(c),
    Math.sin(c),
    -Math.sin(c),
    Math.cos(c),
    0,
    0,
  ];
  const combined = multiplyMatrix(parent, child);
  expect(combined[0] * combined[3] - combined[1] * combined[2]).not.toBe(0);
  const collapsed = isCollapsedMeshPlacement(combined, [parent, child]);
  expect(collapsed).toBe(true);
  for (const id of ["distort.puppet", "distort.mesh-warp"]) {
    const params = effect(
      id,
      id === "distort.puppet" ? { rest: [[20, 20]], pins: [[20, 20]] } : {},
    );
    const pixels = new Uint8Array(100 * 100 * 4).fill(255);
    const mesh = meshFrame(
      id,
      params,
      100,
      100,
      pixels,
      combined,
      collapsed,
      collapsed,
    );
    const output = new Uint8Array(pixels.length).fill(1);
    rasterizeMesh(mesh, pixels, output, 100, 100);
    expect(output.every((value) => value === 0)).toBe(true);
  }
});

it("renders identity Bezier grids at tiny nonzero placement scales", () => {
  for (const scale of [1e-6, 1e-7])
    for (const direction of [1, -1]) {
      const mesh = meshFrame(
        "distort.mesh-warp",
        effect("distort.mesh-warp", { size: [16, 16] }),
        32,
        32,
        undefined,
        [direction * scale, 0, 0, scale, 8, 8],
      );
      const output = new Uint8Array(32 * 32 * 4).fill(1);
      rasterizeMesh(
        mesh,
        new Uint8Array(output.length).fill(255),
        output,
        32,
        32,
      );
      expect(output.every((value) => value === 0)).toBe(true);
    }
});

it.each([false, true])(
  "renders empty puppet input at tiny scales (pins=%s)",
  (pinned) => {
    const mesh = meshFrame(
      "distort.puppet",
      effect(
        "distort.puppet",
        pinned ? { rest: [[8, 8]], pins: [[8, 8]] } : {},
      ),
      32,
      32,
      new Uint8Array(32 * 32 * 4),
      [1e-7, 0, 0, 1e-7, 8, 8],
    );
    expect(mesh).toEqual({ source: [], destination: [], indices: [] });
  },
);

it("preserves visible identity puppet input in tiny and large external spaces", () => {
  const input = new Uint8Array(32 * 32 * 4);
  input.set([120, 80, 40, 255], (12 * 32 + 12) * 4);
  for (const scale of [1e-7, -1e-7, 1e6, -1e6]) {
    const mesh = meshFrame(
      "distort.puppet",
      effect("distort.puppet", { refinement: 3 }),
      32,
      32,
      input,
      [scale, 0, 0, Math.abs(scale), 8, 8],
    );
    const output = new Uint8Array(input.length);
    rasterizeMesh(mesh, input, output, 32, 32);
    expect(output).toEqual(input);
  }
});

it("rejects authored folds even when tiny placement would hide them", () => {
  expect(() =>
    meshFrame(
      "distort.mesh-warp",
      effect("distort.mesh-warp", {
        size: [16, 16],
        controls: [
          [0, 0],
          [-1, 0],
          [0, 1],
          [-1, 1],
        ],
      }),
      32,
      32,
      undefined,
      [1e-7, 0, 0, 1e-7, 8, 8],
    ),
  ).toThrow(/comp-mesh-flip/);
});

it.each(["distort.mesh-warp", "distort.puppet"])(
  "preserves collapsed reference rejection for a noncollapsed %s owner",
  (kind) => {
    const rotation = (angle: number): Matrix => {
      const radians = (angle * Math.PI) / 180;
      return [
        Math.cos(radians),
        Math.sin(radians),
        -Math.sin(radians),
        Math.cos(radians),
        0,
        0,
      ];
    };
    const rotated = multiplyMatrix(
      multiplyMatrix(rotation(37), [0, 0, 0, 1, 8, 8]),
      rotation(29),
    );
    for (const reference of [
      [0, 0, 0, 0, 8, 8],
      [0, 0, 0, 1, 8, 8],
      rotated,
    ] as Matrix[])
      for (const opaque of [false, true])
        expect(() =>
          meshFrame(
            kind,
            effect(
              kind,
              kind === "distort.mesh-warp" ? { size: [16, 16] } : {},
            ),
            32,
            32,
            new Uint8Array(32 * 32 * 4).fill(opaque ? 255 : 0),
            reference,
            false,
            true,
          ),
        ).toThrow(
          kind === "distort.mesh-warp"
            ? /comp-mesh-flip/
            : /Cannot invert collapsed transform/,
        );
  },
);
