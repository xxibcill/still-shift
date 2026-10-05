import type { CompositionLayer } from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";
import { PassageError } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import {
  composition,
  fixtures,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";

const codes = (input: Parameters<typeof analyzeCompositionQuality>[0]) =>
  analyzeCompositionQuality(input).diagnostics.map((d) => d.code);

describe("CE12 composition quality", () => {
  for (const [name, code] of [
    ["stillness", "frozen-run"],
    ["velocity", "velocity-discontinuity"],
    ["easing", "easing-monotony"],
    ["coStart", "co-start"],
    ["reading", "reading-time"],
    ["framing", "off-canvas"],
    ["pops", "opacity-pop"],
  ] as const) {
    it(`${name} has passing and failing acceptance fixtures`, () => {
      expect(codes(fixtures[name].fail)).toContain(code);
      expect(codes(fixtures[name].pass)).not.toContain(code);
    });
  }
  it("does not mutate a composition and returns deterministic structured frame ranges", () => {
    const input = fixtures.pops.fail;
    const before = JSON.stringify(input);
    const a = analyzeCompositionQuality(input);
    expect(analyzeCompositionQuality(input)).toEqual(a);
    expect(JSON.stringify(input)).toBe(before);
    expect(a.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "scale-pop",
        severity: "error",
        frames: [19, 20],
        path: expect.any(String),
      }),
    );
  });
  it("ignores animated invisible, guide and null layers when detecting stillness", () => {
    const move = {
      position: {
        keys: [
          { frame: 0, value: [0, 0] as [number, number] },
          { frame: 89, value: [200, 0] as [number, number] },
        ],
      },
    };
    const input = composition([
      solid(),
      solid("hidden", { enabled: false, transform: move }),
      solid("guide", { guide: true, transform: move }),
      { id: "null", type: "null", transform: move },
    ]);
    expect(codes(input)).toContain("frozen-run");
  });
  it("checks frozen pixels independently of changing evaluated state", () => {
    const input = fixtures.stillness.pass;
    const report = analyzeCompositionQuality(input, {
      pixelHashes: Array(input.frameCount).fill("same"),
    });
    expect(report.diagnostics.map((d) => d.code)).toContain("frozen-pixels");
    expect(report.diagnostics.map((d) => d.code)).not.toContain("frozen-run");
  });
  it("resets stillness and reading windows at shot boundaries", () => {
    const input = composition([solid()], { frameCount: 12 });
    const report = analyzeCompositionQuality(input, {
      shots: [
        { id: "a", start: 0, end: 6 },
        { id: "b", start: 6, end: 12 },
      ],
    });
    expect(report.diagnostics.map((d) => d.code)).not.toContain("frozen-run");
  });
  it("rejects invalid policies and incomplete pixel evidence", () => {
    expect(() =>
      analyzeCompositionQuality(fixtures.stillness.fail, {
        maxFrozenFrames: -1,
      }),
    ).toThrow();
    expect(() =>
      analyzeCompositionQuality(fixtures.stillness.fail, {
        pixelHashes: ["one"],
      }),
    ).toThrow();
    expect(() =>
      analyzeCompositionQuality(fixtures.stillness.fail, {
        shots: [{ id: "invalid", start: 0, end: 91 }],
      }),
    ).toThrow();
  });
});

