import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommerceSceneSchema,
  PreparedNodeSchema,
  type CommerceScene,
} from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { COMMERCE_CONTENT_PROVIDERS } from "../../packages/renderer-core/src/composition/adapters/commerce-providers.ts";
import { compileCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import { evaluateAttachedPath } from "../../packages/renderer-core/src/commerce-geometry.ts";
import { mechanismPortraitProof } from "../helpers/mechanism-portrait-proof.ts";
import { worldMatrix } from "../../packages/renderer-core/src/commerce-geometry.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";
import { evaluateComponentAnnotation } from "../../packages/renderer-core/src/component-annotations.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { assertCompositionAdapterState } from "../helpers/composition-adapter-state.ts";

const fixture = (path: string) =>
  CommerceSceneSchema.parse(
    JSON.parse(readFileSync(`benchmarks/fixtures/${path}.json`, "utf8")),
  );
const attached = () => fixture("ecommerce-motion/atoms/attachment");
const cases = [
  "ecommerce-motion/atoms/attachment",
  ...["commerce", "isolated"].flatMap((context) =>
    ["leader", "outline", "underline", "bracket", "tour", "supply"].map(
      (name) => `reusable-components/${context}-${name}`,
    ),
  ),
];

function compareGeometry(input: CommerceScene) {
  const original = structuredClone(input);
  const scene = compileCommerceScene(input);
  const composition = commerceToComposition(input);
  const paths = composition.layers.filter(
    (layer) =>
      layer.type === "provider" && layer.provider === "commerce.path@1.0.0",
  );
  expect(paths.length).toBeGreaterThan(0);
  for (const layer of paths) {
    if (layer.type !== "provider") throw new Error("Expected provider");
    const node = scene.nodes.find((node) => node.id === layer.id)!;
    if (node.type !== "path") throw new Error("Expected path");
    const geometry = layer.params.geometry as { points: [number, number][][] };
    for (let frame = scene.frameCount - 1; frame >= 0; frame--)
      expect(
        geometry.points[Math.min(frame, geometry.points.length - 1)],
      ).toEqual(
        evaluateComponentAnnotation(
          scene,
          evaluateAttachedPath(scene, node, frame),
          frame,
        ).points,
      );
  }
  expect(input).toEqual(original);
  expect(JSON.parse(JSON.stringify(composition))).toEqual(composition);
  assertCompositionAdapterState(scene, composition);
  return composition;
}

function annotation(input: CommerceScene) {
  input.attachments = [];
  input.componentData = {
    schemaVersion: "scene-components-1",
    values: [],
    bindings: [],
    annotations: [
      {
        path: "attached-line",
        points: [
          { node: "feature", point: [230, 35], space: "node", offset: [0, 0] },
          {
            node: "product-art",
            point: [561, 168.24],
            space: "source",
            offset: [0, 0],
          },
        ],
        protect: ["product-art"],
      },
    ],
  };
  return input;
}

describe("CE4b attached paths and annotations", () => {
  it.each(cases)(
    "bakes every local vertex and preserves transforms: %s",
    (name) => {
      compareGeometry(fixture(name));
    },
  );

  it.each(["attachment", "annotation"])(
    "resolves cropped sources, offsets and nested transforms for %s",
    (kind) => {
      const input = kind === "annotation" ? annotation(attached()) : attached();
      const art = input.nodes.find((node) => node.id === "product-art")!;
      if (art.type !== "image") throw new Error("Expected image");
      art.states[0]!.crop = [300, 0, 700, 600];
      input.geometry![0]!.protectedRegions = [];
      input.nodes.find((node) => node.id === "product")!.rotation = 8;
      const path = input.nodes.find((node) => node.id === "attached-line")!;
      if (kind === "attachment") path.parent = "path-plane";
      else
        input.nodes.find((node) => node.id === "product")!.parent =
          "path-plane";
      path.x = 12;
      path.y = -8;
      path.width = 100;
      path.height = 80;
      path.rotation = -11;
      input.nodes.push(
        PreparedNodeSchema.parse({
          id: "path-plane",
          type: "group",
          x: 35,
          y: 42,
          width: 400,
          height: 400,
          rotation: 21,
        }),
      );
      if (kind === "attachment") input.attachments![0]!.offset = [7, -4];
      else input.componentData!.annotations[0]!.points[1]!.offset = [7, -4];
      compareGeometry(input);
    },
  );

  it.each(["attachment", "annotation"])(
    "preserves crop and protected-region rejection for %s",
    (kind) => {
      const input = kind === "annotation" ? annotation(attached()) : attached();
      if (kind === "attachment") input.geometry![0]!.anchors.cap = [500, 700];
      else input.componentData!.annotations[0]!.points[1]!.point = [500, 700];
      expect(() => commerceToComposition(input)).toThrow(
        /protected product region/,
      );
      const art = input.nodes.find((node) => node.id === "product-art")!;
      if (art.type !== "image") throw new Error("Expected image");
      art.states[0]!.crop = [0, 0, 100, 100];
      expect(() => commerceToComposition(input)).toThrow(
        /outside visible crop/,
      );
    },
  );

  it.each(["path", "ancestor"])(
    "does not evaluate unsafe attached geometry under zero %s opacity",
    (kind) => {
      const input = attached();
      input.geometry![0]!.anchors.cap = [500, 700];
      const path = input.nodes.find((node) => node.id === "attached-line")!;
      if (kind === "path") path.opacity = 0;
      else {
        path.parent = "hidden";
        input.nodes.push(
          PreparedNodeSchema.parse({
            id: "hidden",
            type: "group",
            width: 1080,
            height: 1350,
            opacity: 0,
          }),
        );
      }
      expect(() => commerceToComposition(input)).not.toThrow();
    },
  );

  it("compacts settled geometry without changing the held endpoint", () => {
    const input = attached();
    input.events = [input.events[0]!];
    const composition = compareGeometry(input);
    const layer = composition.layers.find(
      (layer) => layer.id === "attached-line",
    )!;
    if (layer.type !== "provider") throw new Error("Expected provider");
    expect(
      (layer.params.geometry as { points: unknown[] }).points,
    ).toHaveLength(61);
  });

  it("retains conflicting attachment/annotation ownership diagnostics", () => {
    const input = annotation(attached());
    input.attachments = attached().attachments;
    expect(() => commerceToComposition(input)).toThrow(
      /Conflicting annotation path ownership/,
    );
  });

  it("bounds geometry payloads with source-node diagnostics", () => {
    const input = attached();
    input.frameCount = 2000;
    input.events = [{ ...input.events[0]!, end: 1999 }];
    const index = input.nodes.findIndex((node) => node.id === "attached-line");
    const path = input.nodes[index]!;
    if (path.type !== "path") throw new Error("Expected path");
    path.points = Array.from({ length: 128 }, (_, i) => [i * 1.23456789, 375]);
    input.attachments![0]!.protect = false;
    expect.assertions(1);
    try {
      commerceToComposition(input);
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-json-size",
          node: path.id,
          path: `nodes[${index}]`,
        }),
      );
    }
  });

  it("rejects malformed baked vertices before drawing", () => {
    const composition = commerceToComposition(attached());
    const layer = composition.layers.find(
      (layer) => layer.id === "attached-line",
    )!;
    if (layer.type !== "provider") throw new Error("Expected provider");
    layer.params.geometry = { points: [[[0, 0]]] };
    const provider = COMMERCE_CONTENT_PROVIDERS.find(
      (provider) => provider.id === layer.provider,
    )!;
    expect.assertions(1);
    try {
      provider.prepare(
        layer,
        { images: new Map(), fonts: new Map() },
        "layers[0]",
      );
    } catch (error) {
      expect(passageDiagnostics(error)).toContainEqual(
        expect.objectContaining({
          code: "comp-provider-params",
          path: "layers[0].params",
        }),
      );
    }
  });

  it("holds local geometry at fractional times, clamps endpoints and seeks backwards", () => {
    const composition = commerceToComposition(attached());
    const layer = composition.layers.find(
      (layer) => layer.id === "attached-line",
    )!;
    if (layer.type !== "provider") throw new Error("Expected provider");
    layer.params.geometry = {
      points: [
        [
          [0, 0],
          [10, 0],
        ],
        [
          [0, 0],
          [20, 0],
        ],
      ],
    };
    layer.params.samples = [{ reveal: 1, gap: 0, pinch: 0, pulse: 0 }];
    const provider = COMMERCE_CONTENT_PROVIDERS.find(
      (provider) => provider.id === layer.provider,
    )!;
    const draw = provider.prepare(
      layer,
      { images: new Map(), fonts: new Map() },
      "layers[0]",
    );
    let endpoint: number[] = [];
    const context = {
      beginPath() {},
      moveTo() {},
      stroke() {},
      lineTo(x: number, y: number) {
        endpoint = [x, y];
      },
    } as unknown as CanvasRenderingContext2D;
    for (const [time, expected] of [
      [1.99, 20],
      [0.99, 10],
      [500, 20],
      [-10, 10],
    ]) {
      draw(context, time!);
      expect(endpoint).toEqual([expected, 0]);
    }
  });
});

