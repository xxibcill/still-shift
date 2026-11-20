// ET6a text measurement: the layer origin rule and the placement helpers
// over a measurement (docs/editorial-typography-improvement-plan.md#et6a--text-measurement-command).
// Shaping needs the browser; tests/browser/composition-text-measure.ts checks
// measured geometry against rendered pixels.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import {
  measuredLayerOrigin,
  measureTextEffects,
  normalTailInverse,
  textColors,
} from "../../packages/renderer-core/src/composition/text-measure.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import type {
  MeasureBox,
  TextStateMeasure,
} from "../../packages/renderer-core/src/composition/text-measure.ts";
import {
  bottomOf,
  centreOn,
  edgeBox,
  fitSize,
  highlightOffset,
  measured,
  readMeasure,
  topAt,
  type Measure,
} from "../../research/editorial-titles-et7a/layout.ts";

const box = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): MeasureBox => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

const textLayer = (transform: Record<string, unknown> = {}) =>
  ({
    id: "title",
    type: "text",
    text: "IT UP",
    fontSize: 100,
    color: "#111111",
    transform,
  }) as unknown as CompositionLayer;
const compWith = (...layers: CompositionLayer[]) =>
  ({ id: "c", layers, assets: [] }) as unknown as Composition;

describe("measuredLayerOrigin", () => {
  it("gives the position of a layer placed by a plain translation", () => {
    const placed = compWith(textLayer({ position: [360, 640] }));
    expect(measuredLayerOrigin(placed, placed, placed.layers[0]!)).toEqual({
      origin: [360, 640],
    });
    const comp = compWith(textLayer({ position: [10, 20], scale: [1, 1] }));
    expect(measuredLayerOrigin(comp, comp, comp.layers[0]!).origin).toEqual([
      10, 20,
    ]);
  });

  it("refuses transforms it cannot express as an offset", () => {
    for (const [transform, reason] of [
      [{ position: { keys: [] } }, "position is animated"],
      [{ position: [0, 0], scale: [2, 2] }, "layer is scaled"],
      [{ position: [0, 0], rotation: 5 }, "layer has rotation"],
      [{ position: [0, 0], anchor: [4, 0] }, "layer has an anchor"],
    ] as const) {
      const comp = compWith(textLayer(transform));
      expect(measuredLayerOrigin(comp, comp, comp.layers[0]!)).toEqual({
        origin: null,
        originReason: reason,
      });
    }
    const camera = compWith(textLayer(), {
      id: "cam",
      type: "camera",
    } as unknown as CompositionLayer);
    expect(
      measuredLayerOrigin(camera, camera, camera.layers[0]!).originReason,
    ).toBe("composition has a camera");
    const depth = compWith(textLayer({ position: [0, 0, 40] }));
    expect(
      measuredLayerOrigin(depth, depth, depth.layers[0]!).originReason,
    ).toBe("position has a depth component");
  });

  it("refuses layers that follow the composition's 2D camera", () => {
    const camera2d = {
      keys: [
        { frame: 0, position: [0, 0] },
        { frame: 30, position: [300, 0] },
      ],
    };
    const follows = {
      ...compWith(textLayer({ position: [100, 200] })),
      camera2d,
    } as unknown as Composition;
    expect(measuredLayerOrigin(follows, follows, follows.layers[0]!)).toEqual({
      origin: null,
      originReason: "composition has camera2d",
    });
    const fixed = {
      ...compWith({
        ...textLayer({ position: [100, 200] }),
        cameraDepth: 0,
      } as unknown as CompositionLayer),
      camera2d,
    } as unknown as Composition;
    expect(measuredLayerOrigin(fixed, fixed, fixed.layers[0]!)).toEqual({
      origin: [100, 200],
    });
  });

  it("refuses layers that drivers, periodic motion, expressions or constraints move", () => {
    const placed = (extra: Record<string, unknown>) =>
      ({
        schemaVersion: "composition-1",
        id: "c",
        width: 400,
        height: 400,
        fps: 30,
        frameCount: 40,
        assets: [],
        layers: [
          {
            id: "lead",
            type: "solid",
            size: [10, 10],
            color: "#ff0000",
            transform: { position: [300, 300] },
          },
          {
            id: "title",
            type: "text",
            text: "IT",
            fontSize: 40,
            color: "#111111",
            transform: { position: [100, 200] },
          },
        ],
        ...extra,
      }) as unknown as Composition;
    const signals = [
      {
        id: "s",
        keys: [
          { frame: 0, value: 0 },
          { frame: 39, value: 50 },
        ],
      },
    ];
    for (const [extra, reason] of [
      [
        {
          signals,
          drivers: [{ target: "title.transform.position.x", signal: "s" }],
        },
        "a driver moves the layer",
      ],
      [
        {
          periodic: [
            {
              target: "title.transform.position.y",
              start: 0,
              end: 39,
              oscillate: { period: 10, amplitude: 20 },
            },
          ],
        },
        "periodic motion moves the layer",
      ],
      [
        {
          expressions: {
            "title.transform.position": { source: "value + [50, 0]" },
          },
        },
        "an expression moves the layer",
      ],
      [
        { constraints: [{ type: "attach", target: "title", anchor: "lead" }] },
        "a constraint moves the layer",
      ],
    ] as const) {
      const comp = placed(extra);
      const title = comp.layers[1]!;
      // The evaluator really does move it away from transform.position.
      const at = [0, 7, 20].map(
        (frame) =>
          evaluateComp(comp, frame).layers.find((l) => l.id === "title")!
            .transform.position,
      );
      expect(at.some(([x, y]) => x !== 100 || y !== 200)).toBe(true);
      expect(measuredLayerOrigin(comp, comp, title)).toEqual({
        origin: null,
        originReason: reason,
      });
    }
    // Opacity, or motion on another layer, leaves the origin static.
    const still = placed({
      signals,
      drivers: [
        { target: "title.transform.opacity", signal: "s" },
        { target: "lead.transform.position.x", signal: "s" },
      ],
      constraints: [{ type: "attach", target: "lead", anchor: "title" }],
    });
    expect(measuredLayerOrigin(still, still, still.layers[1]!)).toEqual({
      origin: [100, 200],
    });
  });
});