describe("CE12 measurement boundaries", () => {
  it("checks every frozen run, including sub-threshold runs and cuts", () => {
    const report = analyzeCompositionQuality(fixtures.stillness.fail, {
      intentionalCuts: [30, 60],
      maxFrozenFrames: 10,
    });
    expect(
      report.diagnostics
        .filter((d) => d.code === "frozen-run")
        .map((d) => d.frames),
    ).toEqual([
      [1, 29],
      [31, 59],
      [61, 89],
    ]);
  });
  it("counts the six-frame allowance as comparisons, not displayed frames", () => {
    expect(codes(composition([solid()], { frameCount: 7 }))).not.toContain(
      "frozen-run",
    );
    expect(codes(composition([solid()], { frameCount: 8 }))).toContain(
      "frozen-run",
    );
  });
  it("checks gray pixel energy with the owner's default meaningful-motion floor", () => {
    const input = fixtures.stillness.pass;
    const counts = Array.from({ length: input.frameCount }, (_, i) =>
      i ? 199 : 0,
    );
    expect(
      analyzeCompositionQuality(input, {
        pixelChangedCounts: counts,
      }).diagnostics.map((d) => d.code),
    ).toContain("frozen-pixels");
    expect(
      analyzeCompositionQuality(input, {
        pixelChangedCounts: counts,
        pixelMinimumChanges: 100,
      }).diagnostics.map((d) => d.code),
    ).not.toContain("frozen-pixels");
  });
  it("finds safe-area and declared coverage failures", () => {
    expect(
      codes(composition([solid("edge", { transform: { position: [2, 2] } })])),
    ).toContain("outside-safe-area");
    const input = composition([
      solid("cover", {
        size: [640, 360],
        transform: { position: [0, 0], anchor: [0, 0] },
      }),
    ]);
    expect(
      analyzeCompositionQuality(input, {
        coverageLayers: ["cover"],
      }).diagnostics.map((d) => d.code),
    ).not.toContain("coverage");
    expect(
      analyzeCompositionQuality(input, {
        coverageLayers: ["missing"],
      }).diagnostics.map((d) => d.code),
    ).toContain("coverage");
    const translucent = structuredClone(input);
    if (translucent.layers[0]!.type === "solid")
      translucent.layers[0].color = "#ffffff00";
    expect(
      analyzeCompositionQuality(translucent, {
        coverageLayers: ["cover"],
      }).diagnostics.map((d) => d.code),
    ).toContain("coverage");
  });
  it("keeps fully transparent movement from hiding visible stillness", () => {
    const input = composition([
      solid(),
      solid("clear", {
        color: "#ffffff00",
        transform: {
          position: {
            keys: [
              { frame: 0, value: [0, 0] },
              { frame: 89, value: [200, 0] },
            ],
          },
        },
      }),
    ]);
    expect(codes(input)).toContain("frozen-run");
  });
  it("includes moving matte state without counting arbitrary hidden motion", () => {
    const input = composition([
      solid("paint", { trackMatte: { layer: "matte", mode: "alpha" } }),
      solid("matte", {
        transform: {
          position: {
            keys: [
              { frame: 0, value: [80, 80] },
              { frame: 89, value: [100, 80] },
            ],
          },
        },
      }),
    ]);
    expect(codes(input)).not.toContain("frozen-run");
  });
  it("does not let text state swaps accumulate scattered reading frames", () => {
    const input = composition(
      [
        {
          id: "words",
          type: "text",
          text: "One clear sentence",
          states: ["One clear sentence", "Another clear sentence"],
          state: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 20, value: 1 },
              { frame: 40, value: 0 },
            ],
          },
          fontSize: 24,
          color: "#ffffff",
        },
      ],
      { frameCount: 60 },
    );
    const report = analyzeCompositionQuality(input);
    expect(
      report.diagnostics.filter((d) => d.code === "reading-time"),
    ).toHaveLength(3);
  });
  it("uses role-specific reading policies and opacity/reveal gates", () => {
    const input = structuredClone(fixtures.reading.fail);
    const report = analyzeCompositionQuality(input, {
      reading: { body: { wordsPerSecond: 100, minimumSeconds: 0 } },
    });
    expect(report.diagnostics.map((d) => d.code)).not.toContain("reading-time");
    input.layers[0]!.transform = { opacity: 0.2 };
    expect(codes(input)).toContain("reading-time");
  });
  it("samples repeated reversed precomp instances and inherited opacity", () => {
    const child = solid("child", {
      transform: {
        position: {
          keys: [
            { frame: 0, value: [80, 80] },
            { frame: 89, value: [200, 80] },
          ],
        },
      },
    });
    const input = composition(
      [
        {
          id: "one",
          type: "precomp",
          comp: "inner",
          transform: { anchor: [0, 0] },
        },
        {
          id: "two",
          type: "precomp",
          comp: "inner",
          transform: { anchor: [0, 0] },
          startFrame: 89,
          stretch: -1,
        },
      ],
      {
        precomps: [
          {
            id: "inner",
            width: 640,
            height: 360,
            frameCount: 90,
            layers: [child],
          },
        ],
      },
    );
    expect(codes(input)).not.toContain("frozen-run");
    expect(analyzeCompositionQuality(input)).toEqual(
      analyzeCompositionQuality(input),
    );
  });
  it("allows severity overrides without removing the finding", () => {
    const report = analyzeCompositionQuality(fixtures.stillness.fail, {
      severities: { "frozen-run": "warning" },
    });
    expect(report.status).toBe("passed");
    expect(
      report.diagnostics.find((d) => d.code === "frozen-run")?.severity,
    ).toBe("warning");
  });
  it("validates cuts, shot partitions and evidence sizes", () => {
    expect(() =>
      analyzeCompositionQuality(fixtures.stillness.fail, {
        intentionalCuts: [90],
      }),
    ).toThrow();
    expect(() =>
      analyzeCompositionQuality(fixtures.stillness.fail, {
        shots: [{ id: "a", start: 0, end: 20 }],
      }),
    ).toThrow();
    expect(() =>
      analyzeCompositionQuality(fixtures.stillness.fail, {
        pixelChangedCounts: [-1],
      }),
    ).toThrow();
  });
});

