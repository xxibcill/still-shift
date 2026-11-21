/**
 * CG5: `grade.lut` in the float grade stage and baked grade stacks.
 *
 * - identity LUTs (3D sizes 2–65, 1D, behind a shaper) leave pixels
 *   unchanged on both backends, and the float64 sampler returns its input
 *   within the 10-decimal text (exact where nodes are k/2^n);
 * - GPU tetrahedral (and trilinear, 1D, shaper, non-unit domain, intensity,
 *   a 65³ table, a run with curves) matches the float64 reference on random
 *   and edge samples: Canvas exactly, WebGL2 within one code value, repeated
 *   WebGL2 renders byte-identical;
 * - a grade stack baked to a `.cube` (33³ and 65³) and applied with
 *   `grade.lut` reproduces the stack within the stated tolerance;
 * - a missing prepared LUT is an error, not a silent identity.
 *
 *   pnpm test:browser:color-grading-cg5
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as FloatGrade from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import type * as Luts from "../../packages/renderer-core/src/composition/render/luts.ts";
import type * as Science from "../../packages/color-science/src/index.ts";
import type { Composition } from "@still-shift/scene-contract";
import type * as Contract from "../../packages/scene-contract/src/index.ts";

const root = resolve(import.meta.dirname, "../..");
const vectors = join(root, "benchmarks/fixtures/color/cg0/vectors/luts");
const fixtureLuts = Object.fromEntries(
  await Promise.all(
    ["cube-17", "cube-5-domain", "cube-9-shaper", "curve-1d-64"].map(
      async (id) => [id, await readFile(join(vectors, `${id}.cube`), "utf8")],
    ),
  ),
) as Record<string, string>;
const STILLS = ["chart-24", "hue-sweep", "skin-tones", "noisy-gradient"];
const stills = await Promise.all(
  STILLS.map(async (id) => {
    const { width, height, rgba } = decodeCompositionRgbaPng(
      await readFile(
        join(root, `benchmarks/fixtures/color/cg0/stills/${id}.png`),
      ),
    );
    return { id, width, height, rgba: [...rgba] };
  }),
);
// Edge and random samples: every gray, channel values at the 17- and 65-point
// grid nodes and the ends, ties between channels (tetrahedral branch edges),
// and seeded random colors.
{
  const width = 64,
    height = 32;
  const rgba: number[] = [];
  let seed = 20261121;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const nodes = new Set([0, 1, 2, 127, 128, 253, 254, 255]);
  for (let k = 0; k <= 16; k++) nodes.add(Math.round((k * 255) / 16));
  for (let k = 0; k <= 64; k++) nodes.add(Math.round((k * 255) / 64));
  const edge = [...nodes];
  const pick = () => edge[Math.floor(random() * edge.length)]!;
  for (let i = 0; i < width * height; i++) {
    let px: number[];
    if (i < 256) px = [i, i, i];
    else if (i < 768) px = [pick(), pick(), pick()];
    else if (i < 1024) {
      const a = pick();
      px = i % 2 ? [a, a, pick()] : [pick(), a, a];
    } else px = [0, 0, 0].map(() => Math.floor(random() * 256));
    rgba.push(...px, 255);
  }
  stills.push({ id: "edges-random", width, height, rgba });
}

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
  const result = await page.evaluate(
    async ({ stills, fixtureLuts }) => {
      const m = (await import(
        String("/packages/renderer-core/src/index.ts")
      )) as typeof Render;
      const fg = (await import(
        String("/packages/renderer-core/src/composition/render/float-grade.ts")
      )) as typeof FloatGrade;
      const lutModule = (await import(
        String("/packages/renderer-core/src/composition/render/luts.ts")
      )) as typeof Luts;
      const cs = (await import(
        String("/packages/color-science/src/index.ts")
      )) as typeof Science;
      const contract = (await import(
        String("/packages/scene-contract/src/index.ts")
      )) as typeof Contract;
      const defaults = (id: string) =>
        Object.fromEntries(
          Object.entries(
            contract.compositionEffectDefinition(id)!.properties,
          ).map(([k, p]) => [k, p.default]),
        );
      const sha = (n: number) => `sha256:${n.toString(16).padStart(64, "0")}`;

      // LUT texts: fixtures, identities and a generated 65³.
      const identity3 = (size: number) =>
        cs.writeCubeLut(cs.bakeCubeLut((v) => v, size));
      const identity1 = (size: number) => {
        const rows = Array.from({ length: size }, (_, i) => {
          const v = (i / (size - 1)).toFixed(10);
          return `${v} ${v} ${v}`;
        });
        return `LUT_1D_SIZE ${size}\n${rows.join("\n")}\n`;
      };
      // A linear 1D shaper over 0–1 in front of a 3D identity.
      const identityShaper = () => {
        const shaper = Array.from({ length: 1025 }, (_, i) => {
          const v = i / 1024;
          return [v, v, v];
        }).flat();
        return cs.writeCubeLut({
          ...cs.bakeCubeLut((v) => v, 33),
          shaper: {
            kind: "1d",
            size: 1025,
            domainMin: [0, 0, 0],
            domainMax: [1, 1, 1],
            data: Float64Array.from(shaper),
          },
        });
      };
      const look = ([r, g, b]: number[]) =>
        [
          0.06 + 0.9 * Math.pow(r!, 1.1) + 0.05 * g! * b!,
          0.03 + 0.92 * g! + 0.04 * Math.sin(3 * r!),
          0.1 + 0.8 * Math.sqrt(b!) - 0.05 * r! * g!,
        ] as [number, number, number];
      const texts: Record<string, string> = {
        ...fixtureLuts,
        "identity-2": identity3(2),
        "identity-5": identity3(5),
        "identity-17": identity3(17),
        "identity-33": identity3(33),
        "identity-65": identity3(65),
        "identity-1d-1025": identity1(1025),
        "identity-1d-4096": identity1(4096),
        "identity-shaper": identityShaper(),
        "look-65": cs.writeCubeLut(cs.bakeCubeLut(look as never, 65)),
      };
      const prepared = new Map(
        Object.entries(texts).map(([id, text], i) => [
          id,
          lutModule.prepareLut(sha(i + 1), text),
        ]),
      );

      const canvases = new Map(
        stills.map((still) => {
          const canvas = document.createElement("canvas");
          canvas.width = still.width;
          canvas.height = still.height;
          const context = canvas.getContext("2d")!;
          const data = context.createImageData(still.width, still.height);
          data.data.set(still.rgba);
          context.putImageData(data, 0, 0);
          return [still.id, canvas] as const;
        }),
      );
      type Effect = {
        effect: string;
        params?: Record<string, unknown>;
        lut?: string;
      };
      const render = (
        still: (typeof stills)[number],
        effects: Effect[],
        backend: "canvas2d" | "webgl2",
        luts = prepared,
        frame = 0,
      ) => {
        const used = [
          ...new Set(effects.flatMap((e) => (e.lut ? [e.lut] : []))),
        ];
        const composition: Composition = {
          schemaVersion: "composition-1",
          id: "cg5",
          width: still.width,
          height: still.height,
          fps: 24,
          frameCount: 12,
          background: "#000000",
          assets: [
            {
              id: "still",
              type: "image",
              path: "still.png",
              sha256: sha(0),
              width: still.width,
              height: still.height,
            },
            ...used.map((id) => ({
              id,
              type: "lut" as const,
              path: `${id}.cube`,
              sha256: prepared.get(id)!.sha256,
              format: "cube" as const,
              inputSpace: "legacy-srgb" as const,
              outputSpace: "legacy-srgb" as const,
            })),
          ],
          layers: [
            {
              id: "image",
              type: "image",
              sources: [{ asset: "still" }],
              size: [still.width, still.height],
              fit: "stretch",
              transform: { anchor: [0, 0] },
              effects: effects.map((e, i) => ({
                id: `g${i}`,
                effect: e.effect,
                ...(e.lut ? { assets: { lut: e.lut } } : {}),
                params: (e.params ?? {}) as never,
              })),
            },
          ],
        };
        const preview = m.createCompositionPreview(
          document.createElement("canvas"),
          composition,
          {
            images: new Map<string, CanvasImageSource>([
              ["still", canvases.get(still.id)!],
            ]),
            fonts: new Map(),
            luts,
          },
          { backend },
        );
        try {
          preview.renderFrame(frame);
          return new Uint8ClampedArray(preview.readPixels());
        } finally {
          preview.dispose();
        }
      };
      const opsOf = (effects: Effect[]) =>
        effects.flatMap((e) => {
          const op = fg.floatGradeOp(
            e.effect as never,
            { ...defaults(e.effect), ...e.params } as never,
            e.lut
              ? { [lutModule.EFFECT_LUTS]: { lut: prepared.get(e.lut)! } }
              : {},
          );
          return op ? [op] : [];
        });
      const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
        a.every((v, i) => v === b[i]);
      const compare = (
        still: (typeof stills)[number],
        got: Uint8ClampedArray,
        want: (rgb: [number, number, number]) => readonly number[],
      ) => {
        let max = 0,
          atOne = 0;
        for (let i = 0; i < still.width * still.height; i++) {
          const at = i * 4;
          const w = want([
            still.rgba[at]! / 255,
            still.rgba[at + 1]! / 255,
            still.rgba[at + 2]! / 255,
          ]);
          for (let c = 0; c < 3; c++) {
            const d = Math.abs(got[at + c]! - w[c]!);
            max = Math.max(max, d);
            if (d === 1) atOne++;
          }
        }
        return { max, atOne };
      };

      // 1. Identity LUTs.
      const identities = [];
      for (const id of [
        "identity-2",
        "identity-5",
        "identity-17",
        "identity-33",
        "identity-65",
        "identity-1d-1025",
        "identity-1d-4096",
        "identity-shaper",
      ]) {
        const lut = prepared.get(id)!.lut;
        let float64 = 0;
        for (let i = 0; i < 4096; i++) {
          const v: [number, number, number] = [
            (i * 0.6180339887) % 1,
            (i * 0.4142135623) % 1,
            (i * 0.7320508075) % 1,
          ];
          for (const interp of ["tetrahedral", "trilinear"] as const)
            cs.sampleLut(lut, v, interp).forEach(
              (o, c) => (float64 = Math.max(float64, Math.abs(o - v[c]!))),
            );
        }
        const rows = [];
        for (const still of stills)
          for (const backend of ["canvas2d", "webgl2"] as const)
            for (const interpolation of [0, 1]) {
              const base = render(still, [], backend);
              const graded = render(
                still,
                [{ effect: "grade.lut", lut: id, params: { interpolation } }],
                backend,
              );
              rows.push({
                still: still.id,
                backend,
                interpolation,
                maxDelta: graded.reduce(
                  (max, v, i) => Math.max(max, Math.abs(v - base[i]!)),
                  0,
                ),
                identical: same(graded, base),
              });
            }
        identities.push({
          lut: id,
          float64MaxError: float64,
          renders: rows.length,
          allIdentical: rows.every((r) => r.identical),
          maxDelta: Math.max(...rows.map((r) => r.maxDelta)),
          notIdentical: rows
            .filter((r) => !r.identical)
            .map((r) => `${r.still}/${r.backend}/${r.interpolation}`),
        });
      }

      // 2. GPU vs CPU on random, edge and graded stills.
      const CASES: Record<string, Effect[]> = {
        "cube-17-tetrahedral": [{ effect: "grade.lut", lut: "cube-17" }],
        "cube-17-trilinear": [
          { effect: "grade.lut", lut: "cube-17", params: { interpolation: 1 } },
        ],
        "cube-5-domain": [{ effect: "grade.lut", lut: "cube-5-domain" }],
        "cube-9-shaper": [{ effect: "grade.lut", lut: "cube-9-shaper" }],
        "curve-1d-64": [{ effect: "grade.lut", lut: "curve-1d-64" }],
        "look-65": [{ effect: "grade.lut", lut: "look-65" }],
        "look-65-intensity": [
          { effect: "grade.lut", lut: "look-65", params: { intensity: 0.6 } },
        ],
        "two-luts-and-curves": [
          { effect: "grade.primary", params: { gainMaster: 1.6, liftB: 0.1 } },
          { effect: "grade.lut", lut: "cube-9-shaper" },
          {
            effect: "grade.curves",
            params: {
              master: [
                [0, 0],
                [0.3, 0.22],
                [0.7, 0.8],
                [1, 1],
              ],
            },
          },
          { effect: "grade.lut", lut: "look-65", params: { interpolation: 1 } },
        ],
        "intensity-zero": [
          { effect: "grade.lut", lut: "look-65", params: { intensity: 0 } },
        ],
      };
      const parity = [];
      for (const [label, effects] of Object.entries(CASES)) {
        const ops = opsOf(effects);
        for (const still of stills) {
          const canvas = render(still, effects, "canvas2d");
          const webgl = render(still, effects, "webgl2");
          const again = render(still, effects, "webgl2");
          const want = (rgb: [number, number, number]) =>
            fg.floatGradeBytes(ops, rgb);
          const gpu = compare(still, webgl, want);
          parity.push({
            case: label,
            still: still.id,
            ops: ops.length,
            canvasVsReference: compare(still, canvas, want).max,
            webglVsReference: gpu.max,
            webglChannelsAtOne: gpu.atOne,
            repeatIdentical: same(webgl, again),
            identity:
              label === "intensity-zero"
                ? same(canvas, render(still, [], "canvas2d")) &&
                  same(webgl, render(still, [], "webgl2"))
                : undefined,
          });
        }
      }
      // Animated intensity: parity at each sampled frame.
      const animated: Effect[] = [
        {
          effect: "grade.lut",
          lut: "cube-17",
          params: {
            intensity: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 11, value: 1 },
              ],
            },
          },
        },
      ];
      const animation = [];
      const edge = stills.find((s) => s.id === "edges-random")!;
      for (const frame of [0, 4, 11]) {
        const a = render(edge, animated, "canvas2d", prepared, frame);
        const b = render(edge, animated, "webgl2", prepared, frame);
        let max = 0;
        a.forEach((v, i) => (max = Math.max(max, Math.abs(v - b[i]!))));
        animation.push({ frame, canvasVsWebgl: max });
      }

      // 3. Bake a pointwise stack to .cube and apply it with grade.lut.
      const STACK: Effect[] = [
        {
          effect: "grade.primary",
          params: {
            liftMaster: 0.03,
            gammaR: 1.1,
            gainB: 0.92,
            contrast: 1.15,
            saturation: 1.1,
          },
        },
        {
          effect: "grade.white-balance",
          params: { temperature: 5600, tint: 4 },
        },
        {
          effect: "grade.curves",
          params: {
            master: [
              [0, 0],
              [0.25, 0.2],
              [0.75, 0.82],
              [1, 1],
            ],
          },
        },
        {
          effect: "grade.hue-curves",
          params: {
            hueVsSat: [
              [0, 0.5],
              [0.3, 0.7],
              [0.6, 0.5],
              [1, 0.5],
            ],
          },
        },
        { effect: "grade.tonal", params: { shadowB: 0.03, softClipHigh: 0.9 } },
      ];
      const stackOps = opsOf(STACK);
      const bakes = [];
      for (const size of [33, 65]) {
        const text = cs.writeCubeLut(
          cs.bakeCubeLut((v) => {
            let value = v;
            for (const op of stackOps) value = op.apply(value);
            return value;
          }, size),
        );
        const id = `bake-${size}`;
        prepared.set(id, lutModule.prepareLut(sha(900 + size), text));
        for (const still of stills)
          for (const backend of ["canvas2d", "webgl2"] as const) {
            const original = render(still, STACK, backend);
            const baked = render(
              still,
              [{ effect: "grade.lut", lut: id }],
              backend,
            );
            let max = 0,
              over1 = 0,
              sum = 0;
            for (let i = 0; i < original.length; i++) {
              if (i % 4 === 3) continue;
              const d = Math.abs(original[i]! - baked[i]!);
              max = Math.max(max, d);
              if (d > 1) over1++;
              sum += d;
            }
            bakes.push({
              size,
              still: still.id,
              backend,
              maxDelta: max,
              channelsOver1: over1,
              meanDelta: sum / ((original.length / 4) * 3),
              bytes: text.length,
            });
          }
      }

      // 4. A grade.lut without its prepared LUT fails.
      let missing = "rendered";
      try {
        render(
          stills[0]!,
          [{ effect: "grade.lut", lut: "cube-17" }],
          "canvas2d",
          new Map(),
        );
      } catch (error) {
        missing = String((error as Error).message);
      }
      return { identities, parity, animation, bakes, missing };
    },
    { stills, fixtureLuts },
  );

  const proof = join(root, "benchmarks/results/color-grading-cg5");
  await mkdir(proof, { recursive: true });
  await writeFile(
    join(proof, "luts.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  type Row = {
    case: string;
    still: string;
    canvasVsReference: number;
    webglVsReference: number;
    repeatIdentical: boolean;
    identity?: boolean;
  };
  const rows = result.parity as Row[];
  for (const id of result.identities) {
    // Nodes at k/2^n are exact in 10-decimal text; 1/4095 steps round (≤ 5e-11).
    assert.ok(
      id.float64MaxError <= 1e-10,
      `${id.lut}: float64 ${id.float64MaxError}`,
    );
    assert.ok(id.allIdentical, `${id.lut}: ${id.notIdentical.join(", ")}`);
  }
  assert.deepEqual(
    rows
      .filter((r) => r.canvasVsReference !== 0)
      .map((r) => `${r.case}/${r.still}: ${r.canvasVsReference}`),
    [],
    "Canvas equals the float64 reference",
  );
  assert.deepEqual(
    rows
      .filter((r) => r.webglVsReference > 1)
      .map((r) => `${r.case}/${r.still}: ${r.webglVsReference}`),
    [],
    "WebGL2 within one code value",
  );
  assert.ok(
    rows.every((r) => r.repeatIdentical),
    "repeat renders identical",
  );
  assert.ok(
    rows.filter((r) => r.case === "intensity-zero").every((r) => r.identity),
    "intensity 0 leaves pixels unchanged",
  );
  assert.ok(
    result.animation.every((a) => a.canvasVsWebgl <= 1),
    `animated intensity: ${JSON.stringify(result.animation)}`,
  );
  assert.match(result.missing, /comp-lut-not-ready/);
  const bakeMax = (size: number) =>
    Math.max(
      ...result.bakes.filter((b) => b.size === size).map((b) => b.maxDelta),
    );
  // Stated tolerance: a 33³ bake within 2 code values of the stack, 65³ within 1.
  assert.ok(bakeMax(33) <= 2, `33³ bake: ${bakeMax(33)}`);
  assert.ok(bakeMax(65) <= 1, `65³ bake: ${bakeMax(65)}`);
  console.log(
    "CG5 LUTs:",
    JSON.stringify({
      identities: result.identities.map((i) => [
        i.lut,
        i.float64MaxError,
        i.renders,
      ]),
      parityRows: rows.length,
      canvasMax: Math.max(...rows.map((r) => r.canvasVsReference)),
      webglMax: Math.max(...rows.map((r) => r.webglVsReference)),
      animation: result.animation,
      bake33: bakeMax(33),
      bake65: bakeMax(65),
      missing: result.missing.slice(0, 80),
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