const state = (overrides: Partial<TextStateMeasure> = {}): TextStateMeasure =>
  ({
    state: 0,
    text: "IT UP",
    motionBounds: box(-110, -10, 110, 110),
    advance: box(-100, -20, 100, 120),
    ink: box(-90, 0, 110, 100),
    metrics: {
      fontAsset: "anton",
      size: 200,
      ascent: 20,
      descent: 20,
      capHeight: 100,
      xHeight: 80,
      lineHeight: 240,
      tracking: 0,
    },
    lines: [
      {
        index: 0,
        text: "IT UP",
        baseline: 100,
        advance: box(-100, -20, 100, 120),
        ink: box(-90, 0, 110, 100),
        capTop: 0,
        xTop: 20,
      },
    ],
    spans: [],
    words: [],
    decorations: [
      {
        index: 0,
        kind: "highlight",
        thickness: 125,
        offset: 0,
        approximate: false,
        segments: [
          {
            line: 0,
            paint: box(-100, 0, 100, 125),
            y: 60,
            centredOffset: { cap: -10, ink: -10.004 },
          },
        ],
        paint: box(-100, 0, 100, 125),
      },
    ],
    outline: {
      strokeWidth: 12,
      extent: 6,
      ink: box(-96, -6, 116, 106),
      lines: [],
    },
    ...overrides,
  }) as TextStateMeasure;