it("detects fractional stretched key joins", () => {
  const input = structuredClone(fixtures.velocity.fail);
  input.layers[0]!.stretch = 1.025;
  const report = analyzeCompositionQuality(input);
  expect(
    report.diagnostics.some(
      (d) =>
        d.code === "velocity-discontinuity" &&
        d.frames[0] === 20 &&
        d.frames[1] === 21,
    ),
  ).toBe(true);
});
it("does not treat spinning text as settled reading time", () => {
  const input = structuredClone(fixtures.reading.pass);
  input.layers[0]!.transform = {
    rotation: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 149, value: 360, interpolation: "linear" },
      ],
    },
  };
  expect(codes(input)).toContain("reading-time");
});

it("checks rotated cover footprints instead of accepting their axis-aligned bounding box", () => {
  const input = composition([
    solid("cover", {
      size: [640, 640],
      transform: { position: [320, 180], rotation: 45 },
    }),
  ]);
  expect(
    analyzeCompositionQuality(input, {
      coverageLayers: ["cover"],
    }).diagnostics.map((d) => d.code),
  ).toContain("coverage");
});

it.each([
  [{ pixelHashes: ["one"] }, "pixelHashes"],
  [{ pixelChangedCounts: [-1] }, "pixelChangedCounts"],
  [
    {
      pixelHashes: Array(90).fill("same"),
      pixelChangedCounts: Array(90).fill(0),
    },
    "pixelChangedCounts",
  ],
])(
  "preserves structured diagnostics for invalid pixel evidence %j",
  (policy, path) => {
    expect(() =>
      analyzeCompositionQuality(fixtures.stillness.fail, policy),
    ).toThrow(PassageError);
    expect(() =>
      analyzeCompositionQuality(fixtures.stillness.fail, policy),
    ).toThrow(
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({
            code: "comp-lint-pixel-evidence",
            path,
            severity: "error",
          }),
        ],
      }),
    );
  },
);

