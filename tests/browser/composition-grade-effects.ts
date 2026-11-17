/**
 * CGA: exact Canvas/WebGL byte parity for `color.matrix`,
 * `color.white-balance` and `color.vibrance`, against the shared integer
 * reference (`gradeBytes`), plus the layer-kind/seek matrix used by the other
 * native color effects.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as ColorReference from "../helpers/composition-color-effect-reference.ts";
import type { Composition } from "@still-shift/scene-contract";
import type * as Contract from "../../packages/scene-contract/src/index.ts";

const root = resolve(import.meta.dirname, "../..");
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const result = await page.evaluate(async () => {
    const m = (await import(
      String("/packages/renderer-core/src/index.ts")
    )) as typeof Render;
    const contract = (await import(
      String("/packages/scene-contract/src/index.ts")
    )) as typeof Contract;
    const reference = (await import(
      String("/tests/helpers/composition-color-effect-reference.ts")
    )) as typeof ColorReference;
    const cases: { effect: string; label: string; params: object }[] = [
      { effect: "color.matrix", label: "identity", params: {} },
      {
        effect: "color.matrix",
        label: "owner-like",
        params: {
          rr: 1.31,
          rg: -0.27,
          rb: -0.08,
          gr: -0.12,
          gg: 1.24,
          gb: -0.14,
          br: -0.15,
          bg: -0.3,
          bb: 1.52,
          ro: -0.004,
          go: 0.003,
          bo: 0.008,
        },
      },
      {
        effect: "color.matrix",
        label: "extreme-half",
        params: {
          rr: -4,
          rg: 4,
          rb: 2.5,
          gr: 3,
          gg: -2,
          gb: 0.25,
          br: 4,
          bg: 4,
          bb: -4,
          ro: 1,
          go: -1,
          bo: 0.5,
          strength: 0.37,
        },
      },
      { effect: "color.white-balance", label: "identity", params: {} },
      {
        effect: "color.white-balance",
        label: "cool-magenta",
        params: { temperature: -35, tint: 20 },
      },
      {
        effect: "color.white-balance",
        label: "extreme-warm-green",
        params: { temperature: 100, tint: -100 },
      },
      { effect: "color.vibrance", label: "identity", params: {} },
      {
        effect: "color.vibrance",
        label: "vibrance",
        params: { vibrance: 55, saturation: 10 },
      },
      {
        effect: "color.vibrance",
        label: "extreme",
        params: { vibrance: 100, saturation: 100, protectSkin: 0 },
      },
      {
        effect: "color.vibrance",
        label: "desaturate",
        params: { vibrance: -100, saturation: -60, protectSkin: 1 },
      },
    ];
    /** Opaque 256×256 tiles: r = x, g = y, b from a fixed plane list. */
    const planes = [0, 31, 64, 100, 128, 171, 200, 255];
    const definition = (id: string) =>
      Object.fromEntries(
        Object.entries(
          contract.compositionEffectDefinition(id)!.properties,
        ).map(([key, property]) => [key, property.default]),
      );
    const rows: {
      effect: string;
      label: string;
      opaquePixels: number;
      opaqueMaxDelta: number;
      referenceMaxDelta: number;
    }[] = [];
    const tile = (plane: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d")!;
      const image = context.createImageData(256, 256);
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++)
          image.data.set([x, y, plane, 255], (y * 256 + x) * 4);
      context.putImageData(image, 0, 0);
      return canvas;
    };
    const tiles = planes.map(tile);
    for (const { effect, label, params } of cases) {
      let opaqueMaxDelta = 0,
        referenceMaxDelta = 0;
      const controls = m.gradeControls(
        effect as Render.GradeEffectId,
        { ...definition(effect), ...params } as never,
      );
      for (const [index, plane] of planes.entries()) {
        const composition: Composition = {
          schemaVersion: "composition-1",
          id: "grade-bytes",
          width: 256,
          height: 256,
          fps: 24,
          frameCount: 1,
          background: "#000000",
          assets: [
            {
              id: "tile",
              type: "image",
              path: "tile.png",
              sha256: `sha256:${"0".repeat(64)}`,
              width: 256,
              height: 256,
            },
          ],
          layers: [
            {
              id: "image",
              type: "image",
              sources: [{ asset: "tile" }],
              size: [256, 256],
              fit: "stretch",
              transform: { anchor: [0, 0] },
              effects: [{ id: "grade", effect, params: params as never }],
            },
          ],
        };
        const resources = {
          images: new Map<string, CanvasImageSource>([["tile", tiles[index]!]]),
          fonts: new Map(),
        };
        const frames = (["canvas2d", "webgl2"] as const).map((backend) => {
          const preview = m.createCompositionPreview(
            document.createElement("canvas"),
            composition,
            resources,
            { backend },
          );
          try {
            preview.renderFrame(0);
            return new Uint8ClampedArray(preview.readPixels());
          } finally {
            preview.dispose();
          }
        });
        const expected = [0, 0, 0];
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 256; x++) {
            const i = (y * 256 + x) * 4;
            m.gradeBytes(controls, x, y, plane, expected, 0);
            for (let c = 0; c < 4; c++) {
              opaqueMaxDelta = Math.max(
                opaqueMaxDelta,
                Math.abs(frames[0]![i + c]! - frames[1]![i + c]!),
              );
              const want = c === 3 ? 255 : expected[c]!;
              referenceMaxDelta = Math.max(
                referenceMaxDelta,
                Math.abs(frames[0]![i + c]! - want),
                Math.abs(frames[1]![i + c]! - want),
              );
            }
          }
      }
      rows.push({
        effect,
        label,
        opaquePixels: planes.length * 65536,
        opaqueMaxDelta,
        referenceMaxDelta,
      });
    }
    // Every valid nonzero-alpha premultiplied byte pair through both backends.
    const pairs = reference.checkGradeEffectByteRounding(
      cases.map(({ effect, label, params }) => ({
        effect,
        label: `${effect}/${label}`,
        params: params as never,
      })),
    );
    // Layer kinds, animated controls and seek history (as the CE6 color set).
    const kinds = await reference.checkNativeEffectRendering({
      "color.matrix": [
        {},
        { rr: 1.2, gb: -0.2, bo: 0.05, strength: 0.6 },
        {
          rr: 1.3,
          bb: 0.8,
          strength: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 11, value: 1 },
            ],
          },
        },
      ],
      "color.white-balance": [
        {},
        { temperature: 45, tint: -20 },
        {
          temperature: {
            keys: [
              { frame: 0, value: -100 },
              { frame: 11, value: 100 },
            ],
          },
        },
      ],
      "color.vibrance": [
        {},
        { vibrance: 70, saturation: -20, protectSkin: 0.3 },
        {
          vibrance: {
            keys: [
              { frame: 0, value: -100 },
              { frame: 11, value: 100 },
            ],
          },
          saturation: 25,
        },
      ],
    });
    return { rows, pairs, kinds };
  });
  for (const row of result.rows) {
    assert.equal(row.opaqueMaxDelta, 0, `${row.effect}/${row.label} parity`);
    assert.equal(
      row.referenceMaxDelta,
      0,
      `${row.effect}/${row.label} matches the integer reference`,
    );
  }
  const pairWorst = Math.max(...result.pairs.rows.map((row) => row.maxDelta));
  const kindWorst = Math.max(...result.kinds.rows.map((row) => row.maxDelta));
  assert.equal(pairWorst, 0, "translucent byte pairs: exact parity");
  assert.equal(kindWorst, 0, "layer kinds and seeks: exact parity");
  const proof = join(root, "benchmarks/results/composition-cga");
  await mkdir(proof, { recursive: true });
  await writeFile(
    join(proof, "grade-effect-parity.json"),
    JSON.stringify(
      {
        opaque: result.rows,
        translucentPairs: result.pairs,
        layerKinds: {
          cases: result.kinds.cases,
          frames: result.kinds.frames,
          maxDelta: kindWorst,
        },
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "CGA grade effect parity:",
    JSON.stringify({
      opaqueCases: result.rows.length,
      opaquePixelsPerCase: result.rows[0]!.opaquePixels,
      translucentPairs: result.pairs.pairs,
      translucentMaxDelta: pairWorst,
      layerKindCases: result.kinds.cases,
      layerKindMaxDelta: kindWorst,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