describe("layout helpers", () => {
  it("picks ink, outline or cap edges", () => {
    expect(edgeBox(state(), "ink").top).toBe(0);
    expect(edgeBox(state(), "outline").top).toBe(-6);
    const bare: Partial<TextStateMeasure> = state();
    delete bare.outline;
    expect(edgeBox(bare as TextStateMeasure, "outline").top).toBe(0);
    expect(edgeBox(state(), "cap")).toMatchObject({ top: 0, bottom: 100 });
  });

  it("fits, centres and stacks from measured boxes in whole pixels", () => {
    // 200 px of ink at 200 px; 150 px wide → 150 px size.
    expect(fitSize(state(), 200, 150)).toBe(150);
    // Ink centre is +10 from the origin, so the origin goes 10 left.
    expect(centreOn(state(), 360)).toBe(350);
    expect(centreOn(state(), 360, "outline")).toBe(350);
    expect(topAt(state(), 420, "outline")).toBe(426);
    expect(bottomOf(state(), 426, "outline")).toBe(532);
    // Fractional targets round to whole pixels.
    expect(centreOn(state(), 360.4)).toBe(350);
  });

  it("reads the highlight offset that centres the band", () => {
    expect(highlightOffset(state(), 0, "cap")).toBe(-10);
    expect(highlightOffset(state(), 0, "ink")).toBe(-10);
    expect(() => highlightOffset(state(), 1)).toThrow(/not a highlight/);
  });
});