it.each([{ enabled: false }, { inPoint: 90 }, { outPoint: 0 }])(
  "ignores inactive effects when checking stillness and velocity: %j",
  (activation) => {
    const input = composition([
      solid("subject", {
        effects: [
          {
            id: "sweep",
            effect: "light.sweep",
            ...activation,
            params: {
              progress: {
                keys: [
                  { frame: 0, value: 0 },
                  { frame: 20, value: 0.1, interpolation: "linear" },
                  { frame: 89, value: 1, interpolation: "linear" },
                ],
              },
            },
          },
        ],
      }),
    ]);
    const report = analyzeCompositionQuality(input);
    expect(report.status).toBe("failed");
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "frozen-run", frames: [1, 89] }),
    );
    expect(report.diagnostics.map((d) => d.code)).not.toContain(
      "velocity-discontinuity",
    );
  },
);

it("counts effect motion only inside its active window", () => {
  const input = composition([
    solid("subject", {
      effects: [
        {
          id: "sweep",
          effect: "light.sweep",
          inPoint: 20,
          outPoint: 70,
          params: {
            progress: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 89, value: 1, interpolation: "linear" },
              ],
            },
          },
        },
      ],
    }),
  ]);
  expect(
    analyzeCompositionQuality(input)
      .diagnostics.filter((d) => d.code === "frozen-run")
      .map((d) => d.frames),
  ).toEqual([
    [1, 19],
    [71, 89],
  ]);
  const active = structuredClone(input);
  delete active.layers[0]!.effects![0]!.inPoint;
  delete active.layers[0]!.effects![0]!.outPoint;
  expect(codes(active)).not.toContain("frozen-run");
});

function parentDrivenScene(type: "null" | "group") {
  const layers: CompositionLayer[] = [];
  for (let i = 0; i < 4; i++) {
    const id = `parent-${i}`;
    const transform = {
      anchor: [0, 0] as [number, number],
      position: {
        keys: [
          { frame: 0, value: [0, 0] as [number, number] },
          {
            frame: 89,
            value: [200, 0] as [number, number],
            interpolation: "linear" as const,
          },
        ],
      },
    };
    layers.push(
      type === "group"
        ? { id, type, size: [640, 360], transform }
        : { id, type, transform },
      solid(`child-${i}`, { parent: id }),
    );
  }
  return composition(layers);
}

it.each(["null", "group"] as const)(
  "checks timing on contributing %s parents",
  (type) => {
    const report = analyzeCompositionQuality(parentDrivenScene(type));
    for (const code of ["easing-monotony", "co-start"])
      expect(report.diagnostics).toContainEqual(
        expect.objectContaining({
          code,
          nodes: ["parent-0", "parent-1", "parent-2", "parent-3"],
        }),
      );
  },
);

it("does not count parent tracks without on-screen descendants", () => {
  const input = parentDrivenScene("null");
  for (const layer of input.layers)
    if (layer.type === "solid") layer.enabled = false;
  expect(codes(input)).not.toContain("easing-monotony");
  expect(codes(input)).not.toContain("co-start");
});

it("counts a shared parent property once rather than once per descendant", () => {
  const input = parentDrivenScene("null");
  input.layers = [
    input.layers[0]!,
    ...Array.from({ length: 4 }, (_, i) =>
      solid(`child-${i}`, { parent: "parent-0" }),
    ),
  ];
  expect(codes(input)).not.toContain("easing-monotony");
  expect(codes(input)).not.toContain("co-start");
});

it("keeps independent parent tracks in repeated precomp instances", () => {
  const inner = parentDrivenScene("null");
  const input = composition(
    [
      {
        id: "one",
        type: "precomp",
        comp: "inner",
        transform: { anchor: [0, 0] },
      },
      {
        id: "two",
        type: "precomp",
        comp: "inner",
        transform: { anchor: [0, 0] },
      },
    ],
    {
      precomps: [
        {
          id: "inner",
          width: 640,
          height: 360,
          frameCount: 90,
          layers: inner.layers.slice(0, 4),
        },
      ],
    },
  );
  const report = analyzeCompositionQuality(input);
  for (const code of ["easing-monotony", "co-start"])
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code,
        nodes: ["one/parent-0", "one/parent-1", "two/parent-0", "two/parent-1"],
      }),
    );
});

