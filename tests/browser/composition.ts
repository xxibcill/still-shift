import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import type { Page } from "playwright";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type {
  Composition,
  CompositionBlendMode,
  CompositionLayer,
  TrackMatte,
} from "@still-shift/scene-contract";
import { COMPOSITION_BLEND_MODES } from "@still-shift/scene-contract";
import { ffmpegArguments } from "@still-shift/execution-runtime/export";
import { renderComposition } from "../../packages/animation-engine/src/composition-render.ts";
import type * as Render from "../../packages/renderer-core/src/composition/render/index.ts";
import {
  compareFrames,
  meetsTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];
type Rendered = {
  width: number;
  height: number;
  frames: Uint8Array[];
  culled: string[][];
  diagnostics: string[][];
};

const root = resolve(import.meta.dirname, "../..");
const fixtureDir = resolve(root, "benchmarks/fixtures/composition/ce1");
const results: string[] = [];

// ---------------------------------------------------------------------------
// W3C Compositing and Blending Level 1 reference formulas (straight colour).
// ---------------------------------------------------------------------------
const lum = ([r, g, b]: Rgb) => 0.3 * r + 0.59 * g + 0.11 * b;
function clipColor(c: Rgb): Rgb {
  const l = lum(c),
    n = Math.min(...c),
    x = Math.max(...c);
  let out = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as Rgb;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as Rgb;
  return out;
}
const setLum = (c: Rgb, l: number) =>
  clipColor(c.map((v) => v + (l - lum(c))) as Rgb);
const sat = (c: Rgb) => Math.max(...c) - Math.min(...c);
function setSat(c: Rgb, s: number): Rgb {
  const order = [0, 1, 2].sort((a, b) => c[a]! - c[b]!);
  const [min, mid, max] = order as [number, number, number];
  const out: Rgb = [0, 0, 0];
  if (c[max]! > c[min]!) {
    out[mid] = ((c[mid]! - c[min]!) * s) / (c[max]! - c[min]!);
    out[max] = s;
  }
  return out;
}
const separable: Partial<
  Record<CompositionBlendMode, (b: number, s: number) => number>
> = {
  normal: (_b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => hardLight(s, b),
  darken: Math.min,
  lighten: Math.max,
  "color-dodge": (b, s) =>
    b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)),
  "color-burn": (b, s) =>
    b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s),
  "hard-light": (b, s) => hardLight(b, s),
  "soft-light": (b, s) =>
    s <= 0.5
      ? b - (1 - 2 * s) * b * (1 - b)
      : b +
        (2 * s - 1) *
          ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b),
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
};
function hardLight(b: number, s: number) {
  return s <= 0.5 ? b * 2 * s : b + (2 * s - 1) - b * (2 * s - 1);
}
function blend(mode: CompositionBlendMode, cb: Rgb, cs: Rgb): Rgb {
  const f = separable[mode];
  if (f) return cb.map((b, i) => f(b, cs[i]!)) as Rgb;
  if (mode === "hue") return setLum(setSat(cs, sat(cb)), lum(cb));
  if (mode === "saturation") return setLum(setSat(cb, sat(cs)), lum(cb));
  if (mode === "color") return setLum(cs, lum(cb));
  return setLum(cb, lum(cs)); // luminosity
}
/** Premultiplied result of compositing source over backdrop with `mode`. */
function composite(mode: CompositionBlendMode, b: Rgba, s: Rgba): Rgba {
  const [ab, as] = [b[3], s[3]];
  if (mode === "add")
    return [0, 1, 2, 3].map((i) =>
      Math.min(1, i === 3 ? as + ab : s[i]! * as + b[i]! * ab),
    ) as Rgba;
  const mixed = blend(mode, b.slice(0, 3) as Rgb, s.slice(0, 3) as Rgb);
  const co = [0, 1, 2].map(
    (i) => as * ((1 - ab) * s[i]! + ab * mixed[i]!) + (1 - as) * ab * b[i]!,
  );
  return [...co, as + ab * (1 - as)] as Rgba;
}

const hex = (c: string): Rgba => {
  const v = c.slice(1);
  const n = (i: number) => parseInt(v.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), v.length > 6 ? n(6) : 1];
};

