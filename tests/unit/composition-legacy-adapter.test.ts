import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  PreparedSceneSchema,
  validateComposition,
} from "@still-shift/scene-contract";
import { legacyTextVariants } from "../helpers/composition-legacy-text.ts";
import { legacyEnvelopeVariants } from "../helpers/composition-legacy-envelope.ts";
import { legacyTextProbeVariants } from "../helpers/composition-legacy-text-probe.ts";
import {
  legacyResourceAliases,
  legacyTextProbe,
} from "../../packages/renderer-core/src/composition/adapters/legacy-compatibility.ts";
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

it("preserves accepted legacy source tables, identifiers, assets and deep clipped parents after JSON reload", () => {
  const input = legacyEnvelopeVariants(
    "legacy/pose-prop-change",
    source("benchmarks/fixtures/history-offstage-v2/pose-prop-change.json"),
  )[0]!.scene;
  const original = structuredClone(input);
  const legacy = compilePreparedScene(input);
  const composition = legacyToComposition(input);
  expect(validateComposition(composition).ok).toBe(true);
  expect(composition.precomps).toHaveLength(1);
  expect(composition.assets.length).toBeLessThan(500);
  expect(composition.assets.every((asset) => asset.id.length <= 128)).toBe(
    true,
  );
  const reload = JSON.parse(JSON.stringify(composition));
  const aliases = legacyResourceAliases(reload, [
    ...input.assets,
    ...(input.fonts ?? []),
  ]);
  const layerAliases = reload.metadata.legacyLayerAliases as Record<
    string,
    number
  >;
  for (let frame = composition.frameCount - 1; frame >= 0; frame--) {
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
    const check = (
      tree: ReturnType<typeof evaluateComp>,
      matrix: Matrix = [1, 0, 0, 1, 0, 0],
      opacity = 1,
    ) => {
      for (const state of tree.layers) {
        const index = layerAliases[state.id];
        const id = index === undefined ? state.id : input.nodes[index]!.id;
        const node = legacy.nodes.find((node) => node.id === id);
        const world = multiplyMatrix(matrix, state.screenMatrix);
        if (node) {
          const target = visit(id);
          world.forEach((value, index) =>
            expect(value).toBeCloseTo(target.matrix[index]!, 8),
          );
          expect(opacity * state.opacity).toBeCloseTo(target.opacity, 10);
          if (node.type === "image" && state.layer.type === "image") {
            const index = Math.round(
              evaluatePreparedNode(legacy, node, frame).state,
            );
            const selected = state.layer.sources[state.state!]!;
            expect(aliases.get(selected.asset) ?? selected.asset).toBe(
              node.states[index]!.asset,
            );
            expect(selected.crop).toEqual(node.states[index]!.crop);
          }
        }
        if (state.precomp) check(state.precomp, world, opacity * state.opacity);
      }
    };
    check(evaluateComp(reload, frame));
  }
  expect(input).toEqual(original);
});

it("keeps the complete 200-node legacy parent envelope within native scope and nesting limits", () => {
  const input = source(
    "benchmarks/fixtures/history-offstage-v2/pose-prop-change.json",
  );
  const count = 200 - input.nodes.length;
  for (let index = 0; index < count; index++)
    input.nodes.push({
      id: `group-${index}`,
      type: "group",
      ...(index ? { parent: `group-${index - 1}` } : {}),
      x: 0,
      y: 0,
      width: input.width,
      height: input.height,
      opacity: 1,
      rotation: 0,
      origin: [0, 0],
      clip: true,
    });
  input.nodes.find((node) => node.id === "kicker")!.parent =
    `group-${count - 1}`;
  const composition = legacyToComposition(PreparedSceneSchema.parse(input));
  expect(validateComposition(JSON.parse(JSON.stringify(composition))).ok).toBe(
    true,
  );
  expect(composition.precomps!.length).toBeLessThanOrEqual(8);
});

