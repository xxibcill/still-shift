import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PreparedSceneSchema } from "../../packages/scene-contract/src/prepared.ts";
import {
  compilePreparedScene,
  evaluatePreparedNode,
} from "../../packages/renderer-core/src/prepared-scene.ts";

const scene = () => ({
  schemaVersion: "illustrated-scene-1",
  title: "A restricted route",
  durationMs: 7000,
  fps: 24,
  assets: [
    {
      id: "kit",
      path: "kit.png",
      sha256: `sha256:${"a".repeat(64)}`,
      width: 100,
      height: 100,
    },
  ],
  nodes: [
    {
      id: "route",
      type: "path",
      points: [
        [100, 300],
        [900, 300],
      ],
      stroke: "#59664d",
      lineWidth: 12,
      gapAt: 0.65,
    },
    {
      id: "token",
      type: "image",
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      states: [{ asset: "kit" }],
    },
    {
      id: "barrier",
      type: "rect",
      x: 610,
      y: 260,
      width: 20,
      height: 80,
      fill: "#8b3f36",
    },
  ],
  recipe: {
    preset: "access_pressure",
    route: "route",
    token: "token",
    barrier: "barrier",
    stopAt: 0.55,
  },
});

describe("prepared scenes", () => {
  it("uses the explicit frame rate and holds a token before the blocked interval", () => {
    const compiled = compilePreparedScene(PreparedSceneSchema.parse(scene()));
    expect(compiled.timeline.frameCount).toBe(168);
    const node = compiled.nodes.find((item) => item.id === "token")!;
    const last = evaluatePreparedNode(compiled, node, 167);
    expect(last.x + 20).toBeCloseTo(540);
    expect(last.x + 40).toBeLessThan(580);
    expect(evaluatePreparedNode(compiled, node, 30)).toEqual(
      evaluatePreparedNode(compiled, node, 30),
    );
    expect(() => evaluatePreparedNode(compiled, node, 168)).toThrow();
  });
  it("rejects missing semantic assets rather than making a still", () => {
    const input = scene();
    input.recipe.route = "absent";
    expect(PreparedSceneSchema.safeParse(input).success).toBe(false);
  });
  it("rejects conflicting role bindings and a zero-travel layered reveal", () => {
    const duplicateRole = scene();
    duplicateRole.recipe.barrier = "token";
    expect(PreparedSceneSchema.safeParse(duplicateRole).success).toBe(false);
    expect(
      PreparedSceneSchema.safeParse({
        ...scene(),
        recipe: {
          preset: "chronicle_reveal",
          foreground: "token",
          middle: "route",
          reveal: "barrier",
          travel: 0,
        },
      }).success,
    ).toBe(false);
  });
  it("supports valid IDs that match JavaScript object properties after serialization", () => {
    const input = scene();
    input.nodes[1]!.id = "constructor";
    input.recipe.token = "constructor";
    const compiled = compilePreparedScene(PreparedSceneSchema.parse(input));
    const restored = JSON.parse(JSON.stringify(compiled)) as typeof compiled;
    expect(Object.hasOwn(restored.tracks, "constructor")).toBe(true);
    expect(evaluatePreparedNode(restored, restored.nodes[1]!, 0).opacity).toBe(
      0,
    );
    expect(
      evaluatePreparedNode(restored, restored.nodes[1]!, 167).x,
    ).toBeCloseTo(520);
  });
  it("rejects duplicate IDs, cyclic parents, invalid crops and crossed stop points", () => {
    const duplicate = scene();
    duplicate.nodes[1]!.id = "route";
    expect(PreparedSceneSchema.safeParse(duplicate).success).toBe(false);
    const badStop = scene();
    badStop.recipe.stopAt = 0.8;
    expect(PreparedSceneSchema.safeParse(badStop).success).toBe(false);
    const crop = scene();
    Object.assign(crop.nodes[1]!, {
      states: [{ asset: "kit", crop: [80, 0, 100, 100] }],
    });
    expect(PreparedSceneSchema.safeParse(crop).success).toBe(false);
    const cycle = {
      ...scene(),
      nodes: [
        { id: "one", type: "group", parent: "two", width: 100, height: 100 },
        { id: "two", type: "group", parent: "one", width: 100, height: 100 },
        ...scene().nodes,
      ],
    };
    expect(PreparedSceneSchema.safeParse(cycle).success).toBe(false);
  });
  it("requires a second authored state for prop change", () => {
    const input = {
      ...scene(),
      recipe: {
        preset: "pose_prop_change",
        actor: "token",
        prop: "barrier",
        target: [500, 300],
      },
    };
    expect(PreparedSceneSchema.safeParse(input).success).toBe(false);
  });
  it("changes every planned scene and preserves authored contact across random seeking", () => {
    const ids = [
      "chronicle-reveal",
      "resource-flow",
      "access-pressure",
      "comparison-build",
      "pose-prop-change",
      "crisis-fracture",
    ];
    for (const id of ids) {
      const input = PreparedSceneSchema.parse(
        JSON.parse(
          readFileSync(
            resolve(`benchmarks/fixtures/history-offstage-v2/${id}.json`),
            "utf8",
          ),
        ),
      );
      for (const fps of [24, 30] as const) {
        const compiled = compilePreparedScene({ ...input, fps });
        const initial = compiled.nodes.map((node) =>
          evaluatePreparedNode(compiled, node, 0),
        );
        const final = compiled.nodes.map((node) =>
          evaluatePreparedNode(
            compiled,
            node,
            compiled.timeline.frameCount - 1,
          ),
        );
        expect(final).not.toEqual(initial);
        const actor = compiled.nodes.find((node) => node.id === "bowl");
        if (id === "pose-prop-change" && actor) {
          const contact = Math.ceil(3.7 * fps);
          expect(evaluatePreparedNode(compiled, actor, contact - 1).state).toBe(
            0,
          );
          expect(evaluatePreparedNode(compiled, actor, contact).state).toBe(1);
          const prop = compiled.nodes.find((node) => node.id === "portion")!;
          expect(evaluatePreparedNode(compiled, prop, contact).opacity).toBe(0);
          expect(evaluatePreparedNode(compiled, actor, 0).state).toBe(0);
        }
      }
    }
  });
});