// ---------------------------------------------------------------------------
// Fixtures built in code.
// ---------------------------------------------------------------------------
const base = (
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
const solid = (
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
const rect = (x: number, y: number, w: number, h: number) => ({
  closed: true,
  vertices: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ] as [number, number][],
});

const BACKDROPS = [
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FF00",
  "#3366CC",
  "#CC9933",
  "#808080C0",
  "#1A2B3C80",
];
const SOURCES = [
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
function blendChart(mode: CompositionBlendMode): Composition {
  return base(
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

const MATTE_COLORS = [
  "#FFFFFF",
  "#000000",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#808080",
  "#FFFFFF80",
  "#33669940",
];
function matteChart(mode: TrackMatte["mode"]): Composition {
  return base(
    [
      {
        id: "stripes",
        type: "precomp",
        comp: "stripes",
        enabled: false,
        transform: { position: [80, 80] },
      },
      solid("target", "#FF8000", [0, 0, 160, 160], {
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
          // The last column stays transparent.
          layers: MATTE_COLORS.slice(0, 7).map((c, i) =>
            solid(`m${i}`, c, [i * 20, 0, 20, 160]),
          ),
        },
      ],
    },
  );
}

// ---------------------------------------------------------------------------
// Rendering in the pinned browser.
// ---------------------------------------------------------------------------
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const origin = server.resolvedUrls!.local[0]!;
const browser = await launchRenderBrowser();
const directory = await mkdtemp(join(tmpdir(), "still-shift-ce3-"));

const assetUrls = (comp: Composition, dir = fixtureDir) =>
  Object.fromEntries(
    comp.assets.map((a) => [
      a.id,
      new URL(`/@fs${resolve(dir, a.path)}`, origin).href,
    ]),
  );

async function render(
  page: Page,
  comp: Composition,
  frames: number[],
  urls: Record<string, string> = {},
): Promise<Rendered> {
  const out = await page.evaluate(
    async ({ compJson, frames, urls, moduleUrl }) => {
      const comp = JSON.parse(compJson);
      const m = (await import(moduleUrl)) as typeof Render;
      const resources = await m.loadCompositionResources(
        comp,
        (id) => urls[id]!,
      );
      const canvas = document.createElement("canvas");
      const preview = m.createCompositionPreview(canvas, comp, resources);
      const ctx = canvas.getContext("2d")!;
      const encoded: string[] = [];
      const culled: string[][] = [];
      const diagnostics: string[][] = [];
      for (const frame of frames) {
        const report = preview.renderFrame(frame);
        culled.push(report.culled);
        diagnostics.push(report.diagnostics.map((d) => d.code));
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let binary = "";
        for (let i = 0; i < data.length; i += 0x8000)
          binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
        encoded.push(btoa(binary));
      }
      preview.dispose();
      return {
        width: canvas.width,
        height: canvas.height,
        encoded,
        culled,
        diagnostics,
      };
    },
    {
      compJson: JSON.stringify(comp),
      frames,
      urls,
      moduleUrl: `${origin}packages/renderer-core/src/composition/render/index.ts`,
    },
  );
  return {
    width: out.width,
    height: out.height,
    frames: out.encoded.map((b) => new Uint8Array(Buffer.from(b, "base64"))),
    culled: out.culled,
    diagnostics: out.diagnostics,
  };
}

const pixel = (r: Rendered, x: number, y: number, frame = 0): Rgb => {
  const i = (y * r.width + x) * 4;
  const f = r.frames[frame]!;
  return [f[i]!, f[i + 1]!, f[i + 2]!];
};
const near = (actual: Rgb, expected: Rgb, tolerance: number, label: string) => {
  const delta = Math.max(...actual.map((v, i) => Math.abs(v - expected[i]!)));
  assert.ok(
    delta <= tolerance,
    `${label}: got ${actual.join(",")}, expected ${expected.join(",")} (Δ${delta})`,
  );
  return delta;
};
const toBytes = (c: number[]) =>
  c
    .slice(0, 3)
    .map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)) as Rgb;

try {
  const page = await browser.newPage();
  await page.goto(origin);

  // Blend modes against the W3C formulas, `near` tier (≤ 2 levels per channel).
  let worstBlend = 0;
  for (const mode of COMPOSITION_BLEND_MODES) {
    const rendered = await render(page, blendChart(mode), [0]);
    for (let row = 0; row < 8; row++)
      for (let column = 0; column < 8; column++) {
        // Exports are opaque: the composite lands on black.
        const expected = toBytes(
          composite(mode, hex(BACKDROPS[column]!), hex(SOURCES[row]!)),
        );
        worstBlend = Math.max(
          worstBlend,
          near(
            pixel(rendered, column * 20 + 10, row * 20 + 10),
            expected,
            2,
            `${mode} backdrop ${BACKDROPS[column]} source ${SOURCES[row]}`,
          ),
        );
      }
  }
  results.push(
    `${COMPOSITION_BLEND_MODES.length} blend modes × 64 cells match W3C formulas (max Δ${worstBlend})`,
  );

  // Track mattes: alpha, inverted alpha and CSS Masking luminance.
  let worstMatte = 0;
  for (const mode of [
    "alpha",
    "alpha-inverted",
    "luma",
    "luma-inverted",
  ] as const) {
    const rendered = await render(page, matteChart(mode), [0]);
    MATTE_COLORS.forEach((color, i) => {
      const [r, g, b, a] = i < 7 ? hex(color) : [0, 0, 0, 0];
      const luma = (0.2125 * r! + 0.7154 * g! + 0.0721 * b!) * a!;
      const value =
        mode === "alpha"
          ? a!
          : mode === "alpha-inverted"
            ? 1 - a!
            : mode === "luma"
              ? luma
              : 1 - luma;
      const expected = toBytes(
        hex("#FF8000")
          .slice(0, 3)
          .map((c) => c * value),
      );
      worstMatte = Math.max(
        worstMatte,
        near(
          pixel(rendered, i * 20 + 10, 80),
          expected,
          2,
          `${mode} matte ${color}`,
        ),
      );
    });
  }
  results.push(`4 matte modes × 8 matte values match (max Δ${worstMatte})`);

  // Masks: boolean modes, inversion, opacity, feather and expansion.
  const A = rect(20, 20, 80, 80),
    B = rect(60, 60, 80, 80);
  const points = {
    a: [40, 40],
    both: [80, 80],
    b: [120, 120],
    none: [130, 30],
  } as const;
  const maskCases: [
    string,
    CompositionLayer["masks"],
    Record<keyof typeof points, number>,
  ][] = [
    [
      "add+add",
      [
        { id: "a", path: A, mode: "add" },
        { id: "b", path: B, mode: "add" },
      ],
      { a: 1, both: 1, b: 1, none: 0 },
    ],
    [
      "add+subtract",
      [
        { id: "a", path: A, mode: "add" },
        { id: "b", path: B, mode: "subtract" },
      ],
      { a: 1, both: 0, b: 0, none: 0 },
    ],
    [
      "add+intersect",
      [
        { id: "a", path: A, mode: "add" },
        { id: "b", path: B, mode: "intersect" },
      ],
      { a: 0, both: 1, b: 0, none: 0 },
    ],
    [
      "add+difference",
      [
        { id: "a", path: A, mode: "add" },
        { id: "b", path: B, mode: "difference" },
      ],
      { a: 1, both: 0, b: 1, none: 0 },
    ],
    [
      "subtract",
      [{ id: "a", path: A, mode: "subtract" }],
      { a: 0, both: 0, b: 1, none: 1 },
    ],
    [
      "inverted",
      [{ id: "a", path: A, mode: "add", inverted: true }],
      { a: 0, both: 0, b: 1, none: 1 },
    ],
    [
      "half opacity",
      [{ id: "a", path: A, mode: "add", opacity: 0.5 }],
      { a: 0.5, both: 0.5, b: 0, none: 0 },
    ],
    [
      "add+half subtract",
      [
        { id: "a", path: A, mode: "add" },
        { id: "b", path: B, mode: "subtract", opacity: 0.5 },
      ],
      { a: 1, both: 0.5, b: 0, none: 0 },
    ],
  ];
  for (const [label, masks, expected] of maskCases) {
    const rendered = await render(
      page,
      base([solid("white", "#FFFFFF", [0, 0, 160, 160], { masks: masks! })]),
      [0],
    );
    for (const [name, [x, y]] of Object.entries(points))
      near(
        pixel(rendered, x, y),
        toBytes(
          [1, 1, 1].map((v) => v * expected[name as keyof typeof points]!),
        ),
        1,
        `mask ${label} at ${name}`,
      );
  }
  const feathered = await render(
    page,
    base([
      solid("white", "#FFFFFF", [0, 0, 160, 160], {
        masks: [
          { id: "a", path: rect(40, 40, 80, 80), mode: "add", feather: 20 },
        ],
      }),
    ]),
    [0],
  );
  const ramp = [30, 35, 40, 45, 50].map((x) => pixel(feathered, x, 80)[0]);
  assert.ok(
    ramp.every((v, i) => i === 0 || v > ramp[i - 1]!),
    `feather ramps across the edge: ${ramp.join(",")}`,
  );
  near(
    pixel(feathered, 40, 80),
    [128, 128, 128],
    6,
    "feather is half at the edge",
  );
  near(
    pixel(feathered, 80, 80),
    [255, 255, 255],
    1,
    "feather leaves the centre",
  );
  const expanded = await render(
    page,
    base([
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
    ]),
    [0],
  );
  near(pixel(expanded, 34, 40), [255, 255, 255], 1, "positive expansion grows");
  near(pixel(expanded, 26, 40), [0, 0, 0], 1, "positive expansion is bounded");
  near(pixel(expanded, 46, 120), [0, 0, 0], 1, "negative expansion shrinks");
  near(
    pixel(expanded, 56, 120),
    [255, 255, 255],
    1,
    "negative expansion keeps the inside",
  );
  results.push(
    `${maskCases.length} mask combinations, feather and expansion match`,
  );

  // Precomps: nesting, clipping to bounds unless collapsed, nested time.
  const nested = (collapse: boolean): Composition =>
    base(
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
              // Extends 20 px beyond the inner precomp on the right.
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
  for (const collapse of [false, true]) {
    // Reversed from frame 10: inner time = 10 − frame.
    const rendered = await render(page, nested(collapse), [0, 5]);
    // inner origin = 80 − 50 + 50 − 30 = 50.
    near(
      pixel(rendered, 70, 70, 0),
      [255, 0, 0],
      1,
      `nested time at 0 (collapse ${collapse})`,
    );
    near(
      pixel(rendered, 70, 70, 1),
      [128, 0, 0],
      2,
      `nested time at 5 (collapse ${collapse})`,
    );
    near(
      pixel(rendered, 125, 70, 0),
      collapse ? [255, 0, 0] : [0, 0, 0],
      1,
      `precomp bounds clip unless collapsed (${collapse})`,
    );
  }
  results.push("nested precomps keep nested time and clip unless collapsed");

  // Adjustment layers re-composite what is below within their region.
  const adjusted = await render(
    page,
    base([
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
      solid("backdrop", "#996633", [0, 0, 160, 160]),
    ]),
    [0],
  );
  const c = hex("#996633").slice(0, 3) as Rgb;
  near(
    pixel(adjusted, 40, 40),
    toBytes(c.map((v) => v * v)),
    2,
    "multiply adjustment",
  );
  near(pixel(adjusted, 120, 40), toBytes(c), 1, "outside the adjustment");
  near(
    pixel(adjusted, 120, 120),
    toBytes(c.map((v) => 0.5 * v + 0.5 * (2 * v - v * v))),
    2,
    "half-opacity screen adjustment",
  );
  results.push("adjustment layers apply their blend inside their region");

  // Group clips and culling.
  const clipped = await render(
    page,
    base([
      solid("off", "#FFFFFF", [400, 0, 20, 20]),
      solid("child", "#FFFFFF", [0, 0, 160, 160], { parent: "frame" }),
      {
        id: "frame",
        type: "group",
        size: [40, 40],
        clip: true,
        transform: { position: [60, 60], anchor: [0, 0] },
      },
    ]),
    [0],
  );
  near(pixel(clipped, 80, 80), [255, 255, 255], 0, "inside the group clip");
  near(pixel(clipped, 30, 30), [0, 0, 0], 0, "outside the group clip");
  assert.deepEqual(clipped.culled[0], ["off"]);
  results.push("group clips apply; off-surface layers are culled");

  // Fixtures: every CE1 field renders with prepared text bounds.
  const everyField = JSON.parse(
    await readFile(resolve(fixtureDir, "every-field.json"), "utf8"),
  ) as Composition;
  const everyFrames = Array.from(
    { length: Math.ceil(everyField.frameCount / 10) },
    (_, i) => i * 10,
  );
  const every = await render(
    page,
    everyField,
    everyFrames,
    assetUrls(everyField),
  );
  assert.deepEqual(
    every.diagnostics
      .flat()
      .filter((code) => code === "comp-text-layout-missing"),
    [],
    "text bounds are prepared for every text layer",
  );
  results.push(
    `every-field renders ${everyFrames.length} frames without text-layout diagnostics`,
  );

  // First slice: deterministic preview, and MP4 export from the same renderer.
  const firstSlice = JSON.parse(
    await readFile(resolve(fixtureDir, "first-slice.json"), "utf8"),
  ) as Composition;
  const sliceFrames = [0, 20, 45, 89];
  const first = await render(
    page,
    firstSlice,
    sliceFrames,
    assetUrls(firstSlice),
  );
  const fresh = await browser.newPage();
  await fresh.goto(origin);
  const second = await render(
    fresh,
    firstSlice,
    sliceFrames,
    assetUrls(firstSlice),
  );
  const digest = (f: Uint8Array) =>
    createHash("sha256").update(f).digest("hex");
  assert.deepEqual(
    second.frames.map(digest),
    first.frames.map(digest),
    "first-slice preview is identical across page loads",
  );
  const outputPath = join(directory, "first-slice.mp4");
  const exported = await renderComposition({
    compositionPath: resolve(fixtureDir, "first-slice.json"),
    outputPath,
  });
  assert.equal(exported.rendererVersion, "composition-canvas-1.0.0");
  const manifest = JSON.parse(
    await readFile(`${outputPath}.scene.json`, "utf8"),
  );
  assert.equal(manifest.rendererVersion, "composition-canvas-1.0.0");
  // Encode the preview's own frames with the export's encoder arguments: when
  // export renders the same pixels, the decoded videos are identical.
  const previewPngs = await page.evaluate(
    async ({ compJson, urls, moduleUrl }) => {
      const comp = JSON.parse(compJson);
      const m = (await import(moduleUrl)) as typeof Render;
      const resources = await m.loadCompositionResources(
        comp,
        (id) => urls[id]!,
      );
      const canvas = document.createElement("canvas");
      const preview = m.createCompositionPreview(canvas, comp, resources);
      const pngs: string[] = [];
      for (let frame = 0; frame < comp.frameCount; frame++) {
        preview.renderFrame(frame);
        pngs.push(canvas.toDataURL("image/png").split(",")[1]!);
      }
      preview.dispose();
      return pngs;
    },
    {
      compJson: JSON.stringify(firstSlice),
      urls: assetUrls(firstSlice),
      moduleUrl: `${origin}packages/renderer-core/src/composition/render/index.ts`,
    },
  );
  const referencePath = join(directory, "first-slice-preview.mp4");
  await new Promise<void>((accept, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      ffmpegArguments(manifest.scene, referencePath, "libx264", "png_pipe"),
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) =>
      code === 0 ? accept() : reject(new Error(`ffmpeg ${code}`)),
    );
    for (const png of previewPngs)
      ffmpeg.stdin.write(Buffer.from(png, "base64"));
    ffmpeg.stdin.end();
  });
  const decode = (path: string, frame: number) =>
    new Promise<Uint8Array>((accept, reject) => {
      const ffmpeg = spawn(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          path,
          "-vf",
          `select=eq(n\\,${frame})`,
          "-fps_mode",
          "vfr",
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const chunks: Buffer[] = [];
      ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      ffmpeg.on("error", reject);
      ffmpeg.on("close", (code) =>
        code === 0
          ? accept(Buffer.concat(chunks))
          : reject(new Error(`ffmpeg ${code}`)),
      );
    });
  const psnr: number[] = [];
  for (const [i, frame] of sliceFrames.entries()) {
    const exportedFrame = await decode(outputPath, frame);
    const reference = compareFrames(
      await decode(referencePath, frame),
      exportedFrame,
      first.width,
      first.height,
    );
    assert.ok(
      meetsTier(reference, "exact"),
      `export frame ${frame} equals the encoded preview: ${JSON.stringify(reference)}`,
    );
    // For the record: what H.264 at CRF 18 costs against the raw preview.
    psnr.push(
      Math.round(
        compareFrames(
          first.frames[i]!,
          exportedFrame,
          first.width,
          first.height,
        ).psnr * 10,
      ) / 10,
    );
  }
  results.push(
    `first-slice preview is identical across loads; export decodes identically to the encoded preview (H.264 vs raw preview PSNR ${psnr.join(", ")} dB)`,
  );
  // Export transactions, as for legacy scenes (tests/browser/export-worker.ts).
  const firstBytes = await readFile(outputPath);
  const again = join(directory, "again.mp4");
  await renderComposition({
    compositionPath: resolve(fixtureDir, "first-slice.json"),
    outputPath: again,
  });
  assert.deepEqual(
    await readFile(again),
    firstBytes,
    "repeat export is byte-identical",
  );
  const raw = join(directory, "raw.mp4");
  const rawResult = await renderComposition({
    compositionPath: resolve(fixtureDir, "first-slice.json"),
    outputPath: raw,
    transport: "raw_rgba",
  });
  assert.equal(rawResult.metrics.frameTransport, "raw_rgba");
  assert.deepEqual(
    await readFile(raw),
    firstBytes,
    "raw RGBA transport matches PNG",
  );
  const jpeg = await renderComposition({
    compositionPath: resolve(fixtureDir, "first-slice.json"),
    outputPath: join(directory, "jpeg.mp4"),
    transport: "jpeg_pipe",
  });
  assert.equal(jpeg.frameCount, 90);
  const existing = join(directory, "existing.mp4");
  await writeFile(existing, "existing output");
  await assert.rejects(
    renderComposition({
      compositionPath: resolve(fixtureDir, "first-slice.json"),
      outputPath: existing,
    }),
    /Output already exists/,
  );
  assert.equal(await readFile(existing, "utf8"), "existing output");
  const invalidPath = join(directory, "invalid.json");
  await writeFile(
    invalidPath,
    JSON.stringify({ ...firstSlice, frameCount: 0 }),
  );
  await assert.rejects(
    renderComposition({
      compositionPath: invalidPath,
      outputPath: join(directory, "invalid.mp4"),
    }),
    (error: Error & { code?: string }) => error.code === "SCENE_INVALID",
  );
  const tamperedPath = join(fixtureDir, ".tampered-first-slice.json");
  await writeFile(
    tamperedPath,
    JSON.stringify({
      ...firstSlice,
      assets: firstSlice.assets.map((a) =>
        a.id === "house" ? { ...a, sha256: `sha256:${"0".repeat(64)}` } : a,
      ),
    }),
  );
  try {
    await assert.rejects(
      renderComposition({
        compositionPath: tamperedPath,
        outputPath: join(directory, "tampered.mp4"),
      }),
      /checksum differs/,
    );
  } finally {
    await rm(tamperedPath, { force: true });
  }
  assert.deepEqual(
    (await readdir(directory)).filter(
      (path) =>
        path.includes(".tmp.") ||
        path.startsWith("invalid.mp4") ||
        path.startsWith("tampered.mp4"),
    ),
    [],
    "failed exports leave no files",
  );
  results.push(
    "export is byte-identical on repeat and across PNG/raw transports; failures publish nothing",
  );
  for (const line of results) console.log(`Composition render: ${line}`);
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
