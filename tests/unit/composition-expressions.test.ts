import { describe, expect, it } from "vitest";
import {
  behaviourExpressions,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
  evaluateStageProperties,
  evaluateStageProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { PassageError } from "../../packages/renderer-core/src/passage-diagnostics.ts";

type Doc = Record<string, unknown> & { layers: Record<string, unknown>[] };
const solid = (id: string, extra: object = {}) => ({
  id,
  type: "solid",
  size: [10, 10],
  color: "#808080",
  ...extra,
});
const base = (extra: object = {}): Doc => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 200,
  height: 200,
  fps: 30,
  frameCount: 60,
  assets: [],
  layers: [
    solid("lead", {
      transform: {
        position: {
          keys: [
            { frame: 0, value: [0, 0] },
            { frame: 30, value: [90, 30], interpolation: "linear" },
          ],
        },
        rotation: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 30, value: 90, interpolation: "linear" },
          ],
        },
      },
    }),
    solid("a"),
    solid("b"),
  ],
  ...extra,
});
const comp = (extra: object = {}) => {
  const result = validateComposition(base(extra));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.composition;
};
const diagnostics = (doc: object) =>
  validateComposition(doc).diagnostics.filter((d) => d.severity === "error");
const expressions = (map: Record<string, string>) => ({
  expressions: Object.fromEntries(
    Object.entries(map).map(([target, source]) => [target, { source }]),
  ),
});
const value = (c: Composition, path: string, time: number) =>
  evaluateProperty(c, path, time);
const thrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof PassageError) return error.diagnostics[0];
    throw error;
  }
  throw new Error("expected an evaluation error");
};

