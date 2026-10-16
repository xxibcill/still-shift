import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  type CompositionLayer,
} from "../../packages/scene-contract/src/composition/index.ts";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { evaluateCompositionExposure } from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import {
  buildRenderGraph,
  type NativeDepthOp,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import {
  executeGraph,
  type RenderBackend,
  type Surface,
} from "../../packages/renderer-core/src/composition/render/backend.ts";
import { renderCompositionExposure } from "../../packages/renderer-core/src/composition/render/exposure.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

const world: CompositionLayer = {
  id: "world",
  type: "native3d",
  asset: "solid",
  sourceStartFrame: 0,
  sourceFps: 30,
};
const binding = {
  role: "screen-anchor" as const,
  sceneLayer: "world",
  anchor: "face",
  visibilityPolicy: "hide-occluded" as const,
};
const artwork: CompositionLayer = {
  id: "art",
  type: "solid",
  size: [200, 80],
  color: "#ffffff",
  transform: { anchor: [100, 40], scale: [-1, 1], position: [10, 20] },
  native3D: {
    role: "world-graphic",
    sceneLayer: "world",
    transform: {
      position: [0, 0, 1],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      pivot: [0, 0, 0],
    },
    pixelsPerUnit: 100,
    alphaMode: "opaque",
    side: "front",
  },
};
function document(
  layers: CompositionLayer[],
  extra: Record<string, unknown> = {},
) {
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
    layers,
    ...extra,
  });
}
async function prepared() {
  return {
    solid: await prepareNative3DScene(nativeSolidFixture(), nativeFixtureHash),
  };
}
describe("native composition evaluation and joint graph", () => {
  it("uses one snapshot for a moved label group and the real physical leader endpoint before compilation", async () => {
    const comp = document([
      {
        id: "leader",
        type: "shape",
        parent: "label",
        native3D: {
          ...binding,
          target: {
            kind: "path-endpoint",
            contentId: "line",
            endpoint: "last",
          },
        },
        contents: [
          {
            id: "line",
            type: "path",
            path: {
              closed: false,
              vertices: [
                [10, 15],
                [10, 15],
              ],
            },
          },
          { id: "stroke", type: "stroke", color: "#ffffff", width: 2 },
        ],
      },
      {
        id: "label",
        type: "group",
        size: [20, 20],
        transform: { anchor: [0, 0], position: [40, 30] },
        overlayAfter: "world",
        native3D: { ...binding, target: { kind: "visibility" } },
      },
      world,
    ]);
    const table = await prepared(),
      tree = evaluateComp(comp, 4.25, { preparedNative3D: table });
    const controller = tree.layers.find((state) => state.id === "world")!,
      leader = tree.layers.find((state) => state.id === "leader")!;
    expect(leader.nativeFrame).toBe(controller.nativeFrame);
    const path = leader.contents!.find((content) => content.id === "line")!;
    if (path.type !== "path") throw Error("Expected sampled path");
    expect(path.path.vertices[0]).toEqual([10, 15]);
    expect(transformPoint(leader.screenMatrix, path.path.vertices[1]!)).toEqual(
      controller.nativeFrame!.anchors.face!.pixel,
    );
    expect(leader.shapes!.bounds!.right).toBeGreaterThan(10);
    expect(
      (comp.layers[0] as Extract<CompositionLayer, { type: "shape" }>)
        .contents[0],
    ).toMatchObject({
      path: {
        vertices: [
          [10, 15],
          [10, 15],
        ],
      },
    });
    const graph = buildRenderGraph(comp, tree);
    expect(graph.root.ops[0]!.kind).toBe("native-depth");
  });
  it("updates current leader endpoints after camera and static part edits across random seeks and either authored layer order", async () => {
    const source = nativeSolidFixture(),
      moved = {
        partOverrides: {
          root: {
            transform: {
              position: [1, 0, 0] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [1, 1, 1] as [number, number, number],
              pivot: [0, 0, 0] as [number, number, number],
            },
          },
        },
      };
    const table = {
      solid: await prepareNative3DScene(source, nativeFixtureHash, {
        variants: [moved],
      }),
    };
    const leader: CompositionLayer = {
      id: "leader",
      type: "shape",
      overlayAfter: "world",
      native3D: {
        ...binding,
        target: { kind: "path-endpoint", contentId: "line", endpoint: "last" },
      },
      contents: [
        {
          id: "line",
          type: "path",
          path: {
            closed: false,
            vertices: [
              [10, 15],
              [10, 15],
            ],
          },
        },
        { id: "stroke", type: "stroke", color: "#ffffff", width: 2 },
      ],
    };
    const endpoint = (comp: ReturnType<typeof document>, time: number) => {
      const tree = evaluateComp(comp, time, { preparedNative3D: table }),
        state = tree.layers.find((layer) => layer.id === "leader")!;
      const content = state.contents![0]!;
      if (content.type !== "path") throw Error("Expected leader path");
      expect(content.path.vertices[0]).toEqual([10, 15]);
      expect(
        transformPoint(state.screenMatrix, content.path.vertices[1]!),
      ).toEqual(state.nativeFrame!.anchors.face!.pixel);
      expect(
        buildRenderGraph(comp, tree).root.ops.map((op) => op.kind),
      ).toEqual(["native-depth", "draw"]);
      return content.path.vertices[1];
    };
    const original = document([leader, world]),
      before = endpoint(original, 4.25);
    const movedComp = document([{ ...world, ...moved }, leader]),
      after = endpoint(movedComp, 4.25);
    expect(after).not.toEqual(before);
    endpoint(movedComp, 22.75);
    expect(endpoint(movedComp, 4.25)).toEqual(after);
    const cameraComp = document([
      leader,
      { ...world, camera: { ...source.camera, target: [1, 0, 0] } },
    ]);
    expect(endpoint(cameraComp, 4.25)).not.toEqual(before);
  });
  it("crops local artwork without applying its authored pixel matrix inside the raster", async () => {
    const comp = document([world, artwork]),
      table = await prepared();
    const tree = evaluateComp(comp, 2.5, { preparedNative3D: table }),
      graph = buildRenderGraph(comp, tree);
    expect(graph.root.ops).toHaveLength(1);
    const op = graph.root.ops[0] as NativeDepthOp,
      graphic = op.graphics[0]!;
    expect(op.frame).toBe(tree.layers[0]!.nativeFrame);
    expect(graphic.surface.width).toBe(200);
    expect(graphic.surface.height).toBe(80);
    expect(graphic.rasterOriginPixels).toEqual([0, 0]);
    expect(graphic.artworkMatrix).toEqual(tree.layers[1]!.localMatrix);
    expect(
      graphic.artworkMatrix[0] * graphic.artworkMatrix[3] -
        graphic.artworkMatrix[1] * graphic.artworkMatrix[2],
    ).toBe(-1);
    expect(graphic.side).toBe("front");
    expect(graphic.surface.ops[0]).toMatchObject({ kind: "draw", opacity: 1 });
    const draw = graphic.surface.ops[0]!;
    if (draw.kind !== "draw") throw Error("Expected local raster draw");
    expect(transformPoint(draw.matrix, [25, 30])).toEqual([25, 30]);
    expect(graphic.worldMatrix[14]).toBe(1);
  });
  it("retains negative glyph coordinates in a real cropped text raster and refuses missing final bounds", async () => {
    const comp = document([
      world,
      {
        id: "word",
        type: "text",
        text: "Solid",
        fontSize: 24,
        color: "#ffffff",
        native3D: {
          role: "world-graphic",
          sceneLayer: "world",
          transform: {
            position: [0, 0, 1],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            pivot: [0, 0, 0],
          },
          pixelsPerUnit: 100,
          alphaMode: "mask",
        },
      },
    ]);
    const table = await prepared(),
      tree = evaluateComp(comp, 4.5, { preparedNative3D: table });
    expect(() => buildRenderGraph(comp, tree)).toThrow("actual local prepared");
    const graph = buildRenderGraph(comp, tree, {
      nativeArtworkBounds: () => ({
        left: -12.2,
        top: -3.3,
        right: 47.4,
        bottom: 25.1,
      }),
    });
    const graphic = (graph.root.ops[0] as NativeDepthOp).graphics[0]!;
    expect(graphic.rasterOriginPixels).toEqual([-13, -4]);
    expect(graphic.surface.width).toBe(61);
    expect(graphic.surface.height).toBe(30);
    expect(graphic.surface.ops[0]).toMatchObject({
      kind: "draw",
      matrix: [1, 0, 0, 1, 13, 4],
      content: { type: "text", time: 4.5 },
    });
    expect(graphic.originPixels).toEqual([0, 0]);
  });
  it("finds every nested fractional contributing pass without glyph preparation", async () => {
    const comp = document(
      [
        {
          id: "instance",
          type: "precomp",
          comp: "inner",
          transform: { anchor: [0, 0] },
          motionBlur: true,
        },
      ],
      {
        motionBlur: {
          enabled: true,
          samples: 3,
          shutterAngle: 180,
          shutterPhase: 0,
        },
        precomps: [
          {
            id: "inner",
            width: 160,
            height: 90,
            frameCount: 60,
            fps: 24,
            layers: [{ ...world, sourceFps: 30, motionBlur: true }],
          },
        ],
      },
    );
    const table = await prepared(),
      passes = [
        ...compositionNativePasses(comp, 4, {
          preparedNative3D: table,
          nativeObservationRequired: true,
        }),
      ];
    expect(passes).toHaveLength(3);
    expect(passes.map((pass) => pass.sampleFrame)).toEqual([
      4 - 1 / 6,
      4,
      4 + 1 / 6,
    ]);
    for (const pass of passes) {
      expect(pass.frame.scope).toBe("instance");
      expect(pass.width).toBe(160);
      expect(pass.frame.sourceFrame).toBeCloseTo(pass.sampleFrame);
    }
    expect(new Set(passes.map((pass) => pass.frame.frameKey)).size).toBe(3);
    const discovery = buildRenderGraph(
      comp,
      evaluateComp(comp, 4, { preparedNative3D: table }),
      { nativePassDiscovery: true },
    );
    expect(() =>
      executeGraph({} as RenderBackend, discovery, { width: 320, height: 180 }),
    ).toThrow("not an executable");
  });
  it("rejects split native exposure clocks while preserving ordinary center overlays", async () => {
    const comp = document([{ ...world, motionBlur: true }, artwork], {
      motionBlur: {
        enabled: true,
        samples: 3,
        shutterAngle: 180,
        shutterPhase: 0,
      },
    });
    expect(() => [...evaluateCompositionExposure(comp, 4)]).toThrow(
      "Prepare native",
    );
    const table = await prepared();
    expect(() => [
      ...evaluateCompositionExposure(comp, 4, { preparedNative3D: table }),
    ]).toThrow("coupled exposure");
    const splitDescendant = document(
      [
        { ...world, motionBlur: true },
        {
          id: "label-group",
          type: "group",
          size: [20, 20],
          transform: { anchor: [0, 0] },
          motionBlur: true,
          overlayAfter: "world",
          native3D: { ...binding, target: { kind: "visibility" } },
        },
        {
          id: "copy",
          type: "text",
          text: "Value",
          fontSize: 20,
          color: "#ffffff",
          parent: "label-group",
          motionBlur: false,
        },
      ],
      {
        motionBlur: {
          enabled: true,
          samples: 3,
          shutterAngle: 180,
          shutterPhase: 0,
        },
      },
    );
    expect(() => [
      ...evaluateCompositionExposure(splitDescendant, 4, {
        preparedNative3D: table,
      }),
    ]).toThrow("coupled exposure");
    const ordinaryOverlay = document(
      [
        { ...world, motionBlur: true },
        {
          id: "copy",
          type: "text",
          text: "Title",
          fontSize: 20,
          color: "#ffffff",
          motionBlur: false,
        },
      ],
      {
        motionBlur: {
          enabled: true,
          samples: 3,
          shutterAngle: 180,
          shutterPhase: 0,
        },
      },
    );
    expect([
      ...evaluateCompositionExposure(ordinaryOverlay, 4, {
        preparedNative3D: table,
      }),
    ]).toHaveLength(3);
  });
  it("keeps all contributing observed passes despite stationary physical state and identical backend keys", async () => {
    const comp = document([{ ...world, holdFrame: 0, motionBlur: true }], {
        motionBlur: {
          enabled: true,
          samples: 3,
          shutterAngle: 180,
          shutterPhase: 0,
        },
      }),
      table = await prepared();
    const passes: NativeDepthOp[] = [],
      mutations: string[] = [];
    const backend = {
      version: "unit",
      frameKey: () => "same-pixels",
      validateNativeDepth: () => {},
      createSurface: (width: number, height: number) => ({ width, height }),
      releaseSurface: () => {},
      clear: () => {},
      composite: () => {},
      renderNativeDepth: (op: NativeDepthOp) => passes.push(op),
      accumulateExposure: (
        _target: Surface,
        count: number,
        draw: (index: number) => void,
      ) => {
        mutations.push("accumulate");
        for (let index = 0; index < count; index++) draw(index);
      },
    } as unknown as RenderBackend;
    const report = renderCompositionExposure(
      backend,
      { width: 320, height: 180 },
      comp,
      4,
      { preparedNative3D: table, nativeObservationRequired: true },
    );
    expect(report.samples).toBe(3);
    expect(passes.map((pass) => pass.frame.sourceFrame)).toEqual([0, 0, 0]);
    expect(passes.map((pass) => pass.sampleFrame)).toEqual([
      4 - 1 / 6,
      4,
      4 + 1 / 6,
    ]);
    mutations.length = 0;
    expect(() =>
      renderCompositionExposure(
        {
          ...backend,
          validateNativeDepth: (op) => {
            if (op.sampleFrame > 4) throw Error("later sample blocked");
          },
        },
        { width: 320, height: 180 },
        comp,
        4,
        { preparedNative3D: table, nativeObservationRequired: true },
      ),
    ).toThrow("later sample blocked");
    expect(mutations).toEqual([]);
  });
  it("fails effective controller/ancestor placement and opacity rather than ignoring it", async () => {
    const table = await prepared();
    expect(() =>
      evaluateComp(
        document([{ ...world, transform: { position: [1, 0] } }]),
        0,
        { preparedNative3D: table },
      ),
    ).toThrow("identity placement");
    expect(() =>
      evaluateComp(document([{ ...world, transform: { opacity: 0.5 } }]), 0, {
        preparedNative3D: table,
      }),
    ).toThrow("opacity 1");
    expect(() =>
      evaluateComp(
        document([
          { ...world, parent: "group" },
          {
            id: "group",
            type: "group",
            size: [10, 10],
            transform: { anchor: [0, 0], position: [1, 0] },
          },
        ]),
        0,
        { preparedNative3D: table },
      ),
    ).toThrow("identity placement");
  });
  it("releases executor-owned artwork and target after a borrowed artwork pass fails", async () => {
    const comp = document([world, artwork]),
      table = await prepared(),
      graph = buildRenderGraph(
        comp,
        evaluateComp(comp, 0, { preparedNative3D: table }),
      );
    const events: string[] = [],
      owned: Surface[] = [];
    const backend = {
      version: "unit",
      validateNativeDepth: () => events.push("validated"),
      createSurface: (width: number, height: number) => {
        const surface = { width, height };
        owned.push(surface);
        return surface;
      },
      releaseSurface: (surface: Surface) => {
        events.push("released");
        owned.splice(owned.indexOf(surface), 1);
      },
      clear: () => events.push("clear"),
      fillRect: () => events.push("artwork"),
      renderNativeDepth: (
        op: NativeDepthOp,
        _target: Surface,
        renderArtwork: (
          node: NativeDepthOp["graphics"][number]["surface"],
        ) => Surface,
      ) => {
        renderArtwork(op.graphics[0]!.surface);
        throw Error("pass failed");
      },
      composite: () => events.push("composite"),
    } as unknown as RenderBackend;
    expect(() =>
      executeGraph(backend, graph, { width: 320, height: 180 }),
    ).toThrow("pass failed");
    expect(events[0]).toBe("validated");
    expect(events.filter((event) => event === "released")).toHaveLength(2);
    expect(owned).toHaveLength(0);
    const preflightEvents: string[] = [];
    expect(() =>
      executeGraph(
        {
          ...backend,
          validateNativeDepth: () => {
            throw Error("blocked");
          },
          clear: () => preflightEvents.push("mutated"),
        },
        graph,
        { width: 320, height: 180 },
      ),
    ).toThrow("blocked");
    expect(preflightEvents).toEqual([]);
  });
});
