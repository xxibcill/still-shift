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
  TextAnimator,
} from "@still-shift/scene-contract";
import { COMPOSITION_BLEND_MODES } from "@still-shift/scene-contract";
import { ffmpegArguments } from "@still-shift/execution-runtime/export";
import { renderComposition } from "../../packages/animation-engine/src/composition-render.ts";
import {
  ADJUSTMENT_BACKDROP,
  BACKDROPS,
  MASK_CASES,
  MASK_POINTS,
  MATTE_COLORS,
  MATTE_TARGET,
  SOURCES,
  adjustmentChart,
  blendChart,
  clipChart,
  expansionChart,
  featherChart,
  maskChart,
  matteChart,
  nestedChart,
} from "../../benchmarks/fixtures/composition/ce3/charts.ts";
import type * as Render from "../../packages/renderer-core/src/composition/render/index.ts";
import { COMPOSITION_RENDERER_VERSION } from "../../packages/renderer-core/src/composition/render/index.ts";
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
  textBounds: Render.CompositionPreview["textBounds"];
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
        textBounds: preview.textBounds,
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
    textBounds: out.textBounds,
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
        hex(MATTE_TARGET)
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

  for (const mode of [
    "alpha",
    "alpha-inverted",
    "luma",
    "luma-inverted",
  ] as const) {
    for (const sourceOpacity of [1, 0.5]) {
      const doc: Composition = {
        schemaVersion: "composition-1",
        id: "collapsed-matte",
        width: 100,
        height: 100,
        fps: 30,
        frameCount: 1,
        assets: [],
        background: "#000000",
        layers: [
          {
            id: "host",
            type: "precomp",
            comp: "inner",
            collapseTransforms: true,
            transform: { anchor: [0, 0], opacity: 0.5 },
          },
        ],
        precomps: [
          {
            id: "inner",
            width: 100,
            height: 100,
            frameCount: 1,
            layers: [
              {
                id: "matte",
                type: "solid",
                size: [100, 100],
                color: "#ffffff",
                transform: { anchor: [0, 0], opacity: sourceOpacity },
              },
              {
                id: "target",
                type: "solid",
                size: [100, 100],
                color: "#ffffff",
                transform: { anchor: [0, 0] },
                trackMatte: { layer: "matte", mode },
              },
            ],
          },
        ],
      };
      const rendered = await render(page, doc, [0]);
      const coverage = mode.endsWith("inverted")
        ? 1 - sourceOpacity
        : sourceOpacity;
      near(
        pixel(rendered, 25, 25),
        toBytes([1, 1, 1].map(() => 0.5 * coverage)),
        1,
        `${mode} preserves source opacity inside a collapsed host`,
      );
    }
  }
  results.push("collapsed host opacity applies once across all matte modes");

  // Masks: boolean modes, inversion, opacity, feather and expansion.
  for (const { label, masks, expected } of MASK_CASES) {
    const rendered = await render(page, maskChart(masks), [0]);
    for (const [name, [x, y]] of Object.entries(MASK_POINTS))
      near(
        pixel(rendered, x, y),
        toBytes(
          [1, 1, 1].map((v) => v * expected[name as keyof typeof MASK_POINTS]!),
        ),
        1,
        `mask ${label} at ${name}`,
      );
  }
  const feathered = await render(page, featherChart(), [0]);
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
  const expanded = await render(page, expansionChart(), [0]);
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
    `${MASK_CASES.length} mask combinations, feather and expansion match`,
  );

  // Precomps: nesting, clipping to bounds unless collapsed, nested time.
  for (const collapse of [false, true]) {
    // Reversed from frame 10: inner time = 10 − frame.
    const rendered = await render(page, nestedChart(collapse), [0, 5]);
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
  const adjusted = await render(page, adjustmentChart(), [0]);
  const c = hex(ADJUSTMENT_BACKDROP).slice(0, 3) as Rgb;
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
  const clipped = await render(page, clipChart(), [0]);
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

  const genericStyle: Composition = {
    schemaVersion: "composition-1",
    id: "generic-style",
    width: 300,
    height: 100,
    fps: 30,
    frameCount: 1,
    background: "#000000",
    assets: [],
    textStyles: { large: { size: 80 } },
    layers: [
      {
        id: "text",
        type: "text",
        text: "TEST",
        fontSize: 20,
        style: "large",
        color: "#ffffff",
        transform: { position: [30, 10] },
      },
    ],
  };
  for (const position of [
    [30, 10],
    [-100, 10],
  ] as [number, number][]) {
    const styled = structuredClone(genericStyle);
    styled.layers[0]!.transform = { position };
    const control = structuredClone(styled);
    const controlLayer = control.layers[0]!;
    if (controlLayer.type !== "text") throw new Error("Expected text");
    delete controlLayer.style;
    controlLayer.fontSize = 80;
    const actual = await render(page, styled, [0]);
    const expected = await render(page, control, [0]);
    assert.ok(
      actual.frames[0]!.every((value, i) => value === expected.frames[0]![i]),
      "generic text uses style size",
    );
    assert.deepEqual(
      actual.textBounds,
      expected.textBounds,
      "generic text measures style size",
    );
    assert.deepEqual(actual.culled, [[]], "style-sized text remains visible");
  }
  results.push(
    "generic-font style size controls rendering, measured bounds and culling",
  );

  const strokeText: Composition = {
    schemaVersion: "composition-1",
    id: "stroke-text",
    width: 300,
    height: 100,
    fps: 30,
    frameCount: 10,
    background: "#000000",
    assets: everyField.assets.filter((asset) => asset.id === "display"),
    layers: [
      {
        id: "text",
        type: "text",
        text: "Test",
        fontSize: 30,
        fontAsset: "display",
        color: "#ffffff",
        transform: { position: [30, 30] },
      },
    ],
    textAnimators: [
      {
        node: "text",
        unit: "glyph",
        start: 0,
        end: 5,
        stagger: 0,
        selector: { start: 0, end: 1, easing: "linear" },
        from: { strokeWidth: 0 },
        to: { strokeWidth: 10 },
      },
    ],
  };
  const strokeFrames = await render(
    page,
    strokeText,
    [0, 5, 9],
    assetUrls(strokeText),
  );
  const litPixels = (frame: Uint8Array) =>
    frame.reduce(
      (count, value, index) => count + (index % 4 !== 3 && value > 0 ? 1 : 0),
      0,
    );
  assert.ok(litPixels(strokeFrames.frames[0]!) > 0, "base text is visible");
  assert.ok(
    litPixels(strokeFrames.frames[1]!) > litPixels(strokeFrames.frames[0]!),
    "animated stroke increases visible ink",
  );
  assert.deepEqual(
    strokeFrames.frames[1],
    strokeFrames.frames[2],
    "settled stroke remains drawable",
  );
  results.push(
    "stroke-width text animators prepare and render through settlement",
  );

  const changingStroke = structuredClone(strokeText);
  const changingStrokeLayer = changingStroke.layers[0]!;
  if (changingStrokeLayer.type !== "text") throw new Error("Expected text");
  changingStrokeLayer.color = {
    keys: [
      { frame: 0, value: "#ffffff", interpolation: "hold" },
      { frame: 5, value: "#ff0000" },
    ],
  };
  const redStroke = structuredClone(strokeText);
  const redStrokeLayer = redStroke.layers[0]!;
  if (redStrokeLayer.type !== "text") throw new Error("Expected text");
  redStrokeLayer.color = "#ff0000";
  const animatedStroke = await render(
    page,
    changingStroke,
    [0, 5, 9, 0],
    assetUrls(changingStroke),
  );
  const redStrokeFrames = await render(
    page,
    redStroke,
    [5, 9],
    assetUrls(redStroke),
  );
  assert.deepEqual(animatedStroke.frames[0], strokeFrames.frames[0]);
  for (const i of [0, 1])
    assert.ok(
      meetsTier(
        compareFrames(
          animatedStroke.frames[i + 1]!,
          redStrokeFrames.frames[i]!,
          300,
          100,
        ),
        "near",
      ),
      "animated default stroke color matches static red text",
    );
  assert.deepEqual(
    animatedStroke.frames[3],
    animatedStroke.frames[0],
    "stroke recoloring supports backward seeks",
  );
  results.push("animated text color recolors cached stroke coverage");

  for (const [label, from, to, middle] of [
    ["transparent to opaque", "#ffffff00", "#ffffff", "#ffffff55"],
    ["translucent to opaque", "#ffffff80", "#ffffff", "#ffffffaa"],
    ["opaque to transparent", "#ffffff", "#ffffff00", "#ffffffaa"],
  ] as const) {
    const fadingText = structuredClone(strokeText);
    fadingText.textAnimators = [];
    const fadingLayer = fadingText.layers[0]!;
    if (fadingLayer.type !== "text") throw new Error("Expected text");
    fadingLayer.color = {
      keys: [
        { frame: 0, value: from },
        { frame: 9, value: to, interpolation: "linear" },
      ],
    };
    const fade = await render(
      page,
      fadingText,
      [0, 3, 9, 0, 9],
      assetUrls(fadingText),
    );
    for (const [index, color] of [from, middle, to].entries()) {
      const control = structuredClone(fadingText);
      const controlLayer = control.layers[0]!;
      if (controlLayer.type !== "text") throw new Error("Expected text");
      controlLayer.color = color;
      const expected = await render(page, control, [0], assetUrls(control));
      assert.ok(
        meetsTier(
          compareFrames(fade.frames[index]!, expected.frames[0]!, 300, 100),
          "near",
        ),
        `${label}: sampled alpha matches static alpha`,
      );
    }
    assert.deepEqual(fade.frames[3], fade.frames[0], `${label}: backward seek`);
    assert.deepEqual(fade.frames[4], fade.frames[2], `${label}: repeat seek`);
  }
  results.push(
    "animated text alpha matches static coverage in both directions",
  );

  const spanFade = structuredClone(strokeText);
  spanFade.textAnimators = [];
  const spanLayer = spanFade.layers[0]!;
  if (spanLayer.type !== "text") throw new Error("Expected text");
  spanLayer.color = {
    keys: [
      { frame: 0, value: "#ffffff00" },
      { frame: 9, value: "#ffffff" },
    ],
  };
  spanLayer.spans = [{ id: "accent", start: 0, end: 2, color: "#ff0000" }];
  const spanFrames = await render(page, spanFade, [0, 9], assetUrls(spanFade));
  const redInk = (frame: Uint8Array) =>
    frame.reduce(
      (sum, value, index) =>
        sum + (index % 4 === 0 ? Math.max(0, value - frame[index + 1]!) : 0),
      0,
    );
  assert.ok(
    redInk(spanFrames.frames[0]!) > 0,
    "span color survives transparent layer color",
  );
  assert.equal(
    redInk(spanFrames.frames[0]!),
    redInk(spanFrames.frames[1]!),
    "span color remains independent of animated layer color",
  );
  const green = (frame: Uint8Array) =>
    frame.filter((_, index) => index % 4 === 1);
  const red = (frame: Uint8Array) =>
    frame.filter((_, index) => index % 4 === 0);
  assert.ok(
    Math.max(...red(spanFrames.frames[0]!)) === 255,
    "span retains its authored color",
  );
  assert.equal(Math.max(...green(spanFrames.frames[0]!)), 0);
  assert.equal(Math.max(...green(spanFrames.frames[1]!)), 255);

  const filledFade = structuredClone(spanFade);
  const filledLayer = filledFade.layers[0]!;
  if (filledLayer.type !== "text") throw new Error("Expected text");
  delete filledLayer.spans;
  filledFade.textAnimators = [
    {
      ...strokeText.textAnimators![0]!,
      from: { fill: "#00ff00" },
      to: { fill: "#00ff00" },
    },
  ];
  const fillFrames = await render(
    page,
    filledFade,
    [0, 9],
    assetUrls(filledFade),
  );
  assert.deepEqual(
    fillFrames.frames[0],
    fillFrames.frames[1],
    "animator fill remains independent of layer color",
  );
  assert.ok(
    Math.max(...green(fillFrames.frames[0]!)) === 255,
    "animator fill retains its authored color",
  );
  results.push(
    "span colors and animator fills remain independent during layer fades",
  );

  const motionCases: [
    string,
    string,
    [number, number],
    TextAnimator["from"][],
    Pick<TextAnimator, "anchor" | "anchorAlign">,
  ][] = [
    [
      "additive offsets",
      "Test",
      [-300, 30],
      [{ offset: [200, 0] }, { offset: [200, 0] }],
      {},
    ],
    ["tracking", "Test", [-100, 30], [{ tracking: 2000 }], {}],
    ["leading", "Test\nTest\nTest", [30, -150], [{ leading: 4 }], {}],
    [
      "group rotation",
      "MMMMMMMMMMMM",
      [320, 30],
      [{ rotation: 180 }],
      { anchor: "all", anchorAlign: [0, 0.5] },
    ],
  ];
  for (const [label, text, position, properties, extra] of motionCases) {
    const moving: Composition = {
      ...strokeText,
      layers: [
        {
          id: "text",
          type: "text",
          text,
          fontSize: 30,
          color: "#ffffff",
          fontAsset: "display",
          transform: { position: [...position] },
        },
      ],
      textAnimators: properties.map((property) => ({
        ...strokeText.textAnimators![0]!,
        ...extra,
        blend: "add",
        ...(extra.anchorAlign ? { anchorAlign: [...extra.anchorAlign] } : {}),
        from: structuredClone(property),
        to: structuredClone(property),
      })),
    };
    const rendered = await render(page, moving, [0, 5, 9], assetUrls(moving));
    assert.ok(
      rendered.frames.every((frame) => litPixels(frame) > 0),
      `${label} brings offscreen text into view`,
    );
    assert.deepEqual(
      rendered.culled,
      [[], [], []],
      `${label} is included in measured bounds`,
    );
  }
  results.push(
    "text bounds cover combined offsets, tracking, leading and group rotation",
  );

  const fastStroke: Composition = {
    ...strokeText,
    layers: strokeText.layers.map((layer) => ({ ...layer, stretch: 0.5 })),
    textAnimators: strokeText.textAnimators!.map((animator) => ({
      ...animator,
      end: 10,
    })),
  };
  const fastStrokeFrames = await render(
    page,
    fastStroke,
    [5, 9],
    assetUrls(fastStroke),
  );
  assert.deepEqual(
    fastStrokeFrames.frames[0],
    strokeFrames.frames[1],
    "stroke caches include settled layer times beyond scope frames",
  );
  assert.deepEqual(
    fastStrokeFrames.frames[1],
    strokeFrames.frames[1],
    "settled strokes remain cached at later layer times",
  );

  const axisText: Composition = {
    ...strokeText,
    id: "axis-text",
    assets: everyField.assets.filter((asset) => asset.id === "body"),
    layers: [
      {
        ...strokeText.layers[0]!,
        type: "text",
        text: "Test",
        fontSize: 30,
        color: "#ffffff",
        fontAsset: "body",
      },
    ],
    textAnimators: [
      {
        ...strokeText.textAnimators![0]!,
        end: 10,
        from: { axes: { wght: 0 } },
        to: { axes: { wght: 100 } },
      },
    ],
  };
  for (const clock of [
    { stretch: 0.5, startFrame: 0 },
    { stretch: 2, startFrame: -10 },
    { stretch: -1, startFrame: 10 },
  ]) {
    const timed = {
      ...axisText,
      layers: axisText.layers.map((layer) => ({ ...layer, ...clock })),
    };
    const rendered = await render(page, timed, [0, 5, 9], assetUrls(timed));
    assert.ok(
      rendered.frames.every((frame) => litPixels(frame) > 0),
      "axis variants follow layer clocks",
    );
  }
  const reusedAxes: Composition = {
    ...axisText,
    frameCount: 12,
    layers: [
      {
        id: "fast",
        type: "precomp",
        comp: "inner",
        transform: { anchor: [0, 0] },
      },
      {
        id: "remapped",
        type: "precomp",
        comp: "inner",
        timeRemap: {
          keys: [
            { frame: 0, value: 29 },
            { frame: 11, value: 0 },
          ],
        },
        transform: { anchor: [0, 0], position: [150, 0] },
      },
    ],
    textAnimators: [],
    precomps: [
      {
        id: "inner",
        width: 150,
        height: 100,
        fps: 60,
        frameCount: 30,
        layers: axisText.layers.map((layer) => ({ ...layer, stretch: 0.5 })),
        textAnimators: axisText.textAnimators!,
      },
    ],
  };
  const nestedAxes = await render(
    page,
    reusedAxes,
    [0, 5, 11],
    assetUrls(reusedAxes),
  );
  assert.ok(
    nestedAxes.frames.every((frame) => litPixels(frame) > 0),
    "axis variants cover reused, remapped and differing-fps precomps",
  );
  results.push(
    "font-axis variants follow stretched, reversed and reused precomp clocks",
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
  // The Lab composition page renders the same pixels in the pinned browser.
  const lab = await createServer({
    configFile: resolve(root, "apps/lab/vite.config.ts"),
    server: { port: 0, strictPort: false, watch: null },
    logLevel: "error",
  });
  try {
    await lab.listen();
    const labPage = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
    });
    const pageErrors: string[] = [];
    labPage.on("pageerror", (error) => pageErrors.push(error.message));
    await labPage.goto(
      new URL(
        "/composition.html?scene=ce1/first-slice.json",
        lab.resolvedUrls!.local[0]!,
      ).href,
    );
    await labPage.waitForFunction(
      () => document.querySelector("#status")?.getAttribute("data-ready"),
      undefined,
      { timeout: 30_000 },
    );
    assert.equal(
      await labPage.locator("#status").getAttribute("data-ready"),
      "ce1/first-slice.json",
      (await labPage.locator("#error").textContent()) ?? "",
    );
    assert.equal(
      await labPage.locator("#renderer").getAttribute("data-kind"),
      "software",
    );
    for (const [i, frame] of sliceFrames.entries()) {
      const encoded = await labPage.evaluate((frame) => {
        const slider = document.querySelector<HTMLInputElement>("#frame")!;
        slider.value = String(frame);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
        const data = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let binary = "";
        for (let at = 0; at < data.length; at += 0x8000)
          binary += String.fromCharCode(...data.subarray(at, at + 0x8000));
        return btoa(binary);
      }, frame);
      assert.equal(
        digest(new Uint8Array(Buffer.from(encoded, "base64"))),
        digest(first.frames[i]!),
        `Lab frame ${frame} equals the export renderer's frame`,
      );
    }
    assert.deepEqual(pageErrors, []);
    results.push(
      "the Lab composition page renders first-slice frames identical to the export renderer",
    );
  } finally {
    await lab.close();
  }
  const outputPath = join(directory, "first-slice.mp4");
  const exported = await renderComposition({
    compositionPath: resolve(fixtureDir, "first-slice.json"),
    outputPath,
  });
  assert.equal(exported.rendererVersion, COMPOSITION_RENDERER_VERSION);
  assert.deepEqual(exported.systemFontLayers, []);
  const manifest = JSON.parse(
    await readFile(`${outputPath}.scene.json`, "utf8"),
  );
  assert.equal(manifest.rendererVersion, COMPOSITION_RENDERER_VERSION);
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
  const systemFontPath = join(fixtureDir, ".system-font-first-slice.json");
  await writeFile(
    systemFontPath,
    JSON.stringify({
      ...firstSlice,
      layers: [
        {
          id: "generic",
          type: "text",
          text: "Generic face",
          fontSize: 48,
          color: "#2B2A26",
          font: "serif",
          transform: { position: [80, 1000] },
        },
        ...firstSlice.layers,
      ],
    }),
  );
  try {
    const generic = await renderComposition({
      compositionPath: systemFontPath,
      outputPath: join(directory, "system-font.mp4"),
    });
    assert.deepEqual(generic.systemFontLayers, ["generic"]);
    assert.ok(
      generic.warnings.some((w) => w.code === "comp-text-system-font"),
      "system-font warning reaches the render result",
    );
    const genericManifest = JSON.parse(
      await readFile(join(directory, "system-font.mp4.scene.json"), "utf8"),
    );
    assert.deepEqual(genericManifest.systemFontLayers, ["generic"]);
  } finally {
    await rm(systemFontPath, { force: true });
  }
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
    "export is byte-identical on repeat and across PNG/raw transports; failures publish nothing; system-font text is reported",
  );
  for (const line of results) console.log(`Composition render: ${line}`);
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