it.each([1.025, -1.025])(
  "finds fractional inherited key joins at stretch %s",
  (stretch) => {
    const input = composition(
      [
        {
          id: "parent",
          type: "null",
          stretch,
          ...(stretch < 0 ? { startFrame: 41 } : {}),
          transform: {
            position: {
              keys: [
                { frame: 0, value: [0, 0] },
                { frame: 20, value: [20, 0], interpolation: "linear" },
                { frame: 40, value: [220, 0], interpolation: "linear" },
              ],
            },
          },
        },
        solid("child", { parent: "parent" }),
      ],
      { frameCount: 42 },
    );
    expect(analyzeCompositionQuality(input).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "velocity-discontinuity",
        nodes: ["child"],
        frames: [20, 21],
      }),
    );
  },
);

it.each(["null", "group"] as const)(
  "counts parent opacity only when inherited from %s",
  (type) => {
    const input = parentDrivenScene(type);
    for (const layer of input.layers)
      if (layer.type === type)
        layer.transform = {
          anchor: [0, 0],
          opacity: {
            keys: [
              { frame: 0, value: 1 },
              { frame: 89, value: 0.5, interpolation: "linear" },
            ],
          },
        };
    const report = codes(input);
    if (type === "group") {
      expect(report).toContain("easing-monotony");
      expect(report).toContain("co-start");
    } else {
      expect(report).not.toContain("easing-monotony");
      expect(report).not.toContain("co-start");
      expect(report).toContain("frozen-run");
    }
  },
);

it("recognizes staggered varied easing on parents", () => {
  const input = parentDrivenScene("null");
  input.layers.forEach((layer, i) => {
    if (layer.type === "null")
      layer.transform = {
        position: {
          keys: [
            { frame: i * 3, value: [0, 0] },
            {
              frame: 89,
              value: [200, 0],
              easing: i % 4 ? "linear" : "smoothstep",
            },
          ],
        },
      };
  });
  expect(codes(input)).not.toContain("easing-monotony");
  expect(codes(input)).not.toContain("co-start");
});

it.each([{}, { enabled: false }, { inPoint: 90 }, { outPoint: 0 }])(
  "checks timing only for active effect tracks: %j",
  (activation) => {
    const input = composition(
      Array.from({ length: 4 }, (_, i) =>
        solid(`effect-${i}`, {
          transform: { position: [120, 100] },
          effects: [
            {
              id: "blur",
              effect: "blur.gaussian",
              ...activation,
              params: {
                radius: {
                  keys: [
                    { frame: 0, value: 0 },
                    { frame: 89, value: 10, interpolation: "linear" },
                  ],
                },
              },
            },
          ],
        }),
      ),
    );
    const report = codes(input);
    for (const code of ["easing-monotony", "co-start"])
      if (Object.keys(activation).length) expect(report).not.toContain(code);
      else expect(report).toContain(code);
  },
);

it("recognizes staggered varied easing in effect tracks", () => {
  const input = composition(
    Array.from({ length: 4 }, (_, i) =>
      solid(`effect-${i}`, {
        effects: [
          {
            id: "blur",
            effect: "blur.gaussian",
            params: {
              radius: {
                keys: [
                  { frame: i * 5, value: 0 },
                  {
                    frame: 89,
                    value: 10,
                    easing: i % 2 ? "linear" : "smoothstep",
                  },
                ],
              },
            },
          },
        ],
      }),
    ),
  );
  expect(codes(input)).not.toContain("easing-monotony");
  expect(codes(input)).not.toContain("co-start");
});

