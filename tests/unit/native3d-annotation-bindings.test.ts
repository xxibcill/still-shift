import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  NativeScreenBindingSchema,
  validateComposition,
} from "../../packages/scene-contract/src/composition/index.ts";
import {
  prepareNative3DScene,
  prepareCompositionNative3DVersions,
} from "../../packages/renderer-core/src/native3d/prepare.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

const binding = {
  role: "screen-anchor",
  sceneLayer: "world",
  anchor: "face",
  visibilityPolicy: "hide-occluded",
};
const vertices = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
];
const bracketTarget = {
  kind: "path-vertices",
  contentId: "line",
  vertices: [
    { index: 0, anchor: "face", offsetPixels: [0, 12] },
    { index: 1, anchor: "face", offsetPixels: [0, 20] },
    { index: 2, anchor: "second", offsetPixels: [0, 20] },
    { index: 3, anchor: "second", offsetPixels: [0, 12] },
  ],
};
const arrowTarget = {
  kind: "path-arrow",
  contentId: "line",
  headContentId: "head",
  headLengthPixels: 12,
  headWidthPixels: 8,
};
function document(target: unknown, arrow = false, parent = true) {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "comp",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 60,
    assets: [
      {
        id: "solid",
        type: "native3d",
        path: "solid.json",
        sha256: nativeFixtureHash,
        format: "solid-scene-1",
      },
    ],
    layers: [
      ...(parent
        ? [
            {
              id: "label",
              type: "group",
              size: [320, 180],
              transform: {
                position: [12, -7],
                rotation: 18,
                scale: [1.25, 0.8],
              },
              overlayAfter: "world",
            },
          ]
        : []),
      {
        id: "annotation",
        type: "shape",
        ...(parent ? { parent: "label" } : {}),
        overlayAfter: "world",
        native3D: { ...binding, target },
        contents: [
          {
            id: "line",
            type: "path",
            path: {
              closed: false,
              vertices: arrow
                ? [
                    [50, 80],
                    [50, 80],
                  ]
                : vertices,
            },
          },
          ...(arrow
            ? [
                {
                  id: "head",
                  type: "path",
                  path: {
                    closed: true,
                    vertices: [
                      [0, 0],
                      [0, 0],
                      [0, 0],
                    ],
                  },
                },
              ]
            : []),
          { id: "stroke", type: "stroke", color: "#ffffff", width: 1.5 },
        ],
      },
      {
        id: "world",
        type: "native3d",
        asset: "solid",
        sourceStartFrame: 0,
        sourceFps: 30,
        cameraKeys: [
          {
            frame: 0,
            position: [0, 0, 10],
            target: [0, 0, 0],
            fovDegrees: 60,
            easing: "linear",
          },
          {
            frame: 59,
            position: [2, 0, 10],
            target: [0.2, -0.3, 0],
            fovDegrees: 60,
            easing: "linear",
          },
        ],
      },
    ],
  });
}
async function prepared() {
  const source = nativeSolidFixture();
  source.anchors.push({
    id: "second",
    part: "root",
    position: [0.8, 0, 0],
    role: "proof-target",
  });
  return { solid: await prepareNative3DScene(source, nativeFixtureHash) };
}
function evaluated(
  comp: ReturnType<typeof document>,
  time: number,
  table: Awaited<ReturnType<typeof prepared>>,
) {
  return evaluateComp(comp, time, { preparedNative3D: table }).layers.find(
    (layer) => layer.id === "annotation",
  )!;
}
function path(state: ReturnType<typeof evaluated>, id: string) {
  const content = state.contents!.find((entry) => entry.id === id)!;
  if (content.type !== "path") throw Error("Expected path content");
  return content.path.vertices.map((point) =>
    transformPoint(state.screenMatrix, point),
  );
}
describe("native annotation geometry bindings", () => {
  it("admits bounded distinct vertex bindings and rejects duplicate or excessive vertices", () => {
    expect(
      NativeScreenBindingSchema.safeParse({ ...binding, target: bracketTarget })
        .success,
    ).toBe(true);
    expect(
      NativeScreenBindingSchema.safeParse({
        ...binding,
        target: {
          ...bracketTarget,
          vertices: [bracketTarget.vertices[0], bracketTarget.vertices[0]],
        },
      }).success,
    ).toBe(false);
    expect(
      NativeScreenBindingSchema.safeParse({
        ...binding,
        target: {
          ...bracketTarget,
          vertices: Array.from({ length: 33 }, (_, index) => ({
            index,
            anchor: "face",
          })),
        },
      }).success,
    ).toBe(false);
    expect(
      NativeScreenBindingSchema.safeParse({
        ...binding,
        target: {
          ...bracketTarget,
          vertices: [{ index: 256, anchor: "face" }],
        },
      }).success,
    ).toBe(false);
  });
  it("maps every bracket point from current physical anchors through a transformed parent without editing authored geometry", async () => {
    const comp = document(bracketTarget),
      table = await prepared(),
      original = JSON.stringify(comp);
    const forward = new Map<number, number[][]>();
    for (const time of [
      ...Array.from({ length: 60 }, (_, index) => index / 30),
      ...Array.from({ length: 60 }, (_, index) => (59 - index) / 30),
      0.5,
      0,
      1,
    ]) {
      const state = evaluated(comp, time, table),
        points = path(state, "line");
      for (const [index, entry] of bracketTarget.vertices.entries()) {
        const pixel = state.nativeFrame!.anchors[entry.anchor]!.pixel!;
        expect(points[index]![0]).toBeCloseTo(
          pixel[0] + entry.offsetPixels[0]!,
          9,
        );
        expect(points[index]![1]).toBeCloseTo(
          pixel[1] + entry.offsetPixels[1]!,
          9,
        );
      }
      if (forward.has(time)) expect(points).toEqual(forward.get(time));
      else forward.set(time, points);
    }
    expect(forward.get(0)).not.toEqual(forward.get(1));
    expect(JSON.stringify(comp)).toBe(original);
  });
  it("hides an entire bracket when a secondary anchor is occluded, and locates unknown anchors", async () => {
    const table = await prepared(),
      target = { ...bracketTarget, vertices: [{ index: 0, anchor: "behind" }] };
    expect(evaluated(document(target), 0, table).visible).toBe(false);
    expect(() =>
      evaluated(
        document({ ...target, vertices: [{ index: 0, anchor: "missing" }] }),
        0,
        table,
      ),
    ).toThrow(/Unknown physical anchor missing/);
  });
  it("rejects nonexistent vertex indices and curved bound paths before evaluation", () => {
    expect(() =>
      document({ ...bracketTarget, vertices: [{ index: 4, anchor: "face" }] }),
    ).toThrow();
    const comp = document(bracketTarget);
    const line = (
      comp.layers.find((layer) => layer.id === "annotation") as Extract<
        (typeof comp.layers)[number],
        { type: "shape" }
      >
    ).contents[0]!;
    if (line.type !== "path" || "keys" in line.path)
      throw Error("Expected static path");
    line.path.inTangents = [
      [1, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    expect(CompositionSchema.safeParse(comp).success).toBe(false);
  });
  it("orients a screen-space arrowhead toward the current endpoint despite parent scale and rotation", async () => {
    const comp = document(arrowTarget, true),
      table = await prepared(),
      original = JSON.stringify(comp);
    const state = evaluated(comp, 0, table),
      [start, tip] = path(state, "line"),
      head = path(state, "head");
    const pixel = state.nativeFrame!.anchors.face!.pixel!;
    expect(tip![0]).toBeCloseTo(pixel[0], 9);
    expect(tip![1]).toBeCloseTo(pixel[1], 9);
    const dx = tip![0] - start![0],
      dy = tip![1] - start![1],
      length = Math.hypot(dx, dy),
      ux = dx / length,
      uy = dy / length;
    expect(head[0]![0]).toBeCloseTo(tip![0], 9);
    expect(head[0]![1]).toBeCloseTo(tip![1], 9);
    for (const [index, side] of [
      [1, -1],
      [2, 1],
    ]) {
      expect(head[index!]![0]).toBeCloseTo(
        tip![0] - ux * 12 - uy * 4 * side!,
        9,
      );
      expect(head[index!]![1]).toBeCloseTo(
        tip![1] - uy * 12 + ux * 4 * side!,
        9,
      );
    }
    expect(JSON.stringify(comp)).toBe(original);
  });
  it("rejects missing secondary physical anchors during preparation even before their visible interval", async () => {
    const comp = document({
      ...bracketTarget,
      vertices: [{ index: 0, anchor: "missing" }],
    });
    const layer = comp.layers.find((entry) => entry.id === "annotation")!;
    layer.inPoint = 40;
    await expect(
      prepareCompositionNative3DVersions(comp, {
        version: "composition-prepared-native3d-1",
        assets: {
          solid: {
            sourceSha256: nativeFixtureHash,
            source: nativeSolidFixture(),
          },
        },
      }),
    ).rejects.toMatchObject({
      diagnostics: [
        {
          code: "comp-native3d-binding",
          node: "annotation",
          path: "layers.1.native3D.target.vertices.0.anchor",
        },
      ],
    });
  });
  it("clamps secondary offscreen projections to the owning viewport under explicit indicator policy", async () => {
    const comp = document(
      { ...bracketTarget, vertices: [{ index: 0, anchor: "outside" }] },
      false,
      false,
    );
    const layer = comp.layers.find((entry) => entry.id === "annotation")!;
    if (layer.native3D?.role !== "screen-anchor")
      throw Error("Expected screen binding");
    layer.native3D.visibilityPolicy = "offscreen-indicator";
    layer.native3D.insetPixels = 12;
    const state = evaluated(CompositionSchema.parse(comp), 0, await prepared());
    expect(state.visible).toBe(true);
    expect(state.nativeScreenBinding?.indicator).toBe(true);
    expect(path(state, "line")[0]).toEqual([308, 90]);
  });
  it("locates viewport inset failures at the shared policy field rather than a secondary anchor", async () => {
    const comp = document(
      { ...bracketTarget, vertices: [{ index: 0, anchor: "outside" }] },
      false,
      false,
    );
    const layer = comp.layers.find((entry) => entry.id === "annotation")!;
    if (layer.native3D?.role !== "screen-anchor")
      throw Error("Expected screen binding");
    layer.native3D.visibilityPolicy = "offscreen-indicator";
    layer.native3D.insetPixels = 100;

    const table = await prepared();
    try {
      evaluated(CompositionSchema.parse(comp), 0, table);
      throw Error("Expected inset failure");
    } catch (error) {
      expect(error).toMatchObject({
        diagnostics: [
          { node: "annotation", path: "comp/annotation.native3D.insetPixels" },
        ],
      });
    }
  });
  it("rejects a competing writer for either arrow path and derived reads of moving bracket geometry", () => {
    for (const id of ["line", "head"]) {
      const comp = document(arrowTarget, true, false);
      const validation = validateComposition({
        ...comp,
        drivers: [
          {
            target: `annotation.contents[${id}].path`,
            source: `annotation.contents[${id}].path`,
          },
        ],
      });
      expect(validation.ok).toBe(false);
      if (!validation.ok)
        expect(
          validation.diagnostics.some(
            (entry) => entry.code === "comp-native3d-binding",
          ),
        ).toBe(true);
    }
    const comp = document(bracketTarget, false, false);
    const validation = validateComposition({
      ...comp,
      layers: [...comp.layers, { id: "reader", type: "null" }],
      signals: [
        {
          id: "progress",
          keys: [
            { frame: 0, value: 0.5 },
            { frame: 59, value: 0.5 },
          ],
        },
      ],
      constraints: [
        {
          type: "follow-path",
          target: "reader",
          path: "annotation",
          progress: "progress",
        },
      ],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok)
      expect(validation.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "comp-native3d-binding",
          path: "constraints[0].path",
        }),
      );
  });
  it("collapses a zero-length arrow safely and rejects a reused line/head ID", async () => {
    const comp = document(arrowTarget, true, false);
    const layer = comp.layers.find((entry) => entry.id === "annotation")!;
    if (layer.type !== "shape") throw Error("Expected arrow shape");
    const line = layer.contents[0]!;
    if (line.type !== "path" || "keys" in line.path)
      throw Error("Expected straight path");
    line.path.vertices = [
      [160, 90],
      [160, 90],
    ];
    const state = evaluated(CompositionSchema.parse(comp), 0, await prepared());
    expect(path(state, "head")).toEqual([
      [160, 90],
      [160, 90],
      [160, 90],
    ]);
    expect(
      NativeScreenBindingSchema.safeParse({
        ...binding,
        target: { ...arrowTarget, headContentId: "line" },
      }).success,
    ).toBe(false);
  });
});