describe("expression validation", () => {
  it("accepts valid expressions and reports source diagnostics with columns", () => {
    expect(
      diagnostics(base(expressions({ "a.transform.rotation": "time * 10" }))),
    ).toEqual([]);
    expect(
      diagnostics(base(expressions({ "a.transform.rotation": "time *" }))),
    ).toEqual([
      expect.objectContaining({
        code: "comp-expression-syntax",
        path: 'expressions["a.transform.rotation"].source',
        column: 7,
      }),
    ]);
  });

  it("checks targets: existence, read-only, discrete and overlap", () => {
    expect(
      diagnostics(base(expressions({ "z.transform.rotation": "1" }))),
    ).toEqual([
      expect.objectContaining({
        code: "comp-path-layer",
        path: 'expressions["z.transform.rotation"]',
      }),
    ]);
    expect(
      diagnostics(
        base({
          ...expressions({ "comp.camera.x": "1" }),
          camera2d: {
            keys: [
              { frame: 0, x: 100, y: 100, zoom: 1 },
              { frame: 10, x: 100, y: 100, zoom: 1 },
            ],
          },
        }),
      ),
    ).toEqual([expect.objectContaining({ code: "comp-path-readonly" })]);
    expect(
      diagnostics(
        base({
          layers: [
            {
              id: "img",
              type: "image",
              size: [10, 10],
              sources: [{ asset: "pic" }],
            },
          ],
          assets: [
            {
              id: "pic",
              type: "image",
              path: "p.png",
              sha256: `sha256:${"0".repeat(64)}`,
              width: 10,
              height: 10,
            },
          ],
          ...expressions({ "img.state": "1" }),
        }),
      ),
    ).toEqual([expect.objectContaining({ code: "comp-expression-type" })]);
    expect(
      diagnostics(
        base(
          expressions({
            "a.transform.position": "value",
            "a.transform.position.x": "1",
          }),
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        code: "comp-expression-overlap",
        path: 'expressions["a.transform.position.x"]',
      }),
    ]);
    // Sibling components and legacy aliases are distinct, canonical targets.
    expect(
      diagnostics(
        base(expressions({ "a.x": "1", "a.transform.position.y": "2" })),
      ),
    ).toEqual([]);
    expect(
      diagnostics(
        base(expressions({ "a.x": "1", "a.transform.position.x": "2" })),
      ),
    ).toEqual([expect.objectContaining({ code: "comp-expression-overlap" })]);
  });

  it("validates a supplied AST against the source", () => {
    const ok = base({
      expressions: {
        "a.transform.rotation": {
          source: "wiggle(2, 6, 7)",
          ast: { call: "wiggle", args: [{ num: 2 }, { num: 6 }, { num: 7 }] },
        },
      },
    });
    expect(diagnostics(ok)).toEqual([]);
    const bad = base({
      expressions: {
        "a.transform.rotation": { source: "wiggle(2, 6, 7)", ast: { num: 1 } },
      },
    });
    expect(diagnostics(bad)).toEqual([
      expect.objectContaining({
        code: "comp-expression-mismatch",
        path: 'expressions["a.transform.rotation"].ast',
      }),
    ]);
  });

  it("rejects same-time, self, self-delayed and mutually delayed cycles", () => {
    const cycle = (map: Record<string, string>) =>
      diagnostics(base(expressions(map))).map((d) => d.code);
    expect(
      cycle({ "a.transform.rotation": "ref('a.transform.rotation')" }),
    ).toEqual(["comp-expression-cycle"]);
    expect(
      cycle({
        "a.transform.rotation": "valueAtTime('a.transform.rotation', time - 1)",
      }),
    ).toEqual(["comp-expression-cycle"]);
    expect(
      cycle({
        "a.transform.position": "ref('a.transform.position.x') + [0, 0]",
      }),
    ).toEqual(["comp-expression-cycle"]);
    expect(
      cycle({
        "a.transform.rotation":
          "valueAtTime('b.transform.rotation', time - 0.5)",
        "b.transform.rotation":
          "velocityAtTime('a.transform.rotation', time - 1)",
      }),
    ).toEqual(["comp-expression-cycle"]);
    expect(
      cycle({
        "a.transform.rotation": "ref('b.transform.rotation')",
        "b.transform.rotation": "ref('lead.transform.rotation')",
        "lead.transform.rotation": "ref('a.transform.rotation')",
      }),
    ).toEqual(["comp-expression-cycle"]);
  });

  it("rejects mixed expression, driver, constraint and auto-orient cycles", () => {
    // Driver on b reads a; a's expression reads b's stage, which runs b's drivers.
    expect(
      diagnostics(
        base({
          ...expressions({
            "a.transform.rotation": "ref('b.transform.rotation')",
          }),
          drivers: [
            { target: "b.transform.rotation", source: "a.transform.rotation" },
          ],
        }),
      ).map((d) => d.code),
    ).toEqual(["comp-expression-cycle"]);
    // Constraint (full layer) → expression (stage) → driver (full layer) → constraint.
    expect(
      diagnostics(
        base({
          ...expressions({
            "b.transform.rotation": "ref('a.transform.position').x",
          }),
          constraints: [{ type: "look-at", target: "lead", toward: "b" }],
          drivers: [
            {
              target: "a.transform.position.x",
              source: "lead.transform.rotation",
            },
          ],
        }),
      ).map((d) => d.code),
    ).toContain("comp-expression-cycle");
    // Auto-orient reads the layer's own position path.
    expect(
      diagnostics(
        base({
          layers: [
            solid("lead", { transform: { autoOrient: "path" } }),
            solid("a"),
          ],
          ...expressions({
            "a.transform.rotation": "ref('lead.transform.position').x",
          }),
          drivers: [
            {
              target: "lead.transform.position.x",
              source: "a.transform.rotation",
            },
          ],
        }),
      ).map((d) => d.code),
    ).toEqual(["comp-expression-cycle"]);
  });

  it("allows earlier-time reads across an acyclic graph, including own other properties", () => {
    const c = comp(
      expressions({
        "a.transform.rotation":
          "valueAtTime('lead.transform.rotation', time - 10 / fps)",
        "b.transform.rotation":
          "ref('a.transform.rotation') + valueAtTime('a.transform.rotation', time - 1)",
        "b.transform.position": "ref('b.transform.rotation') * [1, 2]",
        "lead.transform.scale":
          "[1, 1] + velocityAtTime('lead.transform.rotation', time) / 100",
      }),
    );
    expect(value(c, "a.transform.rotation", 20)).toBeCloseTo(30, 10);
    expect(value(c, "a.transform.rotation", 5)).toBe(0);
    expect(value(c, "b.transform.rotation", 20)).toBeCloseTo(30 + 0, 10);
    // a(50) = lead(40) = 90; a one second earlier = a(20) = lead(10) = 30.
    expect(value(c, "b.transform.rotation", 50)).toBeCloseTo(90 + 30, 10);
    expect(value(c, "b.transform.position", 50)).toEqual([120, 240]);
    expect((value(c, "lead.transform.scale", 10) as number[])[0]).toBeCloseTo(
      1 + 90 / 100,
      10,
    );
  });

  it("limits the compiled expression count, including behaviours", () => {
    const layers = Array.from({ length: 200 }, (_, i) => solid(`l${i}`));
    const doc = base({
      layers,
      behaviours: Array.from({ length: 2 }, () => ({
        type: "stagger",
        layers: layers.map((l) => l.id),
        properties: [
          "transform.position.x",
          "transform.position.y",
          "transform.rotation",
          "transform.opacity",
          "transform.skewX",
          "transform.skewY",
        ],
        offsetFrames: 1,
      })),
    });
    expect(diagnostics(doc).map((d) => d.code)).toEqual(["comp-limit"]);
  });
});

