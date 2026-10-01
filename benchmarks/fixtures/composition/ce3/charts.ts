/**
 * CE3 test charts for the Canvas 2D backend, built in code. The composition
 * browser group checks them against the W3C formulas, and
 * `pnpm composition:hardware-preview` measures hardware-GPU drift on the same charts.
 */
import type {
  BezierPath,
  Composition,
  CompositionBlendMode,
  CompositionLayer,
  CompositionMask,
  TrackMatte,
} from "@still-shift/scene-contract";
import { COMPOSITION_BLEND_MODES } from "@still-shift/scene-contract";

export const chart = (
  layers: CompositionLayer[],
  extra: Partial<Composition> = {},
): Composition => ({
  schemaVersion: "composition-1",
  id: "test",
  width: 160,
  height: 160,
  fps: 30,
  frameCount: 30,
  background: null,
  assets: [],
  layers,
  ...extra,
});

/** A solid placed by its top-left corner. */
export const solid = (
  id: string,
  color: string,
  [x, y, w, h]: [number, number, number, number],
  extra: Partial<Extract<CompositionLayer, { type: "solid" }>> = {},
): CompositionLayer => ({
  id,
  type: "solid",
  size: [w, h],
  color,
  transform: { position: [x, y], anchor: [0, 0] },
  ...extra,
});

export const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): BezierPath => ({
  closed: true,
  vertices: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
});

/** Backdrop columns and source rows; each cell sits 20 px apart, centred at +10. */
export const BACKDROPS = [
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FF00",
  "#3366CC",
  "#CC9933",
  "#808080C0",
  "#1A2B3C80",
];
export const SOURCES = [
  "#FFFFFF",
  "#000000",
  "#0000FF",
  "#FFCC00",
  "#66CC99",
  "#993366",
  "#E0E0E0C0",
  "#40404080",
];

/** 8 × 8 cells: backdrop columns under source rows blended with `mode`, in a
 * transparent precomp so translucent backdrops keep their alpha. */
export function blendChart(mode: CompositionBlendMode): Composition {
  return chart(
    [
      {
        id: "chart",
        type: "precomp",
        comp: "cells",
        transform: { position: [80, 80] },
      },
    ],
    {
      precomps: [
        {
          id: "cells",
          width: 160,
          height: 160,
          frameCount: 30,
          background: null,
          layers: [
            ...SOURCES.map((c, i) =>
              solid(`s${i}`, c, [0, i * 20, 160, 20], { blendMode: mode }),
            ),
            ...BACKDROPS.map((c, i) => solid(`b${i}`, c, [i * 20, 0, 20, 160])),
          ],
        },
      ],
    },
  );
}

/** Matte stripes, 20 px wide; the eighth column stays transparent. */
export const MATTE_COLORS = [
  "#FFFFFF",
  "#000000",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#808080",
  "#FFFFFF80",
  "#33669940",
];
export const MATTE_TARGET = "#FF8000";
export function matteChart(mode: TrackMatte["mode"]): Composition {
  return chart(
    [
      {
        id: "stripes",
        type: "precomp",
        comp: "stripes",
        enabled: false,
        transform: { position: [80, 80] },
      },
      solid("target", MATTE_TARGET, [0, 0, 160, 160], {
        trackMatte: { layer: "stripes", mode },
      }),
    ],
    {
      precomps: [
        {
          id: "stripes",
          width: 160,
          height: 160,
          frameCount: 30,
          background: null,
          layers: MATTE_COLORS.slice(0, 7).map((c, i) =>
            solid(`m${i}`, c, [i * 20, 0, 20, 160]),
          ),
        },
      ],
    },
  );
}

const A = rect(20, 20, 80, 80),
  B = rect(60, 60, 80, 80);
/** Sample points inside mask A only, both, B only, and neither. */
export const MASK_POINTS = {
  a: [40, 40],
  both: [80, 80],
  b: [120, 120],
  none: [130, 30],
} as const;
export type MaskCase = {
  label: string;
  masks: CompositionMask[];
  /** Expected coverage at each of `MASK_POINTS`. */
  expected: Record<keyof typeof MASK_POINTS, number>;
};
export const MASK_CASES: MaskCase[] = [
  {
    label: "add+add",
    masks: [
      { id: "a", path: A, mode: "add" },
      { id: "b", path: B, mode: "add" },
    ],
    expected: { a: 1, both: 1, b: 1, none: 0 },
  },
  {
    label: "add+subtract",
    masks: [
      { id: "a", path: A, mode: "add" },
      { id: "b", path: B, mode: "subtract" },
    ],
    expected: { a: 1, both: 0, b: 0, none: 0 },
  },
  {
    label: "add+intersect",
    masks: [
      { id: "a", path: A, mode: "add" },
      { id: "b", path: B, mode: "intersect" },
    ],
    expected: { a: 0, both: 1, b: 0, none: 0 },
  },
  {
    label: "add+difference",
    masks: [
      { id: "a", path: A, mode: "add" },
      { id: "b", path: B, mode: "difference" },
    ],
    expected: { a: 1, both: 0, b: 1, none: 0 },
  },
  {
    label: "subtract",
    masks: [{ id: "a", path: A, mode: "subtract" }],
    expected: { a: 0, both: 0, b: 1, none: 1 },
  },
  {
    label: "inverted",
    masks: [{ id: "a", path: A, mode: "add", inverted: true }],
    expected: { a: 0, both: 0, b: 1, none: 1 },
  },
  {
    label: "half opacity",
    masks: [{ id: "a", path: A, mode: "add", opacity: 0.5 }],
    expected: { a: 0.5, both: 0.5, b: 0, none: 0 },
  },
  {
    label: "add+half subtract",
    masks: [
      { id: "a", path: A, mode: "add" },
      { id: "b", path: B, mode: "subtract", opacity: 0.5 },
    ],
    expected: { a: 1, both: 0.5, b: 0, none: 0 },
  },
];
export const maskChart = (masks: CompositionMask[]) =>
  chart([solid("white", "#FFFFFF", [0, 0, 160, 160], { masks })]);