it("moves deep legacy follower constraints with their native path and keeps root signal clocks", () => {
  const input = source(
    "benchmarks/fixtures/history-offstage-v2/resource-flow.json",
  );
  if (input.recipe.preset !== "resource_flow")
    throw new Error("Expected flow recipe");
  const branch = input.recipe.branches[0]!;
  const token = input.nodes.find((node) => node.id === branch.token)!;
  const path = input.nodes.find((node) => node.id === branch.path)!;
  for (let index = 0; index < 33; index++)
    input.nodes.push({
      id: `follower-parent-${index}`,
      type: "group",
      ...(index ? { parent: `follower-parent-${index - 1}` } : {}),
      x: 0.25,
      y: -0.125,
      width: input.width,
      height: input.height,
      opacity: 0.997,
      rotation: index % 2 ? -0.1 : 0.12,
      origin: [0, 0],
      clip: true,
    });
  token.parent = path.parent = "follower-parent-32";
  const legacy = compilePreparedScene(PreparedSceneSchema.parse(input));
  const composition = legacyToComposition(input);
  const nested = composition.precomps![0]!;
  expect(nested.constraints).toHaveLength(1);
  const constraint = nested.constraints![0]!;
  expect(constraint.type).toBe("follow-path");
  if (constraint.type !== "follow-path") throw new Error("Expected follower");
  expect(nested.layers.some((layer) => layer.id === constraint.path)).toBe(
    true,
  );
  expect(
    composition.signals!.some((signal) => signal.id === constraint.progress),
  ).toBe(true);
  for (const frame of [
    0,
    Math.floor(composition.frameCount / 2),
    composition.frameCount - 1,
  ]) {
    let expected = nodeMatrix(
      token,
      evaluatePreparedNode(legacy, token, frame),
    );
    for (let id: string | undefined = token.parent; id; ) {
      const parent = legacy.nodes.find((node) => node.id === id)!;
      expected = multiplyMatrix(
        nodeMatrix(parent, evaluatePreparedNode(legacy, parent, frame)),
        expected,
      );
      id = parent.parent;
    }
    const tree = evaluateComp(JSON.parse(JSON.stringify(composition)), frame);
    const host = tree.layers.find((state) => state.layer.type === "precomp")!;
    const actual = host.precomp!.layers.find((state) => state.id === token.id)!;
    multiplyMatrix(host.screenMatrix, actual.screenMatrix).forEach(
      (value, index) => expect(value).toBeCloseTo(expected[index]!, 8),
    );
  }
});

it("prunes unused states across native-size tables when the accepted asset collection exceeds 500", () => {
  const input = source(
    "benchmarks/fixtures/history-offstage-v2/pose-prop-change.json",
  );
  const template = input.nodes.find((node) => node.id === "store")!;
  if (template.type !== "image") throw new Error("Expected image");
  for (let index = 0; index < 17; index++) {
    const states = Array.from({ length: 32 }, (_, state) => {
      const asset = { ...input.assets[1]!, id: `extra-${index}-${state}` };
      input.assets.push(asset);
      return { asset: asset.id };
    });
    input.nodes.push({ ...template, id: `static-${index}`, states });
  }
  const parsed = PreparedSceneSchema.parse(input);
  const composition = legacyToComposition(parsed);
  expect(validateComposition(composition).ok).toBe(true);
  expect(composition.assets.length).toBeLessThan(500);
  for (const layer of composition.layers)
    if (layer.id.startsWith("static-")) {
      expect(layer.type).toBe("image");
      if (layer.type === "image") expect(layer.sources).toHaveLength(1);
    }
});

it("keeps unbounded legacy node and asset identifiers outside bounded native payloads", () => {
  const input = source(
    "benchmarks/fixtures/history-offstage-v2/pose-prop-change.json",
  );
  if (input.recipe.preset !== "pose_prop_change")
    throw new Error("Expected pose recipe");
  const recipe = input.recipe;
  const actor = input.nodes.find((node) => node.id === recipe.actor)!;
  actor.id = `actor-${"a".repeat(100_000)}`;
  input.recipe.actor = actor.id;
  input.nodes.find((node) => node.id === "kicker")!.id =
    `text-${"t".repeat(100_000)}`;
  const asset = input.assets.find((asset) => asset.id === "bowl-states")!;
  const previous = asset.id;
  asset.id = `asset-${"b".repeat(100_000)}`;
  for (const node of input.nodes)
    if (node.type === "image")
      for (const state of node.states)
        if (state.asset === previous) state.asset = asset.id;
  const parsed = PreparedSceneSchema.parse(input);
  const composition = legacyToComposition(parsed);
  const reload = JSON.parse(JSON.stringify(composition));
  expect(validateComposition(reload).ok).toBe(true);
  expect(JSON.stringify(reload.metadata).length).toBeLessThan(1000);
  expect(JSON.stringify(reload)).not.toContain("a".repeat(1000));
  expect(JSON.stringify(reload)).not.toContain("t".repeat(1000));
  expect([...legacyResourceAliases(reload, parsed.assets).values()]).toContain(
    asset.id,
  );
});