describe("expression evaluation", () => {
  it("evaluates only the selected if branch, like the ternary operator", () => {
    const c = comp(
      expressions({
        "a.transform.rotation": "if(frame < 10, 1, valueAtTime(10000))",
        "b.transform.position": "if(frame >= 10, valueAtTime(10000), [2, 3])",
      }),
    );
    expect(value(c, "a.transform.rotation", 0)).toBe(1);
    expect(value(c, "b.transform.position", 0)).toEqual([2, 3]);
    expect(thrown(() => value(c, "a.transform.rotation", 10))).toMatchObject({
      code: "comp-evaluation-time",
    });
    expect(thrown(() => value(c, "b.transform.position", 10))).toMatchObject({
      code: "comp-evaluation-time",
    });
  });

  it("evaluates identifiers and arithmetic in the root clock", () => {
    const c = comp(
      expressions({
        "a.transform.rotation":
          "time * 100 + frame + fps / 100 + index * 1000 + layerCount * 10000",
        "a.transform.position": "value + [1, 2] * 3 - [0.5, 0.5]",
        "b.transform.opacity": "frame % 7 / 10",
      }),
    );
    expect(value(c, "a.transform.rotation", 15)).toBeCloseTo(
      50 + 15 + 0.3 + 2000 + 30000,
      9,
    );
    expect(value(c, "a.transform.position", 3)).toEqual([2.5, 5.5]);
    expect(value(c, "b.transform.opacity", 10)).toBeCloseTo(0.3, 12);
  });

  it("clamps written values like motion craft and rejects non-finite results", () => {
    const c = comp(
      expressions({
        "a.transform.opacity": "2",
        "b.transform.rotation": "1 / (frame - 3)",
      }),
    );
    expect(value(c, "a.transform.opacity", 0)).toBe(1);
    expect(thrown(() => evaluateComp(c, 3))).toMatchObject({
      code: "comp-expression-value",
      frame: 3,
    });
    expect(evaluateComp(c, 4).layers[2]!.transform.rotation).toBe(1);
  });

  it("reads the expression stage: keys, motion craft and expressions, not constraints", () => {
    const c = comp({
      ...expressions({ "b.transform.position": "ref('a.transform.position')" }),
      drivers: [{ target: "a.transform.position.x", signal: "s" }],
      signals: [
        {
          id: "s",
          keys: [
            { frame: 0, value: 7 },
            { frame: 10, value: 7 },
          ],
        },
      ],
      constraints: [{ type: "attach", target: "a", anchor: "lead" }],
    });
    const tree = evaluateComp(c, 10);
    expect(tree.layers[1]!.transform.position[0]).not.toBe(7); // constraint moved a
    expect(tree.layers[2]!.transform.position).toEqual([7, 0]);
    expect(evaluateStageProperty(c, "a.transform.position", 10).value).toEqual([
      7, 0,
    ]);
  });

  it("stage reads exclude constraints even when nothing seals the stage", () => {
    // No expressions: a driver evaluates the constrained layer first in the session.
    const c = comp({
      signals: [
        {
          id: "s",
          keys: [
            { frame: 0, value: 3 },
            { frame: 10, value: 3 },
          ],
        },
      ],
      drivers: [
        { target: "b.transform.rotation", source: "a.transform.position.x" },
        { target: "a.transform.position.y", signal: "s" },
      ],
      constraints: [{ type: "attach", target: "a", anchor: "lead" }],
    });
    const [rotation, position] = evaluateStageProperties(
      c,
      ["b.transform.rotation", "a.transform.position"],
      10,
    );
    expect(rotation!.value).not.toBe(0);
    expect(position!.value).toEqual([0, 3]);
    expect(evaluateStageProperty(c, "a.transform.position", 10).value).toEqual([
      0, 3,
    ]);
  });

  it("is pure: random seeks equal forward evaluation (fixed seed)", () => {
    const c = comp({
      ...expressions({
        "a.transform.position":
          "spring('lead.transform.position', 2, 0.4, 0.1)",
        "a.transform.rotation": "wiggle(3, 20, 5, 3) + smooth(0.3, 7)",
        "b.transform.position":
          "value + [inertia(0.1, 2, 5).x, 0] + anticipate(6, 0.2)",
        "b.transform.rotation":
          "heading('a.transform.position') + noise(2, time) + random(3, frame)",
      }),
    });
    const forward = Array.from({ length: 60 }, (_, t) => evaluateComp(c, t));
    let state = 0x5eed;
    for (let i = 0; i < 120; i++) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      const t = state % 60;
      expect(evaluateComp(c, t)).toEqual(forward[t]);
    }
  });

  it("wiggle, noise and random are seeded, bounded and stable", () => {
    const c = comp(
      expressions({
        "a.transform.rotation": "wiggle(2, 10, 4)",
        "b.transform.rotation": "wiggle(2, 10, 5)",
      }),
    );
    const samples = Array.from({ length: 60 }, (_, t) =>
      evaluateComp(c, t)
        .layers.slice(1)
        .map((l) => l.transform.rotation),
    );
    for (const [a, b] of samples) {
      expect(Math.abs(a!)).toBeLessThanOrEqual(10);
      expect(Math.abs(b!)).toBeLessThanOrEqual(10);
    }
    expect(samples.some(([a, b]) => a !== b)).toBe(true);
    expect(samples[17]![0]).toBe(
      evaluateComp(c, 17).layers[1]!.transform.rotation,
    );
    const r = comp(
      expressions({
        "a.transform.rotation": "random(9, frame)",
        "b.transform.rotation": "noise(9, time * 4)",
      }),
    );
    for (let t = 0; t < 60; t++) {
      const [ra, nb] = evaluateComp(r, t)
        .layers.slice(1)
        .map((l) => l.transform.rotation);
      expect(ra).toBeGreaterThanOrEqual(0);
      expect(ra).toBeLessThan(1);
      expect(Math.abs(nb!)).toBeLessThanOrEqual(1);
    }
  });

  it("interpolation helpers", () => {
    const c = comp(
      expressions({
        "a.transform.rotation": "linear(frame, 10, 20, 0, 100)",
        "b.transform.rotation":
          "ease(frame, 10, 20, 0, 100) + easeIn(0.5, 0, 10) * 1000 + easeOut(0.5, 0, 10) * 100000",
        "a.transform.position":
          "mix([0, 0], [10, 20], 0.25) + clamp([5, -5], 0, 3)",
        "b.transform.position":
          "[step(10, frame), if(frame > 10, 1, 2)] + normalize([3, 4]) * length([0, 0], [6, 8])",
        "lead.transform.rotation":
          "lookAt([0, 0], [0, 10]) + degrees(atan2(1, 1)) + round(-2.5) + abs(-1) + sign(-3) + floor(1.7) + ceil(1.2) + min(4, 2) + max(4, 9) + pow(2, 3) + sqrt(16) + exp(0) + log(1)",
      }),
    );
    expect(value(c, "a.transform.rotation", 5)).toBe(0);
    expect(value(c, "a.transform.rotation", 15)).toBe(50);
    expect(value(c, "a.transform.rotation", 25)).toBe(100);
    expect(value(c, "b.transform.rotation", 15)).toBeCloseTo(
      50 + 2500 + 750000,
      6,
    );
    expect(value(c, "a.transform.position", 0)).toEqual([5.5, 5]);
    expect(value(c, "b.transform.position", 12)).toEqual([7, 9]);
    expect(value(c, "lead.transform.rotation", 0)).toBeCloseTo(
      90 + 45 - 3 + 1 - 1 + 1 + 2 + 2 + 9 + 8 + 4 + 1 + 0,
      10,
    );
  });

  it("valueAtTime and velocityAtTime snap seconds to frames and use ±1 frame differences", () => {
    const c = comp(
      expressions({
        "a.transform.rotation":
          "valueAtTime('lead.transform.rotation', (frame - 6) / fps)",
        "b.transform.rotation":
          "velocityAtTime('lead.transform.rotation', time)",
        "b.transform.position":
          "velocityAtTime('lead.transform.position', time)",
      }),
    );
    expect(value(c, "a.transform.rotation", 13)).toBe(21);
    expect(value(c, "b.transform.rotation", 10)).toBeCloseTo(90, 9);
    expect(value(c, "b.transform.rotation", 30)).toBeCloseTo(45, 9);
    expect(value(c, "b.transform.position", 10)).toEqual([
      expect.closeTo(90, 9),
      expect.closeTo(30, 9),
    ]);
    const far = comp(
      expressions({
        "a.transform.rotation": "valueAtTime('lead.transform.rotation', 1e9)",
      }),
    );
    expect(thrown(() => evaluateComp(far, 0))).toMatchObject({
      code: "comp-evaluation-time",
    });
  });

  it("own pre-expression reads: value history, smoothing and velocity", () => {
    const c = comp(
      expressions({
        "lead.transform.rotation": "valueAtTime(time - 0.5) + 1000",
        "lead.transform.position": "smooth(0.2, 3)",
        "a.transform.rotation": "ref('lead.transform.rotation')",
      }),
    );
    expect(value(c, "lead.transform.rotation", 25)).toBe(1030);
    expect(value(c, "a.transform.rotation", 25)).toBe(1030);
    // Mean of frames 22, 25 and 28 on a linear segment equals frame 25.
    expect(value(c, "lead.transform.position", 25)).toEqual([75, 25]);
    // At the key, the window straddles the stop: (81 + 90 + 90) / 3.
    expect(
      (value(c, "lead.transform.position", 30) as number[])[0],
    ).toBeCloseTo(87, 10);
    const v = comp(
      expressions({ "lead.transform.rotation": "velocityAtTime(time)" }),
    );
    expect(value(v, "lead.transform.rotation", 10)).toBeCloseTo(90, 9);
  });

  it("loops repeat own keys and keep motion-craft offsets", () => {
    const keys = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 10, value: 10, interpolation: "linear" },
        { frame: 20, value: 0, interpolation: "linear" },
      ],
    };
    const doc = (source: string) =>
      comp({
        layers: [solid("lead", { transform: { rotation: keys } }), solid("a")],
        ...expressions({ "lead.transform.rotation": source }),
      });
    const at = (source: string, t: number) =>
      value(doc(source), "lead.transform.rotation", t);
    expect(at("loopOut()", 25)).toBe(5);
    expect(at("loopOut('cycle')", 35)).toBe(5);
    expect(at("loopOut('pingpong')", 25)).toBe(5);
    expect(at("loopOut('pingpong')", 45)).toBe(5);
    expect(at("loopOut('cycle', 1)", 25)).toBe(5);
    expect(at("loopOut('offset', 1)", 25)).toBe(-5);
    expect(at("loopOut('continue')", 25)).toBeCloseTo(-5, 9);
    expect(at("loopOut()", 15)).toBe(5);
    const shifted = comp({
      layers: [
        solid("lead", { startFrame: 10, transform: { rotation: keys } }),
        solid("a"),
      ],
      ...expressions({ "lead.transform.rotation": "loopIn('cycle')" }),
    });
    expect(value(shifted, "lead.transform.rotation", 5)).toBe(5);
    const driven = comp({
      layers: [solid("lead", { transform: { rotation: keys } }), solid("a")],
      ...expressions({ "lead.transform.rotation": "loopOut()" }),
      signals: [
        {
          id: "s",
          keys: [
            { frame: 0, value: 100 },
            { frame: 59, value: 100 },
          ],
        },
      ],
      drivers: [
        { target: "lead.transform.rotation", signal: "s", layer: "current" },
      ],
    });
    expect(value(driven, "lead.transform.rotation", 25)).toBe(105);
  });

  it("spring follows its input exactly at rest and converges", () => {
    const c = comp(
      expressions({
        "a.transform.position": "spring('lead.transform.position', 1.5, 0.3)",
        "b.transform.position": "spring('lead.transform.position', 2, 1, 0.2)",
      }),
    );
    expect(value(c, "a.transform.position", 0)).toEqual([0, 0]);
    const late = comp({
      ...expressions({
        "a.transform.position": "spring('lead.transform.position', 1.5, 0.3)",
      }),
      frameCount: 600,
    });
    const settled = value(late, "a.transform.position", 590) as number[];
    expect(settled[0]).toBeCloseTo(90, 6);
    expect(settled[1]).toBeCloseTo(30, 6);
    // Underdamped springs overshoot the stop; critically damped springs do not.
    const overshoot = Math.max(
      ...Array.from(
        { length: 30 },
        (_, i) => (value(c, "a.transform.position", 30 + i) as number[])[0]!,
      ),
    );
    expect(overshoot).toBeGreaterThan(90);
    const critical = Math.max(
      ...Array.from(
        { length: 30 },
        (_, i) => (value(c, "b.transform.position", 30 + i) as number[])[0]!,
      ),
    );
    expect(critical).toBeLessThanOrEqual(90 + 1e-9);
    // Compare against fine explicit integration of the same delayed input.
    const omega = 2 * Math.PI * 1.5,
      zeta = 0.3,
      dt = 1 / 30 / 2000;
    let x = 0,
      v = 0;
    for (let i = 0; i < 2000 * 40; i++) {
      const t = (i + 0.5) * dt * 30;
      const u = Math.min(90, Math.max(0, t * 3));
      const a = omega * omega * (u - x) - 2 * zeta * omega * v;
      v += a * dt;
      x += v * dt;
    }
    expect((value(c, "a.transform.position", 40) as number[])[0]).toBeCloseTo(
      x,
      2,
    );
    expect(
      thrown(() =>
        evaluateComp(
          comp(
            expressions({
              "a.transform.rotation": "spring('lead.transform.rotation', 0, 1)",
            }),
          ),
          5,
        ),
      ),
    ).toMatchObject({
      code: "comp-expression-value",
    });
  });

  it("inertia overshoots after keyed stops; anticipation pulls back before moves", () => {
    const keys = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 10, value: 30, interpolation: "linear" },
        { frame: 30, value: 30 },
        { frame: 40, value: 0, interpolation: "linear" },
      ],
    };
    const c = comp({
      layers: [
        solid("lead", { transform: { rotation: keys } }),
        solid("a", { transform: { rotation: keys } }),
      ],
      ...expressions({
        "lead.transform.rotation": "value + inertia(0.1, 2, 4)",
        "a.transform.rotation": "value + anticipate(5, 0.2)",
      }),
    });
    const v = 90; // degrees/second arriving at frame 10
    const tau = 5 / 30;
    expect(value(c, "lead.transform.rotation", 15)).toBeCloseTo(
      30 + (v * 0.1 * Math.sin(2 * Math.PI * 2 * tau)) / Math.exp(4 * tau),
      6,
    );
    expect(value(c, "lead.transform.rotation", 5)).toBe(15);
    // Six frames of anticipation before frame 30, moving towards 0 (pull back upward).
    expect(value(c, "a.transform.rotation", 27)).toBeCloseTo(
      30 + 5 * Math.sin(Math.PI * 0.5),
      9,
    );
    expect(value(c, "a.transform.rotation", 23)).toBe(30);
    expect(value(c, "a.transform.rotation", 30)).toBeCloseTo(30, 9);
    expect(value(c, "a.transform.rotation", 5)).toBe(15);
  });

  it("rove moves at constant speed along the keyed path", () => {
    const c = comp({
      layers: [
        solid("lead", {
          transform: {
            position: {
              keys: [
                { frame: 0, value: [0, 0] },
                { frame: 5, value: [100, 0] },
                { frame: 40, value: [100, 100] },
              ],
            },
          },
        }),
        solid("a"),
      ],
      behaviours: [
        { type: "constant-speed", target: "lead.transform.position" },
      ],
    });
    expect(value(c, "lead.transform.position", 20)).toEqual([100, 0]);
    const p = value(c, "lead.transform.position", 30) as number[];
    expect(p[0]).toBeCloseTo(100, 9);
    expect(p[1]).toBeCloseTo(50, 9);
  });

  it("heading, auto-orient and squash", () => {
    const c = comp({
      layers: [
        solid("lead", {
          transform: {
            autoOrient: "path",
            position: {
              keys: [
                { frame: 0, value: [0, 0] },
                { frame: 30, value: [0, 90], interpolation: "linear" },
              ],
            },
          },
        }),
        solid("a"),
        solid("b"),
      ],
      ...expressions({
        "lead.transform.rotation": "5",
        "a.transform.rotation": "heading('lead.transform.position')",
        "a.transform.scale": "squash([300, 400], 0.001, 2)",
        "b.transform.scale":
          "squash(velocityAtTime('lead.transform.position', time), 0.001, 1.05, true)",
        "b.transform.rotation": "ref('lead.transform.rotation')",
      }),
    });
    const tree = evaluateComp(c, 10);
    expect(tree.layers[0]!.transform.rotation).toBeCloseTo(95, 9);
    expect(tree.layers[2]!.transform.rotation).toBe(5); // reads exclude auto-orient
    expect(tree.layers[1]!.transform.rotation).toBeCloseTo(90, 9);
    // After the move stops, heading holds the last direction of travel.
    expect(evaluateComp(c, 50).layers[1]!.transform.rotation).toBeCloseTo(
      90,
      9,
    );
    const [sx, sy] = tree.layers[1]!.transform.scale;
    expect(sx! * sy!).toBeCloseTo(1, 12);
    expect(sx).toBeCloseTo(1.5 ** (0.36 - 0.64), 12);
    expect(tree.layers[2]!.transform.scale).toEqual([1.05, 1 / 1.05]);
  });

  it("signal() reads composition signals at the root time", () => {
    const c = comp({
      signals: [
        {
          id: "beat",
          keys: [
            { frame: 0, value: 0 },
            { frame: 20, value: 10 },
          ],
        },
      ],
      ...expressions({ "a.transform.rotation": "signal('beat') * 2" }),
    });
    expect(value(c, "a.transform.rotation", 10)).toBeCloseTo(10, 9);
  });
});

