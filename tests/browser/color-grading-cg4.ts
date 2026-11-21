/**
 * CG4: `grade.curves`, `grade.hue-curves` and `grade.tonal` in the float
 * grade stage, against the float64 references on the CG0 stills.
 *
 * - Canvas equals the reference exactly on opaque pixels, WebGL2 within one
 *   code value; repeated WebGL2 renders are byte-identical; neutral settings
 *   (identity and flat curves) leave pixels unchanged on both backends;
 * - each hue/saturation curve changes only its own dimension on the rendered
 *   sweep stills, measured with the CG3 scope functions (vectorscope angle,
 *   chroma radius, luma), within the 8-bit rounding of the output;
 * - hue curves are continuous across 0°/360° on both backends;
 * - layer kinds, animated controls (including animated curve points) and
 *   seeks keep backend parity within one code value.
 *
 *   pnpm test:browser:color-grading-cg4
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as FloatGrade from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import type * as Science from "../../packages/color-science/src/index.ts";
import type * as ColorReference from "../helpers/composition-color-effect-reference.ts";
import type { Composition } from "@still-shift/scene-contract";
import type * as Contract from "../../packages/scene-contract/src/index.ts";
import {
  loadCg0Stills,
  openColorGradingPage,
  repositoryRoot as root,
} from "../helpers/color-grading-browser.ts";

const STILLS = [
  "gray-ramp-256",
  "chart-24",
  "hue-sweep",
  "saturation-sweep",
  "skin-tones",
  "noisy-gradient",
];
const stills = await loadCg0Stills(STILLS);

const S: [number, number][] = [
  [0, 0],
  [0.25, 0.18],
  [0.5, 0.5],
  [0.75, 0.84],
  [1, 1],
];
const BUMP: [number, number][] = [
  [0, 0.5],
  [0.3, 0.75],
  [0.6, 0.5],
  [1, 0.5],
];
const WRAP: [number, number][] = [
  [0, 0.8],
  [0.5, 0.5],
  [1, 0.8],
];
type Effect = { effect: string; params: Record<string, unknown> };
const CASES: Record<string, Effect[]> = {
  "curves-s": [{ effect: "grade.curves", params: { master: S } }],
  "curves-channels": [
    {
      effect: "grade.curves",
      params: {
        red: [
          [0, 0.05],
          [0.5, 0.62],
          [1, 1],
        ],
        blue: [
          [0, 0],
          [0.6, 0.45],
          [1, 0.9],
        ],
        master: S,
        lumaMix: 0.4,
      },
    },
  ],
  "curves-extreme": [
    {
      effect: "grade.curves",
      params: {
        master: [
          [0, 1],
          [0.3, 0],
          [0.31, 1],
          [1, 0],
        ],
        green: [
          [0, 0],
          [0.01, 1],
          [1, 1],
        ],
      },
    },
  ],
  "hue-curves-all": [
    {
      effect: "grade.hue-curves",
      params: {
        hueVsHue: BUMP,
        hueVsSat: WRAP,
        hueVsLum: BUMP,
        lumVsSat: [
          [0, 0.3],
          [1, 0.7],
        ],
        satVsSat: [
          [0, 0.5],
          [0.5, 0.8],
          [1, 0.4],
        ],
        satVsLum: [
          [0, 0.5],
          [1, 0.3],
        ],
      },
    },
  ],
  "hue-curves-extreme": [
    {
      effect: "grade.hue-curves",
      params: {
        hueVsHue: [
          [0, 1],
          [0.5, 0],
          [1, 1],
        ],
        satVsSat: [
          [0, 1],
          [1, 1],
        ],
        satVsLum: [
          [0, 0],
          [1, 1],
        ],
      },
    },
  ],
  tonal: [
    {
      effect: "grade.tonal",
      params: {
        shadowB: 0.04,
        highlightR: 0.03,
        shadowExposure: 0.5,
        highlightExposure: -0.4,
        shadowEnd: 0.3,
        highlightStart: 0.7,
        falloff: 0.1,
        softClipHigh: 0.85,
        softClipLow: 0.05,
      },
    },
  ],
  "tonal-extreme": [
    {
      effect: "grade.tonal",
      params: {
        midR: 1,
        midG: -1,
        shadowExposure: 4,
        midExposure: -4,
        highlightExposure: 4,
        shadowEnd: 0.5,
        highlightStart: 0.5,
        falloff: 0.01,
        softClipHigh: 0.5,
        softClipLow: 0.5,
      },
    },
  ],
  "chain-with-cg2": [
    { effect: "grade.primary", params: { gainMaster: 1.4, contrast: 1.2 } },
    { effect: "grade.curves", params: { master: S } },
    {
      effect: "grade.hue-curves",
      params: {
        satVsSat: [
          [0, 0.5],
          [0.4, 0.7],
          [1, 0.5],
        ],
      },
    },
    { effect: "grade.tonal", params: { softClipHigh: 0.8 } },
  ],
  neutral: [
    { effect: "grade.curves", params: {} },
    { effect: "grade.hue-curves", params: {} },
    { effect: "grade.tonal", params: { shadowEnd: 0.2, falloff: 0.3 } },
  ],
};
/** One curve at a time on the sweeps: the dimension it may change. */
const SINGLES: {
  curve: string;
  points: [number, number][];
  still: string;
  changes: "angle" | "radius" | "luma";
}[] = [
  { curve: "hueVsHue", points: BUMP, still: "hue-sweep", changes: "angle" },
  { curve: "hueVsSat", points: BUMP, still: "hue-sweep", changes: "radius" },
  { curve: "hueVsLum", points: BUMP, still: "hue-sweep", changes: "luma" },
  {
    curve: "lumVsSat",
    points: [
      [0, 0.3],
      [1, 0.8],
    ],
    still: "skin-tones",
    changes: "radius",
  },
  {
    curve: "satVsSat",
    points: [
      [0, 0.5],
      [0.5, 0.8],
      [1, 0.4],
    ],
    still: "saturation-sweep",
    changes: "radius",
  },
  {
    curve: "satVsLum",
    points: [
      [0, 0.5],
      [1, 0.25],
    ],
    still: "saturation-sweep",
    changes: "luma",
  },
];

