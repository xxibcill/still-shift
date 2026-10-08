import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  PreparedSceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import { legacyTextVariants } from "../helpers/composition-legacy-text.ts";
import { legacyToComposition } from "../../packages/renderer-core/src/composition/adapters/legacy.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import {
  multiplyMatrix,
  nodeMatrix,
  type Matrix,
} from "../../packages/renderer-core/src/node-transform.ts";

const inventory = JSON.parse(
  readFileSync("tests/visual/composition-baselines/fixtures.json", "utf8"),
) as {
  fixtures: { id: string; family: string; path: string }[];
};
const fixtures = inventory.fixtures.filter(
  (fixture) => fixture.family === "legacy-illustrated",
);
const source = (path: string) =>
  PreparedSceneSchema.parse(JSON.parse(readFileSync(path, "utf8")));

function assertStates(input: ReturnType<typeof source>) {
  const original = structuredClone(input),
    legacy = compilePreparedScene(input);
  const composition = legacyToComposition(input);
  expect(validateComposition(composition).ok).toBe(true);
  const reload = JSON.parse(JSON.stringify(composition));
  for (let frame = composition.frameCount - 1; frame >= 0; frame--) {
    const states = new Map(
      evaluateComp(reload, frame).layers.map((state) => [state.id, state]),
    );
    const expected = new Map<string, { matrix: Matrix; opacity: number }>();
    const visit = (id: string): { matrix: Matrix; opacity: number } => {
      if (expected.has(id)) return expected.get(id)!;
      const node = legacy.nodes.find((node) => node.id === id)!;
      const sample = evaluatePreparedNode(legacy, node, frame);
      const parent = node.parent ? visit(node.parent) : undefined;
      const result = {
        matrix: multiplyMatrix(
          parent?.matrix ?? [1, 0, 0, 1, 0, 0],
          nodeMatrix(node, sample),
        ),
        opacity: (parent?.opacity ?? 1) * sample.opacity,
      };
      expected.set(id, result);
      return result;
    };
    for (const node of legacy.nodes) {
      const state = states.get(node.id)!,
        target = visit(node.id);
      state.screenMatrix.forEach((value, index) =>
        expect(value).toBeCloseTo(target.matrix[index]!, 8),
      );
      expect(state.opacity).toBeCloseTo(target.opacity, 10);
      const sample = evaluatePreparedNode(legacy, node, frame);
      if (state.layer.type === "image")
        expect(state.state).toBe(Math.round(sample.state));
      if (state.layer.type === "provider") {
        const samples = state.layer.params.samples as Record<string, number>[];
        const payload = samples[Math.min(frame, samples.length - 1)]!;
        for (const [property, value] of Object.entries(payload))
          expect(value).toBeCloseTo(
            sample[property as keyof typeof sample]!,
            10,
          );
      }
    }
  }
  expect(input).toEqual(original);
  return composition;
}

it.each(fixtures)(
  "preserves every frame, inherited matrix, opacity and provider state for $id",
  ({ path }) => {
    assertStates(source(path));
  },
);

it("covers all six frozen recipes and the vertical fixture", () => {
  expect(fixtures).toHaveLength(7);
  expect(
    new Set(fixtures.map(({ path }) => source(path).recipe.preset)).size,
  ).toBe(6);
});

it("uses native follower constraints and inspectable millisecond progress keys", () => {
  const composition = legacyToComposition(
    source(
      fixtures.find((fixture) => fixture.id === "legacy/resource-flow")!.path,
    ),
  );
  expect(composition.constraints).toHaveLength(2);
  expect(
    composition.constraints!.every(
      (constraint) => constraint.type === "follow-path",
    ),
  ).toBe(true);
  for (const signal of composition.signals!) {
    expect(signal.keys.length).toBeLessThanOrEqual(100);
    expect(signal.keys[0]!.frame).toBe(0);
    expect(signal.keys.at(-1)!.frame).toBe(composition.frameCount - 1);
    expect(
      signal.keys.every(
        (key) => Number.isInteger(key.frame) && key.interpolation === "hold",
      ),
    ).toBe(true);
  }
});

it("retains legacy follower coordinates with transformed parents and noncentral anchors", () => {
  const input = source(
    fixtures.find((fixture) => fixture.id === "legacy/resource-flow")!.path,
  );
  const token = input.nodes.find((node) => node.id === "food-token")!;
  token.parent = "food";
  token.origin = [0.1, 0.8];
  token.rotation = 27;
  const path = input.nodes.find((node) => node.id === "food-path")!;
  path.parent = "food";
  path.rotation = 17;
  path.x = 21;
  path.y = -14;
  input.nodes.find((node) => node.id === "food")!.rotation = 13;
  assertStates(input);
});

it("allocates helper ids around user authored names", () => {
  const input = source(
    fixtures.find((fixture) => fixture.id === "legacy/resource-flow")!.path,
  );
  input.nodes.push({
    ...input.nodes.find((node) => node.id === "food")!,
    id: "food-token-legacy-contour",
  });
  const composition = legacyToComposition(input);
  expect(composition.constraints![0]).toMatchObject({
    path: "food-token-legacy-contour-helper",
  });
});

it.each(
  [24, 30].flatMap((fps) =>
    [3000, 8000].map((durationMs) => ({ fps, durationMs })),
  ),
)(
  "retains exact follower sampling at $fps fps / $durationMs ms",
  ({ fps, durationMs }) => {
    const input = source(
      fixtures.find((fixture) => fixture.id === "legacy/resource-flow")!.path,
    );
    input.fps = fps as 24 | 30;
    input.durationMs = durationMs;
    assertStates(input);
  },
);

it.each(
  legacyTextVariants(
    "legacy/chronicle-reveal",
    source(
      fixtures.find((fixture) => fixture.id === "legacy/chronicle-reveal")!
        .path,
    ),
  ),
)("preserves bounded measured text and containers for $id", ({ id, scene }) => {
  const composition = assertStates(scene);
  const node = scene.nodes.find((node) => node.id === "title")!;
  const layer = composition.layers.find((layer) => layer.id === node.id)!;
  expect(layer).toMatchObject({
    type: "provider",
    provider: id.endsWith("/text-box")
      ? "commerce.text@1.0.0"
      : "commerce.text@1.2.0",
    assets: ["legacy-text-font"],
    usesSystemFonts: false,
    params: { node },
  });
  expect(
    composition.layers.find((layer) => layer.id === "kicker"),
  ).toMatchObject({
    type: "provider",
    provider: "story.text@1.0.0",
    usesSystemFonts: true,
  });
});

it.each(["constructor", "toString", "hasOwnProperty"])(
  "preserves a valid unfollowed node named %s",
  (id) => {
    const input = source(
      fixtures.find((fixture) => fixture.id === "legacy/comparison-build")!
        .path,
    );
    const node = input.nodes.find((candidate) => candidate.id === "kicker")!;
    const previousId = node.id;
    node.id = id;
    for (const child of input.nodes)
      if (child.parent === previousId) child.parent = id;
    const validated = PreparedSceneSchema.parse(input);
    expect(Object.hasOwn(compilePreparedScene(validated).followers, id)).toBe(
      false,
    );
    const composition = assertStates(validated);
    expect(composition.layers.some((layer) => layer.id === id)).toBe(true);
    expect(composition.constraints ?? []).toHaveLength(0);
  },
);