describe("expressions across precomp instances", () => {
  const clip = (id: string, fps?: number) => ({
    id,
    width: 100,
    height: 100,
    frameCount: 30,
    ...(fps ? { fps } : {}),
    layers: [
      solid("hero", {
        transform: {
          opacity: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 29, value: 1, interpolation: "linear" },
            ],
          },
        },
      }),
    ],
  });
  const precomps = (extra: object = {}) =>
    comp({
      frameCount: 30,
      precomps: [
        clip("clip"),
        clip("clip60", 60),
        {
          id: "outer",
          width: 100,
          height: 100,
          frameCount: 30,
          layers: [
            { id: "inner", type: "precomp", comp: "clip", startFrame: 5 },
          ],
        },
      ],
      layers: [
        { id: "intro", type: "precomp", comp: "clip", outPoint: 30 },
        {
          id: "outro",
          type: "precomp",
          comp: "clip",
          startFrame: 29,
          stretch: -1,
        },
        { id: "slow", type: "precomp", comp: "clip", stretch: 2 },
        {
          id: "remapped",
          type: "precomp",
          comp: "clip",
          timeRemap: {
            keys: [
              { frame: 0, value: 20 },
              { frame: 10, value: 0, interpolation: "linear" },
            ],
          },
        },
        { id: "fast", type: "precomp", comp: "clip60" },
        { id: "nest", type: "precomp", comp: "outer" },
        solid("p1"),
        solid("p2"),
        solid("p3"),
        solid("p4"),
      ],
      ...extra,
    });

  it("distinguishes repeated instances with different clocks", () => {
    const c = precomps(
      expressions({
        "p1.transform.position":
          "[ref('intro/hero.transform.opacity'), ref('outro/hero.transform.opacity')] * 29",
        "p2.transform.position":
          "[ref('slow/hero.transform.opacity'), ref('remapped/hero.transform.opacity')] * 29",
        "p3.transform.position":
          "[ref('fast/hero.transform.opacity'), ref('nest/inner/hero.transform.opacity')] * 29",
        "p4.transform.position":
          "[valueAtTime('outro/hero.transform.opacity', 0.1), ref('remapped.timeRemap')]",
      }),
    );
    const at = (path: string, t: number) =>
      (value(c, path, t) as number[]).map((x) => Math.round(x * 1e9) / 1e9);
    expect(at("p1.transform.position", 10)).toEqual([10, 19]);
    expect(at("p2.transform.position", 10)).toEqual([5, 0]);
    expect(at("p2.transform.position", 4)).toEqual([2, 12]);
    // A 60 fps source advances two source frames per parent frame (held at its end).
    expect(at("p3.transform.position", 10)).toEqual([20, 5]);
    expect(at("p4.transform.position", 4)).toEqual(
      [26 / 29, 12].map((x) => Math.round(x * 1e9) / 1e9),
    );
    // Random seek order matches forward evaluation across instances.
    const forward = Array.from({ length: 30 }, (_, t) => evaluateComp(c, t));
    for (const t of [17, 3, 29, 0, 11, 22, 3, 17])
      expect(evaluateComp(c, t)).toEqual(forward[t]);
  });

  it("targets one instance without affecting another of the same source", () => {
    const c = precomps(
      expressions({
        "intro/hero.transform.rotation": "time * 30",
        "nest/inner/hero.transform.rotation": "frame",
        "outro/hero.transform.opacity": "1 - value",
      }),
    );
    const tree = evaluateComp(c, 10);
    const hero = (instance: number) =>
      tree.layers[instance]!.precomp!.layers[0]!;
    expect(hero(0).transform.rotation).toBeCloseTo(10, 9);
    expect(hero(1).transform.rotation).toBe(0);
    expect(hero(1).transform.opacity).toBeCloseTo(10 / 29, 12);
    expect(
      tree.layers[5]!.precomp!.layers[0]!.precomp!.layers[0]!.transform
        .rotation,
    ).toBe(10);
  });

  it("evaluates a precomp clock expression in the instance clock", () => {
    const c = precomps(
      expressions({
        "slow.timeRemap": "value + 4",
        "p1.transform.rotation": "ref('slow/hero.transform.opacity') * 29",
      }),
    );
    expect(value(c, "slow.timeRemap", 10)).toBe(9);
    expect(value(c, "p1.transform.rotation", 10)).toBeCloseTo(9, 9);
  });
});