describe("saved measurements", () => {
  const report: Measure & { schemaVersion: string } = {
    schemaVersion: "composition-measure-1",
    version: "composition-text-measure-1",
    coordinates: "layer-local",
    layers: [
      {
        key: "caps",
        layer: "caps",
        scope: null,
        align: "center",
        anchor: "cap",
        locale: "en",
        origin: [0, 0],
        measured: true,
        states: [state()],
      },
      {
        key: "plain",
        layer: "plain",
        scope: null,
        align: "left",
        anchor: "top",
        locale: "en",
        origin: [0, 0],
        measured: false,
        reason: "system font",
      },
    ],
  };

  it("reads a report, and treats a missing or empty file as not measured", () => {
    const directory = mkdtempSync(join(tmpdir(), "et6a-layout-"));
    try {
      const url = pathToFileURL(join(directory, "c.measure.json"));
      expect(readMeasure(url)).toBeUndefined();
      writeFileSync(url, "");
      expect(readMeasure(url)).toBeUndefined();
      writeFileSync(url, JSON.stringify(report));
      expect(readMeasure(url)?.layers).toHaveLength(2);
      writeFileSync(url, JSON.stringify({ schemaVersion: "other" }));
      expect(() => readMeasure(url)).toThrow(/not a comp measure report/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses stale or unmeasured layers", () => {
    expect(measured(report, "caps", { text: "IT UP", size: 200 }).text).toBe(
      "IT UP",
    );
    expect(() => measured(report, "caps", { text: "IT UP NOW" })).toThrow(
      /measure again/,
    );
    expect(() => measured(report, "caps", { size: 180 })).toThrow(
      /measured at 200 px/,
    );
    expect(() => measured(report, "plain")).toThrow(/system font/);
    expect(() => measured(report, "missing")).toThrow(/no text layer/);
  });
});

describe("effect extents", () => {
  it("inverts the normal upper tail", () => {
    expect(normalTailInverse(0.5)).toBeCloseTo(0, 9);
    expect(normalTailInverse(0.05)).toBeCloseTo(1.644854, 5);
    expect(normalTailInverse(0.0625)).toBeCloseTo(1.534121, 5);
    expect(normalTailInverse(0.001)).toBeCloseTo(3.090232, 5);
    expect(normalTailInverse(0.99)).toBeCloseTo(-2.326348, 5);
  });

  const shadow = (params: Record<string, unknown>) => ({
    id: "s",
    effect: "light.drop-shadow",
    params,
  });
  type Effects = Parameters<typeof measureTextEffects>[0];

  it("shifts and pads a drop shadow from the outlined ink", () => {
    const measured = measureTextEffects(
      [
        shadow({ offset: [10, 14], blur: 6, opacity: 0.8, color: "#B3261E" }),
      ] as Effects,
      state(),
      ["#111111"],
    )!;
    // Source: the outline ink (−96, −6, 116, 106) and the highlight's paint.
    expect(measured.source).toMatchObject({ left: -100, top: -6, right: 116 });
    const [effect] = measured.list;
    expect(effect).toMatchObject({ sigma: 6, reach: 19, strength: 0.8 });
    // 6 × Q⁻¹(0.05 / 0.8)
    expect(effect!.visibleReach).toBeCloseTo(6 * 1.534121, 4);
    expect(effect!.paint).toMatchObject({
      left: -100 + 10 - 19,
      top: -6 + 14 - 19,
    });
    expect(measured.paint.left).toBe(-109);
    expect(measured.paint.right).toBe(116 + 10 + 19);
  });

  it("takes the extremes of keyed parameters and skips faint or disabled effects", () => {
    const keyed = measureTextEffects(
      [
        shadow({
          offset: {
            keys: [
              { frame: 0, value: [-4, 0] },
              { frame: 10, value: [8, 2] },
            ],
          },
          blur: {
            keys: [
              { frame: 0, value: 2 },
              { frame: 10, value: 5 },
            ],
          },
          opacity: 0.03,
        }),
        { id: "off", effect: "light.drop-shadow", enabled: false, params: {} },
      ] as Effects,
      state(),
      ["#111111"],
    )!;
    expect(keyed.list).toHaveLength(1);
    expect(keyed.list[0]).toMatchObject({
      offset: { min: [-4, 0], max: [8, 2] },
      sigma: 5,
      visibleReach: null,
      visible: null,
    });
    expect(measureTextEffects([], state(), [])).toBeUndefined();
  });

  it("scales glow strength by the brightest source colour", () => {
    const glow = (colors: string[]) =>
      measureTextEffects(
        [
          {
            id: "g",
            effect: "light.glow",
            params: { radius: 10, intensity: 0.8, threshold: 0 },
          },
        ] as Effects,
        state(),
        colors,
      )!.list[0]!;
    expect(glow(["#FFFFFF"])).toMatchObject({ reach: 32, strength: 0.8 });
    expect(glow(["#111111"]).strength).toBeCloseTo(0.8 * (17 / 255), 6);
    // Just over 5%: the 5% contour lies inside the edge (negative reach).
    expect(glow(["#111111"]).visibleReach).toBeLessThan(0);
    // Below 5% strength: never visible at that coverage.
    expect(glow(["#0A0A0A"]).visibleReach).toBeNull();
  });

  it("weights a tinted glow toward full coverage (light.glow 1.1.0)", () => {
    const glow = (params: Record<string, number | string>) =>
      measureTextEffects(
        [{ id: "g", effect: "light.glow", params }] as Effects,
        state(),
        ["#111111"],
      )!.list[0]!;
    const base = { radius: 10, intensity: 0.8, threshold: 0 };
    const dim = 0.8 * (17 / 255);
    expect(glow({ ...base, tint: 0, color: "#C8B4FF" }).strength).toBe(
      glow(base).strength,
    );
    expect(glow({ ...base, tint: 1, color: "#C8B4FF" }).strength).toBeCloseTo(
      0.8,
      9,
    );
    expect(glow({ ...base, tint: 0.5 }).strength).toBeCloseTo(
      0.8 * (17 / 255 / 2 + 0.5),
      9,
    );
    expect(glow({ ...base, tint: 1 }).visibleReach).toBeGreaterThan(0);
    expect(glow(base).strength).toBeCloseTo(dim, 9);
  });

  it("bounds a glow by its radius even when no measured colour passes the threshold", () => {
    const measured = measureTextEffects(
      [
        {
          id: "g",
          effect: "light.glow",
          params: { radius: 8, intensity: 1, threshold: 0.5 },
        },
      ] as Effects,
      state(),
      ["#111111"],
    )!;
    expect(measured.list[0]).toMatchObject({ strength: 0, reach: 26 });
    expect(measured.list[0]!.visible).toBeNull();
    // Source (−100, −6, 116, 125) padded by 3σ + 2, as `effectBounds` does.
    expect(measured.paint).toMatchObject({
      left: -126,
      top: -32,
      right: 142,
      bottom: 151,
    });
  });

  it("counts decoration colours as glow sources", () => {
    const node = {
      id: "title",
      color: "#111111",
      decorations: [{ kind: "highlight", color: "#FFE600" }],
    } as unknown as Parameters<typeof textColors>[0];
    const prepared = { scene: { textAnimators: [] } } as unknown as Parameters<
      typeof textColors
    >[1];
    expect(textColors(node, prepared)).toEqual(["#111111", "#FFE600"]);
    const glow = measureTextEffects(
      [
        {
          id: "g",
          effect: "light.glow",
          params: { radius: 8, intensity: 1, threshold: 0.5 },
        },
      ] as Effects,
      state(),
      textColors(node, prepared),
    )!.list[0]!;
    // #FFE600: 0.2126 + 0.7152 × 230/255 ≈ 0.858, so (0.858 − 0.5) / 0.5.
    expect(glow.strength).toBeCloseTo(
      (0.2126 + (0.7152 * 230) / 255 - 0.5) / 0.5,
      6,
    );
    expect(glow.visible).not.toBeNull();
  });

  it("lists effects that spread paint as unmeasured", () => {
    const shadow = {
      id: "s",
      effect: "light.drop-shadow",
      params: { offset: [0, 0], blur: 4, opacity: 1, color: "#000000" },
    };
    const measured = measureTextEffects(
      [
        { id: "b", effect: "blur.gaussian", params: { radius: 6 } },
        shadow,
        { id: "c", effect: "color.tint", params: {} },
        { id: "w", effect: "distort.ripple", params: {} },
        { id: "off", effect: "blur.gaussian", enabled: false, params: {} },
      ] as Effects,
      state(),
      [],
    )!;
    expect(measured.list.map((e) => e.id)).toEqual(["s"]);
    expect(measured.unmeasured).toEqual([
      expect.objectContaining({ id: "b", effect: "blur.gaussian" }),
      expect.objectContaining({ id: "w", effect: "distort.ripple" }),
    ]);
    // A spreading effect alone still reports, so `paint` is not mistaken
    // for the whole layer.
    const alone = measureTextEffects(
      [{ id: "b", effect: "blur.gaussian", params: { radius: 6 } }] as Effects,
      state(),
      [],
    )!;
    expect(alone.list).toEqual([]);
    expect(alone.unmeasured.map((e) => e.id)).toEqual(["b"]);
    expect(alone.paint).toEqual(alone.source);
    // Effects that only recolour do not spread paint.
    expect(
      measureTextEffects(
        [{ id: "c", effect: "color.tint", params: {} }] as Effects,
        state(),
        [],
      ),
    ).toBeUndefined();
  });

  it("grows effects from the text container and counts its colours", () => {
    const shadow = [
      {
        id: "s",
        effect: "light.drop-shadow",
        params: { offset: [0, 0], blur: 4, opacity: 1, color: "#000000" },
      },
    ] as Effects;
    const container = box(-140, -40, 160, 180);
    const measured = measureTextEffects(shadow, state({ container }), [])!;
    // The container encloses the ink, so it is the whole source.
    expect(measured.source).toEqual(container);
    // ⌈3σ⌉ + 1 = 13 past the container on every side.
    expect(measured.paint).toEqual(box(-153, -53, 173, 193));
    const node = {
      id: "title",
      color: "#111111",
      container: {
        kind: "caption",
        fill: "#FFF8E7",
        stroke: "#514638",
        strokeWidth: 2,
        padding: 20,
        radius: 18,
      },
    } as unknown as Parameters<typeof textColors>[0];
    const prepared = { scene: { textAnimators: [] } } as unknown as Parameters<
      typeof textColors
    >[1];
    expect(textColors(node, prepared)).toEqual([
      "#111111",
      "#FFF8E7",
      "#514638",
    ]);
    const unstroked = {
      ...node,
      container: { ...node.container!, strokeWidth: 0 },
    } as typeof node;
    expect(textColors(unstroked, prepared)).toEqual(["#111111", "#FFF8E7"]);
  });
});
