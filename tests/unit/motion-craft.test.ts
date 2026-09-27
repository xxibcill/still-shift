import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNodeAtTime } from "../../packages/renderer-core/src/prepared-scene.ts";
import { retimeStoryEvents } from "../../packages/renderer-core/src/story-event-index.ts";
import { nodeMatrix } from "../../packages/renderer-core/src/node-transform.ts";
import { transformPoint } from "../../packages/renderer-core/src/node-transform.ts";
import { sampleComponentValue } from "../../packages/renderer-core/src/component-values.ts";
import { sampleTrack } from "../../packages/renderer-core/src/prepared-scene.ts";

function fixture() {
  const source = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion/relationship-build.json",
      "utf8",
    ),
  );
  return {
    ...source,
    motionModel: "curves-1",
    connectors: [],
    recipe: { preset: "generic", moves: [], emphasis: [] },
  };
}
const compile = (source: ReturnType<typeof fixture>) =>
  compileStoryScene(StorySceneSchema.parse(source));
function sample(scene: ReturnType<typeof compile>, id: string, frame: number) {
  return evaluatePreparedNodeAtTime(
    scene,
    scene.nodes.find((n) => n.id === id)!,
    frame,
  );
}

describe("motion craft composition", () => {
  it("solves contact against a rotated surface using the same matrices as drawing", () => {
    const source = fixture();
    delete source.review;
    delete source.camera;
    delete source.flows;
    source.nodes = [
      {
        id: "subject",
        type: "rect",
        x: 200,
        y: 300,
        width: 100,
        height: 80,
        fill: "#ffffff",
        rotation: 12,
      },
      {
        id: "surface",
        type: "rect",
        x: 160,
        y: 120,
        width: 400,
        height: 20,
        fill: "#000000",
        rotation: 25,
      },
    ];
    source.constraints = [
      {
        type: "contact",
        target: "subject",
        surface: "surface",
        point: [0.5, 0],
        solve: ["y"],
      },
    ];
    const scene = compile(source),
      subject = scene.nodes[0]!,
      surface = scene.nodes[1]!;
    const p = transformPoint(
      nodeMatrix(subject, sample(scene, "subject", 20)),
      [50, 0],
    );
    const matrix = nodeMatrix(surface, sample(scene, "surface", 20)),
      a = transformPoint(matrix, [0, 20]),
      b = transformPoint(matrix, [400, 20]);
    expect(
      (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]),
    ).toBeCloseTo(0, 7);
  });
  it("samples lagged linear signals analytically and independently of seek history", () => {
    const source = fixture();
    source.signals = [
      {
        id: "ramp",
        keys: [
          { frame: 0, value: 0 },
          { frame: 40, value: 40, easing: "linear" },
        ],
      },
    ];
    source.drivers = [{ target: "store.x", signal: "ramp", map: { lag: 5 } }];
    const scene = compile(source);
    expect(sample(scene, "store", 10).x).toBeCloseTo(
      10 - 5 + 15 * Math.exp(-4),
      10,
    );
    sample(scene, "store", 40);
    expect(sample(scene, "store", 10).x).toBeCloseTo(
      10 - 5 + 15 * Math.exp(-4),
      10,
    );
  });
  it("inherits consecutive window endpoints, independent of authoring order", () => {
    const source = fixture();
    source.recipe.moves = [
      {
        node: "store",
        window: { start: 20, end: 40, easing: "linear" },
        to: { x: 200 },
      },
      {
        node: "store",
        window: { start: 0, end: 20, easing: "linear" },
        to: { x: 100 },
      },
    ];
    const scene = compile(source);
    expect(sample(scene, "store", 20).x).toBe(100);
    expect(sample(scene, "store", 30).x).toBe(150);
    expect(sample(scene, "store", 40).x).toBe(200);
  });
  it("rejects duplicate replace drivers while allowing additive responses", () => {
    const source = fixture();
    source.signals = [
      {
        id: "pressure",
        keys: [
          { frame: 0, value: 0 },
          { frame: 40, value: 10 },
        ],
      },
    ];
    source.drivers = [
      { target: "store.y", signal: "pressure" },
      { target: "store.y", signal: "pressure" },
    ];
    expect(() => compile(source)).toThrow("motion-conflict");
    source.drivers[1].layer = "response";
    expect(sample(compile(source), "store", 40).y).toBe(20);
  });
  it("uses scene seconds for component and track springs", () => {
    const easing = { spring: { stiffness: 170, damping: 26, mass: 1 } };
    const value = {
      id: "v",
      range: [0, 1] as [number, number],
      from: 0,
      to: 1,
      window: { start: 0, end: 60, easing },
    };
    const keys = [
      { time: 0, value: 0 },
      { time: 60, value: 1, easing },
    ];
    expect(sampleComponentValue(value, 15, 60)).toBe(sampleTrack(keys, 15, 60));
    expect(sampleComponentValue(value, 15, 60)).not.toBe(
      sampleComponentValue(value, 15, 24),
    );
  });
  it("compensates anchor movement without shifting transformed artwork", () => {
    const scene = compile(fixture()),
      node = scene.nodes.find((n) => n.id === "store")!;
    const pose = {
      ...sample(scene, "store", 0),
      rotation: 35,
      scaleX: 1.2,
      scaleY: 0.8,
    };
    const before = nodeMatrix(node, pose),
      after = nodeMatrix(node, { ...pose, anchorX: 0.1, anchorY: 0.9 });
    before.forEach((v, i) => expect(after[i]).toBeCloseTo(v, 10));
  });
  it("composes action, response, current and carrier in order with weight ducking", () => {
    const source = fixture();
    source.recipe.moves = [
      {
        node: "store",
        keys: [
          { frame: 0, y: 100 },
          { frame: 40, y: 200, easing: "linear" },
        ],
      },
      {
        node: "store",
        layer: "response",
        keys: [
          { frame: 0, y: 0 },
          { frame: 40, y: 20, easing: "linear" },
        ],
      },
      {
        node: "store",
        layer: "carrier",
        keys: [
          { frame: 0, y: 10 },
          { frame: 40, y: 10 },
        ],
        weight: [
          { frame: 0, value: 1 },
          { frame: 40, value: 0, easing: "linear" },
        ],
      },
      {
        node: "store",
        layer: "response",
        to: { scale: 0.5 },
        window: { start: 0, end: 40, easing: "linear" },
      },
    ];
    const scene = compile(source);
    expect(sample(scene, "store", 20).y).toBe(165);
    expect(sample(scene, "store", 20).scaleY).toBe(0.75);
    expect(scene.rendererVersion).toBe("story-canvas-0.19.0");
    for (const frame of [40, 3, 20, 0, 20])
      expect(sample(scene, "store", frame)).toEqual(
        sample(scene, "store", frame),
      );
    source.recipe.moves.push({
      node: "store",
      window: { start: 4, end: 30 },
      to: { y: 25 },
    });
    expect(() => compile(source)).toThrow("motion-conflict");
  });
  it("keeps legacy conflicts and rejects use without opt-in", () => {
    const source = fixture();
    delete source.motionModel;
    expect(() => compile(source)).toThrow("motion-opt-in");
    const legacy = JSON.parse(
      readFileSync(
        "benchmarks/fixtures/story-motion/relationship-build.json",
        "utf8",
      ),
    );
    legacy.recipe.moves = [
      { node: "store", window: { start: 20, end: 40 }, to: { x: 20 } },
      { node: "store", window: { start: 30, end: 50 }, to: { x: 30 } },
    ];
    expect(() => compileStoryScene(legacy)).toThrow("Conflicting story events");
  });
  it("drives related nodes from one signal and retimes the whole signal", () => {
    const source = fixture();
    source.signals = [
      {
        id: "pressure",
        cue: "press",
        keys: [
          { frame: 0, value: 0 },
          { frame: 40, value: 80, easing: "linear" },
        ],
      },
    ];
    const target = source.nodes.find(
      (n: { id: string }) =>
        n.id !== "store" &&
        n.id !== "paper" &&
        !(n as { parent?: string }).parent,
    )!.id;
    source.drivers = [
      { target: "store.y", signal: "pressure", map: { offset: 100 } },
      {
        target: target + ".y",
        signal: "pressure",
        map: { clamp: [0, 20], offset: 200 },
      },
    ];
    let scene = compile(source);
    expect(sample(scene, "store", 20).y).toBe(140);
    expect(sample(scene, target, 20).y).toBe(220);
    retimeStoryEvents(source, [], {}, { press: { start: 20, end: 60 } });
    scene = compile(source);
    expect(sample(scene, "store", 20).y).toBe(100);
    expect(sample(scene, "store", 40).y).toBe(140);
    source.drivers = [
      { target: "store.y", source: target + ".y" },
      { target: target + ".y", source: "store.y" },
    ];
    expect(() => compile(source)).toThrow("motion-cycle");
  });
  it("keeps seeded carriers independent of playback order and clamps the final result", () => {
    const source = fixture();
    source.periodic = [
      {
        node: "store",
        property: "y",
        start: 0,
        end: 100,
        noise: { seed: 37, period: 14, amplitude: 4 },
      },
      {
        node: "store",
        property: "opacity",
        start: 0,
        end: 100,
        oscillate: { period: 30, amplitude: 10 },
      },
    ];
    const scene = compile(source),
      values = Array.from({ length: 101 }, (_, frame) =>
        sample(scene, "store", frame),
      );
    for (let frame = 100; frame >= 0; frame--) {
      expect(sample(scene, "store", frame)).toEqual(values[frame]);
      expect(values[frame]!.opacity).toBeGreaterThanOrEqual(0);
      expect(values[frame]!.opacity).toBeLessThanOrEqual(1);
    }
  });
});