describe("behaviours", () => {
  it("compile to expressions with the documented defaults", () => {
    expect(
      behaviourExpressions(
        {
          type: "follow-through",
          leader: "lead.transform.position",
          followers: ["a", "b"],
          delayFrames: 3,
        },
        30,
      ),
    ).toEqual([
      {
        target: "a.transform.position",
        source:
          "value + spring('lead.transform.position', 2.5, 0.45, 0.1) - valueAtTime('lead.transform.position', 0)",
      },
      {
        target: "b.transform.position",
        source:
          "value + spring('lead.transform.position', 2.5, 0.45, 0.2) - valueAtTime('lead.transform.position', 0)",
      },
    ]);
    expect(
      behaviourExpressions(
        {
          type: "anticipation",
          target: "a.transform.rotation",
          amount: -4,
          durationFrames: 6,
        },
        30,
      ),
    ).toEqual([
      { target: "a.transform.rotation", source: "value + anticipate(-4, 0.2)" },
    ]);
    expect(
      behaviourExpressions(
        { type: "auto-orient", layer: "a", offset: -90 },
        30,
      ),
    ).toEqual([
      {
        target: "a.transform.rotation",
        source: "value + heading('a.transform.position') - 90",
      },
    ]);
    expect(
      behaviourExpressions(
        {
          type: "camera-shake",
          target: "a.transform.position",
          startFrame: 12,
          amplitude: 8,
        },
        30,
      ),
    ).toEqual([
      {
        target: "a.transform.position",
        source:
          "frame >= 12 ? wiggle(8, 8 * exp(-3 * (frame - 12) / fps), 0, 2) : value",
      },
    ]);
  });

  it.each([
    ["forward", [0, 1, 2, 3, 4]],
    ["reverse", [4, 3, 2, 1, 0]],
    ["center-out", [2, 1, 0, 1, 2]],
  ] as const)("stagger %s offsets layers in order", (order, ranks) => {
    const compiled = behaviourExpressions(
      {
        type: "stagger",
        layers: ["a", "b", "c", "d", "e"],
        properties: ["transform.rotation"],
        offsetFrames: 4,
        order,
      },
      30,
    );
    expect(compiled.map((e) => e.source)).toEqual(
      ranks.map((rank) =>
        rank ? `valueAtTime((frame - ${rank * 4}) / fps)` : "value",
      ),
    );
  });

  it("seeded stagger is a stable permutation", () => {
    const layers = Array.from({ length: 12 }, (_, i) => `l${i}`);
    const ranks = (seed: number) =>
      behaviourExpressions(
        {
          type: "stagger",
          layers,
          properties: ["transform.rotation"],
          offsetFrames: 1,
          order: "seeded",
          seed,
        },
        30,
      ).map((e) =>
        e.source === "value" ? 0 : Number(/frame - (\d+)/.exec(e.source)![1]),
      );
    expect(ranks(7)).toEqual(ranks(7));
    expect([...ranks(7)].sort((a, b) => a - b)).toEqual(
      layers.map((_, i) => i),
    );
    expect(ranks(7)).not.toEqual(ranks(8));
  });

  it("stagger delays each layer's own animation", () => {
    const keys = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    const c = comp({
      layers: ["a", "b", "c"].map((id) =>
        solid(id, { transform: { rotation: keys } }),
      ),
      behaviours: [
        {
          type: "stagger",
          layers: ["a", "b", "c"],
          properties: ["transform.rotation"],
          offsetFrames: 3,
          order: "reverse",
        },
      ],
    });
    expect(evaluateComp(c, 6).layers.map((l) => l.transform.rotation)).toEqual([
      0, 30, 60,
    ]);
  });

  it("report behaviour diagnostics at the behaviour", () => {
    expect(
      diagnostics(
        base({ behaviours: [{ type: "squash-stretch", layer: "missing" }] }),
      ),
    ).toEqual([
      expect.objectContaining({
        code: "comp-path-layer",
        path: "behaviours[0]",
      }),
    ]);
    expect(
      diagnostics(
        base({
          ...expressions({ "a.transform.scale": "[1, 1]" }),
          behaviours: [{ type: "squash-stretch", layer: "a" }],
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        code: "comp-expression-overlap",
        path: "behaviours[0]",
      }),
    ]);
  });
});