it("retains accepted legacy pose labels and anchors without imposing native identifier caps on paint metadata", () => {
  const input = source(
    "benchmarks/fixtures/history-offstage-v2/pose-prop-change.json",
  );
  if (input.recipe.preset !== "pose_prop_change")
    throw new Error("Expected pose recipe");
  const recipe = input.recipe;
  const actor = input.nodes.find((node) => node.id === recipe.actor)!;
  if (actor.type !== "image") throw new Error("Expected actor");
  actor.states.forEach((state, index) => {
    state.pose = `pose-${index}-${"p".repeat(129)}`;
    state.anchors = { [`anchor-${"q".repeat(129)}`]: [0.5, 0.5] };
  });
  const composition = legacyToComposition(PreparedSceneSchema.parse(input));
  const native = composition.layers.find((layer) => layer.id === actor.id)!;
  expect(native.type).toBe("image");
  if (native.type === "image") {
    expect(
      native.sources.every((source) => !source.pose && !source.anchors),
    ).toBe(true);
    expect(native.sources.map((source) => source.crop)).toEqual(
      actor.states.map((state) => state.crop),
    );
  }
});

it("binds exceptionally long legacy font identifiers through source ordinals after JSON reload", () => {
  const input = legacyEnvelopeVariants(
    "legacy/chronicle-reveal",
    source("benchmarks/fixtures/history-offstage-v2/chronicle-reveal.json"),
  )[0]!.scene;
  const font = input.fonts![0]!;
  const previous = font.id;
  font.id = `font-${"f".repeat(100_000)}`;
  for (const node of input.nodes)
    if (node.type === "text" && node.fontAsset === previous)
      node.fontAsset = font.id;
  const composition = JSON.parse(JSON.stringify(legacyToComposition(input)));
  const aliases = legacyResourceAliases(composition, [
    ...input.assets,
    ...input.fonts!,
  ]);
  const nativeFont = [...aliases].find(
    ([, original]) => original === font.id,
  )![0];
  const text = composition.layers.find(
    (layer: { id: string }) => layer.id === "title",
  );
  expect(text.assets).toEqual([nativeFont]);
  expect(text.params.node.fontAsset).toBe(nativeFont);
  expect(JSON.stringify(composition)).not.toContain("f".repeat(1000));
  expect(validateComposition(composition).ok).toBe(true);
});

it.each(
  legacyTextProbeVariants(
    "legacy/chronicle-reveal",
    source(
      fixtures.find((fixture) => fixture.id === "legacy/chronicle-reveal")!
        .path,
    ),
  ),
)(
  "binds diagnostic probes to collision-free payload ids for $id",
  ({ id, scene, probes }) => {
    const original = structuredClone(scene);
    const composition = JSON.parse(
      JSON.stringify(legacyToComposition(scene)),
    ) as ReturnType<typeof legacyToComposition>;
    const scopes = [composition, ...(composition.precomps ?? [])];
    for (const scope of scopes)
      for (const layer of scope.layers)
        if (layer.type === "provider")
          expect(layer.params.node).toMatchObject({ id: layer.id });
    const aliases = composition.metadata!.legacyLayerAliases as Record<
      string,
      number
    >;
    for (const target of probes)
      for (const mode of ["ink-only", "container-only"] as const) {
        const probe = Object.freeze({ node: target.renamed, mode });
        const ordinal = scene.nodes.findIndex(
          (node) => node.id === target.renamed,
        );
        const native = Object.entries(aliases).find(
          ([, index]) => index === ordinal,
        )![0];
        const prepared = legacyTextProbe(composition, scene.nodes, probe);
        expect(prepared).toEqual({ node: native, mode });
        expect(prepared).not.toBe(probe);
        expect(probe).toEqual({ node: target.renamed, mode });
        const owners = scopes.filter((scope) =>
          scope.layers.some((layer) => layer.id === native),
        );
        expect(owners).toHaveLength(1);
        expect(owners[0] === composition).toBe(!id.endsWith("nested"));
      }
    const unknown = Object.freeze({
      node: "unknown-probe",
      mode: "ink-only" as const,
    });
    const unchanged = legacyTextProbe(composition, scene.nodes, unknown);
    expect(unchanged).toEqual(unknown);
    expect(unchanged).not.toBe(unknown);
    for (const alias of Object.keys(aliases))
      for (const mode of ["ink-only", "container-only"] as const) {
        expect(scene.nodes.some((node) => node.id === alias)).toBe(false);
        const probe = Object.freeze({ node: alias, mode });
        const prepared = legacyTextProbe(composition, scene.nodes, probe);
        expect(prepared).toEqual({ node: "", mode });
        expect(prepared).not.toBe(probe);
        expect(probe).toEqual({ node: alias, mode });
      }
    expect(scene).toEqual(original);
  },
);