it.each([1.025, -1.025])(
  "finds fractional active effect joins at stretch %s",
  (stretch) => {
    const input = composition(
      [
        solid("effect", {
          stretch,
          ...(stretch < 0 ? { startFrame: 41 } : {}),
          effects: [
            {
              id: "blur",
              effect: "blur.gaussian",
              params: {
                radius: {
                  keys: [
                    { frame: 0, value: 0 },
                    { frame: 20, value: 1, interpolation: "linear" },
                    { frame: 40, value: 21, interpolation: "linear" },
                  ],
                },
              },
            },
          ],
        }),
      ],
      { frameCount: 42 },
    );
    expect(analyzeCompositionQuality(input).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "velocity-discontinuity",
        nodes: ["effect"],
        frames: [20, 21],
      }),
    );
  },
);

function matteDrivenScene(
  source: "solid" | "group" | "precomp" = "solid",
  activation: object = {},
) {
  const layers: CompositionLayer[] = [];
  const move = {
    position: {
      keys: [
        { frame: 0, value: [70, 70] as [number, number] },
        {
          frame: 89,
          value: [100, 70] as [number, number],
          interpolation: "linear" as const,
        },
      ],
    },
  };
  for (let i = 0; i < 4; i++) {
    const id = `matte-${i}`;
    layers.push(
      solid(`paint-${i}`, { trackMatte: { layer: id, mode: "alpha" } }),
    );
    if (source === "solid")
      layers.push(solid(id, { ...activation, transform: move }));
    else if (source === "group")
      layers.push(
        {
          id,
          type: "group",
          size: [640, 360],
          transform: { anchor: [0, 0], position: [0, 0] },
          ...activation,
        },
        solid(`content-${i}`, { parent: id, transform: move }),
      );
    else
      layers.push({
        id,
        type: "precomp",
        comp: "inner",
        transform: { anchor: [0, 0] },
        ...activation,
      });
  }
  return composition(
    layers,
    source === "precomp"
      ? {
          precomps: [
            {
              id: "inner",
              width: 640,
              height: 360,
              frameCount: 90,
              layers: [solid("content", { transform: move })],
            },
          ],
        }
      : {},
  );
}

it.each(["solid", "group", "precomp"] as const)(
  "checks timing of contributing %s matte content",
  (source) => {
    const report = codes(matteDrivenScene(source));
    expect(report).toContain("easing-monotony");
    expect(report).toContain("co-start");
    expect(report).not.toContain("frozen-run");
  },
);

it("respects matte visibility semantics and excludes unused/out-of-window matte motion", () => {
  expect(codes(matteDrivenScene("solid", { enabled: false }))).toContain(
    "co-start",
  );
  expect(codes(matteDrivenScene("solid", { outPoint: 1 }))).not.toContain(
    "co-start",
  );
  const hidden = matteDrivenScene();
  for (const layer of hidden.layers)
    if (layer.id.startsWith("paint")) layer.enabled = false;
  expect(codes(hidden)).not.toContain("co-start");
});

it("counts a shared matte property only once", () => {
  const input = matteDrivenScene();
  input.layers = input.layers.filter(
    (layer) => !layer.id.startsWith("matte") || layer.id === "matte-0",
  );
  for (const layer of input.layers)
    if (layer.trackMatte) layer.trackMatte.layer = "matte-0";
  expect(codes(input)).not.toContain("easing-monotony");
  expect(codes(input)).not.toContain("co-start");
});

it.each([1, 1.025, -1.025])(
  "finds contributing matte velocity joins at stretch %s",
  (stretch) => {
    const input = composition(
      [
        solid("paint", { trackMatte: { layer: "matte", mode: "alpha" } }),
        solid("matte", {
          stretch,
          ...(stretch < 0 ? { startFrame: 41 } : {}),
          transform: {
            position: {
              keys: [
                { frame: 0, value: [70, 70] },
                { frame: 20, value: [80, 70], interpolation: "linear" },
                { frame: 40, value: [180, 70], interpolation: "linear" },
              ],
            },
          },
        }),
      ],
      { frameCount: 42 },
    );
    expect(analyzeCompositionQuality(input).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "velocity-discontinuity",
        nodes: ["matte"],
        frames: stretch === 1 ? [20, 20] : [20, 21],
      }),
    );
  },
);
