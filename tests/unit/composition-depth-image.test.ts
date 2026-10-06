import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  resolvePropertyPath,
  isResolvedProperty,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp, buildRenderGraph } from "@still-shift/renderer-core";
import { ownCurve } from "../../packages/renderer-core/src/composition/evaluate/expression-keys.ts";
import { requireSpatialCapabilities } from "../../packages/renderer-core/src/composition/render/spatial-capabilities.ts";
import { depthImageGrid } from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import { compositionTracks } from "../../apps/lab/src/composition-keys.ts";
import { comp, depthImage, seq } from "@still-shift/motion";

const keys = (first: number, last: number) => ({
  keys: [
    { frame: 0, value: first },
    { frame: 10, value: last },
  ],
});
function fixture(): Composition {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "depth-test",
    width: 160,
    height: 90,
    frameCount: 20,
    fps: 30,
    assets: ["source", "depth"].map((id) => ({
      id,
      type: "image",
      path: `${id}.png`,
      sha256: "sha256:" + "a".repeat(64),
      width: 320,
      height: 180,
    })),
    layers: [
      {
        id: "photo",
        type: "depth-image",
        size: [160, 90],
        sourceAsset: "source",
        depth: {
          asset: "depth",
          encoding: "r8-unorm",
          width: 320,
          height: 180,
        },
        overscan: 0.1,
        startFrame: 4,
        stretch: 2,
        motion: { strength: keys(0, 0.03), offset: { x: keys(0, 0.02), y: 0 } },
      },
    ],
  });
}