const { page, close } = await openColorGradingPage();
try {
  const result = await page.evaluate(
    async ({ stills, cases, singles }) => {
      const m = (await import(
        String("/packages/renderer-core/src/index.ts")
      )) as typeof Render;
      const fg = (await import(
        String("/packages/renderer-core/src/composition/render/float-grade.ts")
      )) as typeof FloatGrade;
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
      const render = (
        still: (typeof stills)[number],
        effects: { effect: string; params: object }[],
        backend: "canvas2d" | "webgl2",
      ) => {
        const composition: Composition = {
          schemaVersion: "composition-1",
          id: "cg4",
          width: still.width,
          height: still.height,
          fps: 24,
          frameCount: 1,
          background: "#000000",
          assets: [
            {
              id: "still",
              type: "image",
              path: "still.png",
              sha256: `sha256:${"0".repeat(64)}`,
              width: still.width,
              height: still.height,
            },
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
                params: e.params as never,
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
          },
          { backend },
        );
        try {
          preview.renderFrame(0);
          return new Uint8ClampedArray(preview.readPixels());
        } finally {
          preview.dispose();
        }
      };
      const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
        a.every((v, i) => v === b[i]);

      // 1. Parity, repeatability, neutrality.
      const parity: Record<string, unknown>[] = [];
      for (const [label, effects] of Object.entries(cases)) {
        const ops = effects.flatMap((e) => {
          const op = fg.floatGradeOp(
            e.effect as never,
            { ...defaults(e.effect), ...e.params } as never,
          );
          return op ? [op] : [];
        });
        for (const still of stills) {
          const canvas = render(still, effects, "canvas2d");
          const webgl = render(still, effects, "webgl2");
          const again = render(still, effects, "webgl2");
          let canvasMax = 0,
            webglMax = 0,
            atOne = 0;
          for (let i = 0; i < still.width * still.height; i++) {
            const at = i * 4;
            const want = fg.floatGradeBytes(ops, [
              still.rgba[at]! / 255,
              still.rgba[at + 1]! / 255,
              still.rgba[at + 2]! / 255,
            ]);
            for (let c = 0; c < 3; c++) {
              canvasMax = Math.max(
                canvasMax,
                Math.abs(canvas[at + c]! - want[c]!),
              );
              const d = Math.abs(webgl[at + c]! - want[c]!);
              webglMax = Math.max(webglMax, d);
              if (d === 1) atOne++;
            }
          }
          parity.push({
            case: label,
            still: still.id,
            ops: ops.length,
            canvasVsReference: canvasMax,
            webglVsReference: webglMax,
            webglChannelsAtOne: atOne,
            repeatIdentical: same(webgl, again),
            identity:
              label === "neutral"
                ? same(canvas, render(still, [], "canvas2d")) &&
                  same(webgl, render(still, [], "webgl2"))
                : undefined,
          });
        }
      }

      // 2. Each hue/saturation curve changes only its own dimension (CG3 measures).
      const dimensions = (r: number, g: number, b: number) => {
        const [cb, cr] = cs.chroma709(r, g, b);
        return {
          angle: cs.vectorscopeAngle(r, g, b),
          radius: Math.hypot(cb, cr),
          luma: cs.encodedLuma(r, g, b),
        };
      };
      const separation = [];
      for (const single of singles) {
        const still = stills.find((s) => s.id === single.still)!;
        for (const backend of ["canvas2d", "webgl2"] as const) {
          const params = { [single.curve]: single.points };
          const before = render(still, [], backend);
          const after = render(
            still,
            [{ effect: "grade.hue-curves", params }],
            backend,
          );
          const op = fg.floatGradeOp("grade.hue-curves", {
            ...defaults("grade.hue-curves"),
            ...params,
          } as never)!;
          const worst = { angle: 0, radius: 0, luma: 0 };
          let clipped = 0;
          for (let i = 0; i < still.width * still.height; i++) {
            const at = i * 4;
            // Results outside 0–1 are clipped by the 8-bit output, which moves
            // every dimension; measure the in-gamut pixels and count the rest.
            const exact = op.apply([
              still.rgba[at]! / 255,
              still.rgba[at + 1]! / 255,
              still.rgba[at + 2]! / 255,
            ]);
            if (exact.some((v) => v < 0 || v > 1)) {
              clipped++;
              continue;
            }
            const a = dimensions(before[at]!, before[at + 1]!, before[at + 2]!);
            const b = dimensions(after[at]!, after[at + 1]!, after[at + 2]!);
            // Angles are only meaningful with chroma above the 8-bit noise.
            if (a.radius > 0.03 && b.radius > 0.03)
              worst.angle = Math.max(
                worst.angle,
                Math.abs(((b.angle - a.angle + 540) % 360) - 180),
              );
            worst.radius = Math.max(
              worst.radius,
              Math.abs(b.radius - a.radius),
            );
            worst.luma = Math.max(worst.luma, Math.abs(b.luma - a.luma));
          }
          separation.push({
            ...single,
            points: undefined,
            backend,
            worst,
            clipped,
            pixels: still.width * still.height,
          });
        }
      }

      // 3. Hue wrap continuity: a hue-sweep row's last and first columns.
      const sweep = stills.find((s) => s.id === "hue-sweep")!;
      const wrap = (["canvas2d", "webgl2"] as const).map((backend) => {
        const out = render(
          sweep,
          [
            {
              effect: "grade.hue-curves",
              params: {
                hueVsSat: [
                  [0, 0.95],
                  [0.5, 0.5],
                  [1, 0.95],
                ],
              },
            },
          ],
          backend,
        );
        let jump = 0;
        for (let y = 0; y < 32; y++) {
          const first = y * 360 * 4,
            last = (y * 360 + 359) * 4,
            prev = (y * 360 + 358) * 4;
          const step = (a: number, b: number) =>
            Math.max(
              ...[0, 1, 2].map((c) => Math.abs(out[a + c]! - out[b + c]!)),
            );
          jump = Math.max(jump, step(last, first) - step(prev, last));
        }
        return { backend, wrapStepMinusNeighbourStep: jump };
      });

      // 4. Layer kinds, animated controls and curve points, seeks.
      const reference = (await import(
        String("/tests/helpers/composition-color-effect-reference.ts")
      )) as typeof ColorReference;
      const kinds = await reference.checkNativeEffectRendering({
        "grade.curves": [
          {},
          {
            master: [
              [0, 0],
              [0.4, 0.6],
              [1, 1],
            ],
            lumaMix: 0.5,
          },
          {
            red: [
              [0, 0],
              {
                x: 0.5,
                y: {
                  keys: [
                    { frame: 0, value: 0.2 },
                    { frame: 11, value: 0.8 },
                  ],
                },
              },
              [1, 1],
            ],
          },
        ],
        "grade.hue-curves": [
          {},
          {
            hueVsSat: [
              [0, 0.6],
              [0.3, 0.9],
              [1, 0.6],
            ],
            satVsLum: [
              [0, 0.5],
              [1, 0.4],
            ],
          },
          {
            hueVsHue: [
              [0, 0.5],
              {
                x: 0.4,
                y: {
                  keys: [
                    { frame: 0, value: 0.3 },
                    { frame: 11, value: 0.7 },
                  ],
                },
              },
              [1, 0.5],
            ],
          },
        ],
        "grade.tonal": [
          {},
          { shadowB: 0.05, highlightExposure: -0.5, softClipHigh: 0.9 },
          {
            midExposure: {
              keys: [
                { frame: 0, value: -1 },
                { frame: 11, value: 1 },
              ],
            },
            falloff: 0.2,
          },
        ],
      } as never);
      return {
        parity,
        separation,
        wrap,
        kinds: {
          cases: kinds.cases,
          frames: kinds.frames,
          maxDelta: Math.max(...kinds.rows.map((r) => r.maxDelta)),
        },
      };
    },
    { stills, cases: CASES, singles: SINGLES },
  );

  const proof = join(root, "benchmarks/results/color-grading-cg4");
  await mkdir(proof, { recursive: true });
  await writeFile(
    join(proof, "curves.json"),
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
    "repeat WebGL2 renders are byte-identical",
  );
  assert.ok(
    rows.filter((r) => r.case === "neutral").every((r) => r.identity),
    "neutral settings leave pixels unchanged",
  );
  // 8-bit output: luma moves by < 1.5/255 and the radius by < 0.01 from rounding alone.
  for (const s of result.separation as {
    curve: string;
    backend: string;
    changes: string;
    worst: Record<string, number>;
  }[]) {
    const id = `${s.curve}/${s.backend}`;
    for (const dim of ["angle", "radius", "luma"] as const) {
      if (dim === s.changes)
        assert.ok(
          s.worst[dim]! > (dim === "angle" ? 10 : 0.02),
          `${id}: changes ${dim}`,
        );
      else
        assert.ok(
          s.worst[dim]! <=
            (dim === "angle" ? 3 : dim === "radius" ? 0.01 : 1.5 / 255),
          `${id}: keeps ${dim} (${s.worst[dim]})`,
        );
    }
  }
  for (const w of result.wrap)
    assert.ok(
      w.wrapStepMinusNeighbourStep <= 2,
      `${w.backend}: hue wrap continuous (${w.wrapStepMinusNeighbourStep})`,
    );
  assert.ok(
    result.kinds.maxDelta <= 1,
    `layer kinds and seeks: ${result.kinds.maxDelta}`,
  );
  console.log(
    "CG4 curves:",
    JSON.stringify({
      parityRows: rows.length,
      canvasMax: Math.max(...rows.map((r) => r.canvasVsReference)),
      webglMax: Math.max(...rows.map((r) => r.webglVsReference)),
      separation: (
        result.separation as { curve: string; backend: string; worst: object }[]
      ).map((s) => [s.curve, s.backend, s.worst]),
      wrap: result.wrap,
      kinds: result.kinds,
    }),
  );
} finally {
  await close();
}
