import { expect, it, vi } from "vitest";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  executeGraph,
  type RenderBackend,
} from "../../packages/renderer-core/src/composition/render/backend.ts";

const image = (
  fields: Partial<Extract<CompositionLayer, { type: "image" }>> = {},
): CompositionLayer => ({
  id: "art",
  type: "image",
  threeD: true,
  size: [20, 10],
  sources: [{ asset: "image" }],
  rasterize: "natural-size",
  fit: "stretch",
  ...fields,
});
const scene = (layers: CompositionLayer[]): Composition => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 80,
  fps: 24,
  frameCount: 24,
  layers,
  assets: [
    {
      id: "image",
      type: "image",
      path: "image.png",
      sha256: `sha256:${"a".repeat(64)}`,
      width: 20,
      height: 10,
    },
  ],
});
const graph = (doc: Composition) => buildRenderGraph(doc, evaluateComp(doc, 0));

it("draws eligible affine bitmap planes once while retaining projection preflight", () => {
  const result = graph(scene([image()]));
  expect(result.spatial).toBe(true);
  const draw = result.root.ops[0]!;
  expect(draw.kind).toBe("draw");
  if (draw.kind !== "draw") throw Error("draw missing");
  expect(draw.projection?.affineMatrix).toEqual(draw.matrix);
  const clear = vi.fn(),
    beginFrame = vi.fn();
  draw.projection!.homography[0] = 1e100;
  expect(() =>
    executeGraph({ clear, beginFrame } as unknown as RenderBackend, result, {
      width: 100,
      height: 80,
    }),
  ).toThrow(/precision/);
  expect(clear).not.toHaveBeenCalled();
  expect(beginFrame).not.toHaveBeenCalled();
});

it.each([
  image({ rasterize: "draw" }),
  image({ transform: { rotationY: 30 } }),
  image({
    effects: [{ id: "blur", effect: "blur.gaussian", params: { radius: 2 } }],
  }),
  image({
    masks: [
      {
        id: "crop",
        mode: "add",
        path: {
          vertices: [
            [0, 0],
            [20, 0],
            [20, 10],
          ],
          closed: true,
        },
      },
    ],
  }),
])(
  "retains local surfaces when raster/effect/mask/perspective semantics require them",
  (layer) => {
    expect(graph(scene([layer])).root.ops[0]!.kind).toBe("project");
  },
);

it("keeps active lighting and lens focus on their established projection paths", () => {
  expect(
    graph(
      scene([
        { id: "light", type: "light", lightType: "ambient" },
        image({ receivesLight: true }),
      ]),
    ).root.ops[0]!.kind,
  ).toBe("project");
  const doc = scene([
    {
      id: "camera",
      type: "camera",
      depthOfField: true,
      focusDistance: 200,
      aperture: 10,
    },
    image(),
  ]);
  expect(graph(doc).root.ops[0]!.kind).toBe("project");
});

it("preserves Gaussian focus overscan and matte/opacity/blend isolation", () => {
  const doc = scene([
    {
      id: "camera",
      type: "camera",
      depthOfField: true,
      focusDistance: 200,
      aperture: 10,
      blurModel: "gaussian",
      maxBlur: 4,
    },
    { id: "matte", type: "solid", size: [20, 10], color: "#ffffff" },
    image({
      blendMode: "multiply",
      transform: { opacity: 0.5 },
      trackMatte: { layer: "matte", mode: "alpha" },
    }),
  ]);
  const isolate = graph(doc).root.ops[0]!;
  expect(isolate).toMatchObject({
    kind: "isolate",
    opacity: 0.5,
    blend: "multiply",
    matte: { layer: "matte" },
  });
  if (isolate.kind !== "isolate") throw Error("isolate missing");
  expect(isolate.ops[0]).toMatchObject({
    kind: "draw",
    paintBlur: 4,
    opacity: 1,
    content: { clip: false },
  });
});

it("retains three-sigma overscan for Gaussian focus on general projected content", () => {
  const doc = scene([
    {
      id: "camera",
      type: "camera",
      depthOfField: true,
      focusDistance: 200,
      aperture: 10,
      blurModel: "gaussian",
      maxBlur: 4,
    },
    {
      id: "solid",
      type: "solid",
      threeD: true,
      size: [20, 10],
      color: "#ffffff",
    },
  ]);
  expect(graph(doc).root.ops[0]).toMatchObject({
    kind: "project",
    focusPadding: 14,
    effects: [{ effect: "blur.gaussian", params: { radius: 4 } }],
  });
});

it.each<[number, number, number]>([
  [2, 2, 1],
  [3, 1, 1],
])(
  "preserves local primitive blur before affine image projection at scale %j",
  (x, y, z) => {
    const result = graph(
      scene([
        image({
          transform: { scale: [x, y, z] },
          effects: [
            {
              id: "primitive",
              effect: "blur.primitive",
              params: { radius: 4 },
            },
          ],
        }),
      ]),
    );
    const projection = result.root.ops[0]!;
    expect(projection.kind).toBe("project");
    if (projection.kind !== "project") throw Error("local projection missing");
    expect(projection.surface.ops[0]).toMatchObject({
      kind: "draw",
      paintBlur: 4,
      content: { type: "image" },
    });
    expect(projection.placement.affineMatrix?.[0]).toBe(x);
    expect(projection.placement.affineMatrix?.[3]).toBe(y);
  },
);

it("preserves inherited primitive blur before affine image projection", () => {
  const result = graph(
    scene([
      {
        id: "parent",
        type: "group",
        size: [100, 80],
        effects: [
          { id: "primitive", effect: "blur.primitive", params: { radius: 4 } },
        ],
      },
      image({ parent: "parent", transform: { scale: [2, 1, 1] } }),
    ]),
  );
  const projection = result.root.ops[0]!;
  expect(projection.kind).toBe("project");
  if (projection.kind !== "project") throw Error("local projection missing");
  expect(projection.surface.ops[0]).toMatchObject({
    kind: "draw",
    paintBlur: 4,
  });
});

it("retains direct affine image drawing only while animated primitive blur is zero", () => {
  const doc = scene([
    image({
      effects: [
        {
          id: "primitive",
          effect: "blur.primitive",
          params: {
            radius: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 1, value: 4, interpolation: "hold" },
              ],
            },
          },
        },
      ],
    }),
  ]);
  expect(buildRenderGraph(doc, evaluateComp(doc, 0)).root.ops[0]!.kind).toBe(
    "draw",
  );
  expect(buildRenderGraph(doc, evaluateComp(doc, 1)).root.ops[0]!.kind).toBe(
    "project",
  );
});

it("retains direct affine image drawing for disabled primitive blur", () => {
  const doc = scene([
    image({
      effects: [
        {
          id: "primitive",
          effect: "blur.primitive",
          enabled: false,
          params: { radius: 4 },
        },
      ],
    }),
  ]);
  expect(graph(doc).root.ops[0]!.kind).toBe("draw");
});
