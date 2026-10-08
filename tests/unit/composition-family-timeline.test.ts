import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPOSITION_LIMITS,
  CommerceSceneSchema,
  StorySceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import {
  compilePreparedScene,
  evaluatePreparedNodeAtTime,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import { prepareIllustratedComposition } from "../../packages/renderer-core/src/composition/adapters/illustrated.ts";
import {
  compileFamilyTimeline,
  familyCompositionWindowAt,
} from "../../packages/renderer-core/src/composition/adapters/timeline.ts";
import { compiledCommerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { compiledStoryToComposition } from "../../packages/renderer-core/src/composition/adapters/story.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";
import { sourceExposureTimeline } from "../../packages/renderer-core/src/commerce-exposure.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  multiplyMatrix,
  nodeMatrix,
  type Matrix,
} from "../../packages/renderer-core/src/node-transform.ts";
import { storyCameraTransform } from "../../packages/renderer-core/src/story-camera.ts";
import {
  MotionFlowParamsSchema,
  MOTION_PATH_PROVIDERS,
} from "../../packages/renderer-core/src/composition/adapters/motion-path.ts";
import {
  compileStoryFlows,
  sampleStoryFlow,
} from "../../packages/renderer-core/src/story-flows.ts";
import { NumericTypographyParamsSchema } from "../../packages/renderer-core/src/composition/adapters/numeric-typography.ts";
import { numericTypographyVariants } from "../helpers/composition-typography.ts";
import { componentText } from "../../packages/renderer-core/src/component-values.ts";
import { passageError } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const context = {} as CanvasRenderingContext2D;
const base = {
  x: 10,
  y: 12,
  width: 32,
  height: 32,
  opacity: 1,
  rotation: 0,
  origin: [0.5, 0.5],
};
const story = (frameCount = 2001) =>
  StorySceneSchema.parse({
    schemaVersion: "story-scene-1",
    title: "Long native story",
    width: 1920,
    height: 1080,
    fps: 30,
    frameCount,
    background: "#ffffff",
    assets: [
      {
        id: "unused",
        path: "unused.png",
        width: 32,
        height: 32,
        sha256: "sha256:" + "0".repeat(64),
      },
    ],
    fonts: [],
    motionModel: "curves-1",
    motionGrammar: "v2",
    nodes: [
      { ...base, id: "parent", type: "group", clip: false },
      {
        ...base,
        id: "box",
        parent: "parent",
        type: "rect",
        fill: "#222222",
        radius: 0,
      },
      {
        ...base,
        id: "route",
        parent: "parent",
        type: "path",
        points: [
          [0, 0],
          [32, 0],
        ],
        stroke: "#222222",
        lineWidth: 2,
      },
      {
        ...base,
        id: "caption",
        parent: "parent",
        type: "text",
        text: "Late",
        fontSize: 16,
        color: "#222222",
        font: "sans-serif",
        weight: "normal",
        align: "left",
      },
    ],
    recipe: {
      preset: "generic",
      moves: [
        {
          node: "parent",
          window: { start: 1850, end: 1999, easing: "linear" },
          to: { x: 24, rotation: 37, scaleX: 1.2, scaleY: 0.8 },
        },
        {
          node: "route",
          window: { start: 1850, end: 1999, easing: "linear" },
          to: { reveal: 0.75 },
        },
        {
          node: "caption",
          window: { start: 1850, end: 1999, easing: "linear" },
          to: { reveal: 0.5 },
        },
      ],
    },
    camera: {
      keys: [
        { frame: 0, x: 32, y: 32, zoom: 1 },
        { frame: frameCount - 1, x: 34, y: 30, zoom: 1.1 },
      ],
      depth: { parent: 0.5 },
      cover: [],
    },
    flows: [
      {
        id: "late-flow",
        path: "route",
        direction: 1,
        count: 1,
        shape: "dot",
        size: 2,
        color: "#ff0000",
        window: { start: 1850, end: frameCount },
        speed: [
          { frame: 0, pxPerFrame: 0.7 },
          { frame: 1900, pxPerFrame: 1.3 },
        ],
      },
    ],
  });

function assertPose(
  scene: ReturnType<typeof compilePreparedScene>,
  comp: ReturnType<typeof compiledStoryToComposition>,
  frame: number,
) {
  const actual = new Map(
    evaluateComp(comp, frame).layers.map((state) => [state.id, state]),
  );
  const matrices = new Map<string, Matrix>();
  const visit = (id: string): Matrix => {
    if (matrices.has(id)) return matrices.get(id)!;
    const node = scene.nodes.find((node) => node.id === id)!;
    const state = evaluatePreparedNodeAtTime(scene, node, frame);
    const camera =
      scene.schemaVersion === "story-scene-1"
        ? storyCameraTransform(scene, id, frame)
        : { scale: 1, x: 0, y: 0 };
    const expected = multiplyMatrix(
      node.parent
        ? visit(node.parent)
        : [camera.scale, 0, 0, camera.scale, camera.x, camera.y],
      nodeMatrix(node, state),
    );
    actual
      .get(id)!
      .screenMatrix.forEach((value, axis) =>
        expect(value).toBeCloseTo(expected[axis]!, 8),
      );
    expect(actual.get(id)!.time).toBe(frame);
    matrices.set(id, expected);
    return expected;
  };
  scene.nodes.forEach((node) => visit(node.id));
}

describe("bounded native family timelines", () => {
  it.each([2000, 2001])(
    "prepares the accepted %i-frame story default without changing native budgets",
    (frameCount) => {
      const source = story(frameCount);
      const scene = compilePreparedScene(source);
      const original = structuredClone(source);
      const prepared = prepareIllustratedComposition(scene, new Map(), context);
      expect(source).toEqual(original);
      expect(prepared.composition.frameCount).toBe(frameCount);
      expect(prepared.windows).toBeDefined();
      for (const item of prepared.windows ?? [
        { start: 0, end: frameCount, composition: prepared.composition },
      ]) {
        expect(validateComposition(item.composition).ok).toBe(true);
        expect(JSON.parse(JSON.stringify(item.composition))).toEqual(
          item.composition,
        );
        for (const layer of item.composition.layers) {
          expect(layer.sampleTimes?.length ?? 0).toBeLessThanOrEqual(
            COMPOSITION_LIMITS.maxKeys,
          );
          if (layer.type === "provider")
            expect(
              new TextEncoder().encode(JSON.stringify(layer.params)).length,
            ).toBeLessThanOrEqual(COMPOSITION_LIMITS.maxJsonBytes);
        }
      }
      for (const frame of [frameCount - 1, 1999, 1900, 1850, 0, frameCount - 1])
        assertPose(
          scene,
          prepared.windows
            ? familyCompositionWindowAt(prepared.windows, frame).composition
            : prepared.composition,
          frame,
        );
    },
  );

  it("preserves provider samples and the global flow clock after a window switch", () => {
    const scene = compilePreparedScene(story(4001));
    const prepared = prepareIllustratedComposition(scene, new Map(), context);
    const frame = 2107;
    const comp = familyCompositionWindowAt(
      prepared.windows!,
      frame,
    ).composition;
    const tree = evaluateComp(comp, frame);
    const flowLayer = comp.layers.find(
      (layer) =>
        layer.type === "provider" && layer.provider === "component.flow@1.1.0",
    )!;
    if (flowLayer.type !== "provider")
      throw new Error("Expected flow provider");
    const data = MotionFlowParamsSchema.parse(flowLayer.params);
    expect(data.motion.frameCount).toBe(scene.frameCount);
    const state = tree.layers.find((state) => state.id === flowLayer.id)!;
    const route = scene.nodes.find((node) => node.id === "route")!;
    if (route.type !== "path" || scene.schemaVersion !== "story-scene-1")
      throw new Error("Expected story path");
    const expected = sampleStoryFlow(
      compileStoryFlows(scene.flows!, scene.frameCount)[0]!,
      route,
      evaluatePreparedNodeAtTime(scene, route, frame),
      frame,
      scene.frameCount,
      true,
    );
    const points: number[][] = [];
    const ctx = {
      globalAlpha: 1,
      save() {},
      restore() {},
      translate(x: number, y: number) {
        points.push([x, y]);
      },
      rotate() {},
      beginPath() {},
      arc() {},
      fill() {},
    } as unknown as CanvasRenderingContext2D;
    MOTION_PATH_PROVIDERS.find(
      (provider) => provider.id === flowLayer.provider,
    )!.prepare(flowLayer, { images: new Map(), fonts: new Map() }, "flow")(
      ctx,
      state.sampleIndex!,
      undefined,
      state.time,
    );
    expect(points).toEqual(expected.map((token) => token.point));
    const caption = comp.layers.find((layer) => layer.id === "caption")!;
    if (caption.type !== "provider") throw new Error("Expected text provider");
    const captionState = tree.layers.find((state) => state.id === caption.id)!;
    const samples = caption.params.samples as { reveal: number }[];
    expect(
      samples[Math.min(captionState.sampleIndex!, samples.length - 1)]!.reveal,
    ).toBe(
      evaluatePreparedNodeAtTime(
        scene,
        scene.nodes.find((node) => node.id === "caption")!,
        frame,
      ).reveal,
    );
  });

  it("supports the existing 108000-frame source ceiling without duplicating layers in one document", () => {
    const source = story(COMPOSITION_LIMITS.maxFrameCount);
    source.camera = undefined;
    source.flows = undefined;
    source.recipe = { preset: "generic", moves: [], emphasis: [] };
    source.nodes = source.nodes.filter(
      (node) => node.id === "parent" || node.id === "box",
    );
    const scene = compilePreparedScene(StorySceneSchema.parse(source));
    const prepared = prepareIllustratedComposition(scene, new Map(), context);
    expect(prepared.windows!.at(-1)!.end).toBe(108000);
    expect(
      prepared.windows!.every(
        (window) => window.composition.layers.length === 2,
      ),
    ).toBe(true);
    const comp = familyCompositionWindowAt(
      prepared.windows!,
      107999,
    ).composition;
    assertPose(scene, comp, 107999);
    expect(() => familyCompositionWindowAt(prepared.windows!, 108000)).toThrow(
      "outside",
    );
  });

  it("retains exact moving commerce shutter/history samples and effect clocks across windows", () => {
    const input = JSON.parse(
      readFileSync(
        "benchmarks/fixtures/ecommerce-motion/atoms/drift.json",
        "utf8",
      ),
    );
    input.frameCount = 2101;
    input.events = [
      {
        node: "product",
        property: "y",
        start: 0,
        end: 2100,
        to: 190,
        easing: "linear",
      },
    ];
    input.effects = [
      { ...input.effects[0], end: 2100, cycles: 4 },
      { type: "motion-blur", shutterAngle: 180, samples: 8 },
      { type: "echo", target: "product", spacing: 3, count: 4, decay: 0.6 },
      { type: "grain", amount: 0.02, seed: 3 },
    ];
    const scene = compilePreparedScene(CommerceSceneSchema.parse(input));
    if (scene.schemaVersion !== "commerce-scene-1")
      throw new Error("Expected commerce");
    const prepared = prepareIllustratedComposition(scene, new Map(), context);
    for (const frame of [2100, 2000, prepared.windows![1]!.start, 0, 2000]) {
      const comp = familyCompositionWindowAt(
        prepared.windows!,
        frame,
      ).composition;
      const expectedTimes = sourceExposureTimeline(scene, [
        frame,
        frame + 1,
      ]).times;
      expect(
        comp.layers.every((layer) =>
          expectedTimes.every((time) => layer.sampleTimes!.includes(time)),
        ),
      ).toBe(true);
      const shutters = compositionExposureFrames(comp, frame);
      [...evaluateCompositionExposure(comp, frame)].forEach((tree, i) => {
        assertPose(scene, comp, shutters[i]!);
        const grain = tree.layers
          .flatMap((layer) => layer.effects)
          .find((effect) => effect.effect === "stylize.grain")!;
        expect(grain.params.evolution).toBe(shutters[i]);
        expect(() => buildRenderGraph(comp, tree)).not.toThrow();
      });
      for (const time of expectedTimes) assertPose(scene, comp, time);
    }
  }, 30000);

  it("keeps numeric typography content and animation in the original source clock", () => {
    const json = JSON.parse(
      readFileSync("benchmarks/fixtures/typography/commerce.json", "utf8"),
    );
    const input = numericTypographyVariants(CommerceSceneSchema.parse(json))[0]!
      .scene;
    input.frameCount = 3001;
    const scene = compilePreparedScene(CommerceSceneSchema.parse(input));
    if (scene.schemaVersion !== "commerce-scene-1")
      throw new Error("Expected commerce");
    const timeline = compileFamilyTimeline(scene.frameCount, (window) =>
      compiledCommerceToComposition(scene, {}, window),
    );
    for (const frame of [3000, 2000, timeline.windows![1]!.start, 0, 2000]) {
      const comp = familyCompositionWindowAt(
        timeline.windows!,
        frame,
      ).composition;
      const layer = comp.layers.find(
        (layer) =>
          layer.type === "provider" &&
          layer.provider === "component.typography@1.0.0",
      )!;
      if (layer.type !== "provider")
        throw new Error("Expected numeric typography");
      const data = NumericTypographyParamsSchema.parse(layer.params);
      const state = evaluateComp(comp, frame).layers.find(
        (state) => state.id === layer.id,
      )!;
      expect(data.frameCount).toBe(3001);
      expect(data.textAnimators).toEqual(
        scene.textAnimators?.filter((animator) => animator.node === layer.id) ??
          [],
      );
      const node = scene.nodes.find((node) => node.id === layer.id)!;
      expect(
        data.numeric.samples[
          Math.min(state.sampleIndex!, data.numeric.samples.length - 1)
        ],
      ).toBe(componentText(scene, node, frame));
      expect(state.time).toBe(frame);
      expect(layer.sampleTimes!.length).toBeLessThanOrEqual(
        COMPOSITION_LIMITS.maxKeys,
      );
    }
  });

  it("only splits sample/payload budget failures and preserves other diagnostics", () => {
    const scene = compilePreparedScene(story());
    if (scene.schemaVersion !== "story-scene-1")
      throw new Error("Expected story");
    expect(() =>
      compileFamilyTimeline(2001, () =>
        passageError("comp-provider-params", "bad source", { node: "caption" }),
      ),
    ).toThrow("bad source");
    const prepared = compileFamilyTimeline(2001, (window) =>
      compiledStoryToComposition(scene, {}, window),
    );
    expect(prepared.windows!.map(({ start, end }) => [start, end])).toEqual([
      [0, 1000],
      [1000, 2001],
    ]);
    expect(() => compiledStoryToComposition(scene)).toThrow("at most");
    const commerce = compilePreparedScene(
      CommerceSceneSchema.parse(
        JSON.parse(
          readFileSync(
            "benchmarks/fixtures/ecommerce-motion/atoms/drift.json",
            "utf8",
          ),
        ),
      ),
    );
    if (commerce.schemaVersion !== "commerce-scene-1")
      throw new Error("Expected commerce");
    expect(() =>
      compiledCommerceToComposition(commerce, {}, [0, 2001]),
    ).toThrow();
  });
});