/** A 20 px feather on the left edge of a mask whose edge is at x = 40. */
export const featherChart = () =>
  maskChart([
    { id: "a", path: rect(40, 40, 80, 80), mode: "add", feather: 20 },
  ]);

/** Top half grows its mask edge (x = 40) by 10 px; bottom half shrinks it. */
export const expansionChart = () =>
  chart([
    solid("grow", "#FFFFFF", [0, 0, 160, 80], {
      masks: [
        { id: "a", path: rect(40, 20, 80, 40), mode: "add", expansion: 10 },
      ],
    }),
    solid("shrink", "#FFFFFF", [0, 80, 160, 80], {
      masks: [
        { id: "a", path: rect(40, 20, 80, 40), mode: "add", expansion: -10 },
      ],
    }),
  ]);

/**
 * Two nested precomps; the inner one runs reversed from frame 10 and its swatch
 * (origin at 50, 50 in the root) extends 20 px beyond the inner precomp's bounds.
 */
export const nestedChart = (collapse: boolean) =>
  chart(
    [
      {
        id: "outer",
        type: "precomp",
        comp: "outer",
        collapseTransforms: collapse,
        transform: { position: [80, 80] },
      },
    ],
    {
      precomps: [
        {
          id: "outer",
          width: 100,
          height: 100,
          frameCount: 30,
          layers: [
            {
              id: "inner",
              type: "precomp",
              comp: "inner",
              collapseTransforms: collapse,
              startFrame: 10,
              stretch: -1,
              transform: { position: [50, 50] },
            },
          ],
        },
        {
          id: "inner",
          width: 60,
          height: 60,
          frameCount: 30,
          layers: [
            solid("swatch", "#000000", [10, 10, 70, 20], {
              color: {
                keys: [
                  { frame: 0, value: "#000000" },
                  { frame: 10, value: "#FF0000", interpolation: "linear" },
                ],
              },
            }),
          ],
        },
      ],
    },
  );

export const ADJUSTMENT_BACKDROP = "#996633";
/** Left half: multiply adjustment; bottom half: screen adjustment at 50 % opacity. */
export const adjustmentChart = () =>
  chart([
    {
      id: "adjust",
      type: "adjustment",
      size: [80, 160],
      blendMode: "multiply",
      transform: { position: [0, 0], anchor: [0, 0] },
    },
    {
      id: "half",
      type: "adjustment",
      size: [160, 80],
      blendMode: "screen",
      transform: { position: [0, 80], anchor: [0, 0], opacity: 0.5 },
    },
    solid("backdrop", ADJUSTMENT_BACKDROP, [0, 0, 160, 160]),
  ]);

/** A clipping group at (60, 60), 40 px square, and one layer off the surface. */
export const clipChart = () =>
  chart([
    solid("off", "#FFFFFF", [400, 0, 20, 20]),
    solid("child", "#FFFFFF", [0, 0, 160, 160], { parent: "frame" }),
    {
      id: "frame",
      type: "group",
      size: [40, 40],
      clip: true,
      transform: { position: [60, 60], anchor: [0, 0] },
    },
  ]);

/** Every chart with the frames worth sampling, keyed by a stable id. */
export function ce3Charts(): {
  id: string;
  comp: Composition;
  frames: number[];
}[] {
  return [
    ...COMPOSITION_BLEND_MODES.map((mode) => ({
      id: `blend/${mode}`,
      comp: blendChart(mode),
      frames: [0],
    })),
    ...(["alpha", "alpha-inverted", "luma", "luma-inverted"] as const).map(
      (mode) => ({ id: `matte/${mode}`, comp: matteChart(mode), frames: [0] }),
    ),
    ...MASK_CASES.map(({ label, masks }) => ({
      id: `mask/${label}`,
      comp: maskChart(masks),
      frames: [0],
    })),
    { id: "mask/feather", comp: featherChart(), frames: [0] },
    { id: "mask/expansion", comp: expansionChart(), frames: [0] },
    { id: "precomp/nested", comp: nestedChart(false), frames: [0, 5] },
    { id: "precomp/collapsed", comp: nestedChart(true), frames: [0, 5] },
    { id: "adjustment", comp: adjustmentChart(), frames: [0] },
    { id: "group-clip", comp: clipChart(), frames: [0] },
  ];
}