it("repairs a lost portrait label/leader while retaining the exact semantic cap and transformed endpoint", () => {
  const negative = mechanismPortraitProof(attached(), false);
  const corrected = mechanismPortraitProof(attached(), true);
  expect(corrected.geometry![0]!.anchors.cap).toEqual(
    negative.geometry![0]!.anchors.cap,
  );
  expect(corrected.assets).toEqual(negative.assets);
  const scene = compileCommerceScene(corrected);
  const path = scene.nodes.find((node) => node.id === "attached-line")!;
  const image = scene.nodes.find((node) => node.id === "product-art")!;
  if (path.type !== "path" || image.type !== "image")
    throw new Error("fixture");
  const target = corrected.geometry![0]!.anchors.cap!;
  const scale = Math.min(image.width / 850, image.height / 1250);
  const local: [number, number] = [
    (image.width - 850 * scale) / 2 + (target[0] - 200) * scale,
    (image.height - 1250 * scale) / 2 + target[1] * scale,
  ];
  const faulty = compileCommerceScene(negative);
  const faultyPath = faulty.nodes.find((node) => node.id === "attached-line")!;
  if (faultyPath.type !== "path") throw new Error("fixture");
  for (const frame of [0, 30, 60, 15, 30, 0]) {
    const line = evaluateComponentAnnotation(scene, path, frame);
    const actual = transformPoint(
      worldMatrix(scene, path, frame),
      line.points.at(-1)!,
    );
    const expected = transformPoint(worldMatrix(scene, image, frame), local);
    expect(actual[0]).toBeCloseTo(expected[0], 9);
    expect(actual[1]).toBeCloseTo(expected[1], 9);
    const first = transformPoint(
      worldMatrix(scene, path, frame),
      line.points[0]!,
    );
    expect(first[0]).toBeGreaterThan(0);
    expect(actual[0]).toBeLessThan(corrected.width);
    expect(actual[1]).toBeGreaterThan(0);
    const wrong = evaluateComponentAnnotation(faulty, faultyPath, frame);
    expect(
      transformPoint(
        worldMatrix(faulty, faultyPath, frame),
        wrong.points[0]!,
      )[0],
    ).toBeLessThan(0);
  }
  const cropped = structuredClone(corrected);
  cropped.componentData!.annotations[0]!.points[1]!.point = [50, 50];
  expect(() => commerceToComposition(cropped)).toThrow(/outside visible crop/);
  compareGeometry(JSON.parse(JSON.stringify(corrected)));
});