describe("native depth-image contract and local evaluation", () => {
  it("registers both prepared builder assets and animates native depth controls", () => {
    const assets = fixture().assets as Extract<
      Composition["assets"][number],
      { type: "image" }
    >[];
    const doc = comp(
      { width: 160, height: 90, fps: 30, frames: 20 },
      (builder) => {
        const node = builder.add(
          depthImage("photo", assets[0]!, assets[1]!, {
            size: [160, 90],
            motion: { strength: 0 },
          }),
        );
        builder.timeline(
          seq(node.property<number>("motion.strength").to(0.03, 10, "linear")),
        );
      },
    );
    expect(doc.assets.map((asset) => asset.id)).toEqual(["source", "depth"]);
    expect(evaluateComp(doc, 5).layers[0]!.depthMotion!.strength).toBe(0.015);
  });
  it("rejects missing assets, forged dimensions and unsupported encodings", () => {
    const doc = fixture(),
      layer = doc.layers[0]!;
    expect(
      CompositionSchema.safeParse({
        ...doc,
        layers: [{ ...layer, sourceAsset: "missing" }],
      }).success,
    ).toBe(false);
    expect(
      CompositionSchema.safeParse({
        ...doc,
        layers: [
          {
            ...layer,
            depth: {
              asset: "depth",
              encoding: "r8-unorm",
              width: 12,
              height: 180,
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      CompositionSchema.safeParse({
        ...doc,
        layers: [
          {
            ...layer,
            depth: {
              asset: "depth",
              encoding: "float32",
              width: 320,
              height: 180,
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      CompositionSchema.safeParse({
        ...doc,
        assets: [
          doc.assets[0],
          {
            id: "depth",
            type: "font",
            path: "depth.ttf",
            weight: "400",
            sha256: "sha256:" + "b".repeat(64),
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects unbounded motion and crops outside the source", () => {
    const doc = fixture();
    for (const motion of [
      { strength: 0.1 },
      { scale: 2 },
      { roll: 0.4 },
      { offset: [0, Infinity] },
      { offset: [0, 0, 1] },
    ])
      expect(
        CompositionSchema.safeParse({
          ...doc,
          layers: [{ ...doc.layers[0], motion }],
        }).success,
      ).toBe(false);
    expect(
      CompositionSchema.safeParse({
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            framing: { x: 0.8, y: 0, width: 0.3, height: 1 },
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("samples after local stretch/start and repeats reverse seeks", () => {
    const doc = fixture();
    expect(evaluateComp(doc, 14).layers[0]!.depthMotion).toEqual({
      scale: 1,
      strength: 0.015,
      offset: [0.01, 0],
      roll: 0,
    });
    const forward = Array.from({ length: 20 }, (_, frame) =>
      evaluateComp(doc, frame),
    );
    for (let frame = 19; frame >= 0; frame--)
      expect(evaluateComp(doc, frame)).toEqual(forward[frame]);
  });
  it("keeps remapped precomp instances independent", () => {
    const child = fixture(),
      doc = CompositionSchema.parse({
        ...child,
        layers: [
          { id: "one", type: "precomp", comp: "child", timeRemap: 14 },
          { id: "two", type: "precomp", comp: "child", timeRemap: 4 },
        ],
        precomps: [
          {
            id: "child",
            width: 160,
            height: 90,
            frameCount: 20,
            layers: child.layers,
          },
        ],
      });
    const states = evaluateComp(doc, 3).layers;
    expect(states[0]!.precomp!.layers[0]!.depthMotion!.strength).toBe(0.015);
    expect(states[1]!.precomp!.layers[0]!.depthMotion!.strength).toBe(0);
  });
  it("supports expressions, drivers and owned stages with envelope errors", () => {
    const doc = fixture();
    const expr = CompositionSchema.parse({
      ...doc,
      expressions: {
        "photo.motion.strength": { source: "value * 0.5" },
        "photo.motion.offset.x": {
          source: "ref('photo.motion.offset.y') + 0.01",
        },
      },
    });
    expect(evaluateComp(expr, 14).layers[0]!.depthMotion).toEqual({
      scale: 1,
      strength: 0.0075,
      offset: [0.01, 0],
      roll: 0,
    });
    const unsafe = CompositionSchema.parse({
      ...doc,
      expressions: { "photo.motion.strength": { source: "0.2" } },
    });
    expect(() => evaluateComp(unsafe, 5)).toThrow(/bounded local displacement/);
    const driven = CompositionSchema.parse({
      ...doc,
      layers: [
        ...doc.layers,
        { id: "control", type: "null", transform: { position: [0.01, 0] } },
      ],
      drivers: [
        {
          target: "photo.motion.strength",
          source: "control.transform.position.x",
        },
      ],
    });
    expect(evaluateComp(driven, 14).layers[0]!.depthMotion!.strength).toBe(
      0.01,
    );
    expect(evaluateComp(doc, 14).layers[0]!.depthMotion!.offset).toEqual([
      0.01, 0,
    ]);
  });
  it("resolves only real depth controls and exposes own curves", () => {
    const doc = fixture();
    for (const path of [
      "photo.motion.strength",
      "photo.motion.scale",
      "photo.motion.roll",
      "photo.motion.offset",
      "photo.motion.offset.x",
      "photo.motion.offset.y",
    ])
      expect(isResolvedProperty(resolvePropertyPath(doc, path))).toBe(true);
    for (const path of [
      "photo.motion.offset.z",
      "photo.motion.unknown",
      "photo.motion[scale]",
    ])
      expect(isResolvedProperty(resolvePropertyPath(doc, path))).toBe(false);
    const own = ownCurve(
      doc.layers[0]!,
      [{ name: "motion" }, { name: "strength" }],
      30,
    )!;
    expect(own.frames).toEqual([0, 10]);
    expect(own.sample(5)).toBe(0.015);
  });
  it("rejects Canvas depth before painting and retains hashes in the graph", () => {
    const doc = fixture(),
      graph = buildRenderGraph(doc, evaluateComp(doc, 14));
    expect(() =>
      requireSpatialCapabilities(graph.root, { projective: false }),
    ).toThrow(/Depth displacement requires/);
    expect(() =>
      requireSpatialCapabilities(graph.root, {
        projective: true,
        depthImage: true,
      }),
    ).not.toThrow();
    expect(JSON.stringify(graph)).toContain("sha256:" + "a".repeat(64));
  });
  it("retains the pinned 128×72 mesh indices and winding", () => {
    const grid = depthImageGrid();
    expect(grid.vertices.length).toBe(129 * 73 * 4);
    expect(grid.indices.length).toBe(128 * 72 * 6);
    expect(Array.from(grid.vertices.slice(0, 4))).toEqual([-1, 1, 0, 1]);
    expect(Array.from(grid.indices.slice(0, 6))).toEqual([
      0, 129, 1, 129, 130, 1,
    ]);
    expect(Math.max(...grid.indices)).toBe(129 * 73 - 1);
  });
  it("discovers depth scalar and separated offset keys in the inspector", () => {
    expect(compositionTracks(fixture()).map((track) => track.property)).toEqual(
      ["motion.strength", "motion.offset.x"],
    );
  });
});
