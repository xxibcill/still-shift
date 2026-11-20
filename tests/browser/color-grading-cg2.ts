/**
 * CG2: the float grade stage (`grade.primary`, `grade.white-balance`,
 * `grade.cdl`, `grade.rgb-mixer`) against the float64 reference on the CG0
 * stills, through Canvas and WebGL2.
 *
 * Checks (docs/color-grading-engine-plan.md, CG2):
 * - Canvas equals the float64 reference exactly on opaque pixels; WebGL2 is
 *   within one 8-bit code value (owner decision 3); repeated WebGL2 renders
 *   are byte-identical;
 * - a value pushed above 1 by one grade effect is recovered by the next;
 * - ten stacked neutral-sum corrections add no banding compared with one pass;
 * - layer kinds, animated controls and seeks keep backend parity within 1.
 *
 *   pnpm test:browser:color-grading-cg2
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import { probeCompositionVideo } from "../../packages/animation-engine/src/composition-media-probe.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as FloatGrade from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import type * as ColorReference from "../helpers/composition-color-effect-reference.ts";
import type { Composition } from "@still-shift/scene-contract";
import type * as Contract from "../../packages/scene-contract/src/index.ts";

const root = resolve(import.meta.dirname, "../..");
const STILLS = [
  "gray-ramp-256",
  "gray-steps-16",
  "chart-24",
  "hue-sweep",
  "saturation-sweep",
  "skin-tones",
  "noisy-gradient",
  "alpha-patches",
];
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

type Effect = { effect: string; params: Record<string, number> };
/** Cases: each operator typical and extreme, a full chain, and a neutral run. */
const CASES: Record<string, Effect[]> = {
  "primary-typical": [
    {
      effect: "grade.primary",
      params: {
        liftMaster: 0.03,
        gammaR: 1.1,
        gammaB: 0.92,
        gainMaster: 1.08,
        offsetB: 0.01,
        contrast: 1.15,
        pivot: 0.45,
        saturation: 1.2,
        shadows: 0.2,
        highlights: -0.15,
      },
    },
  ],
  "primary-extreme": [
    {
      effect: "grade.primary",
      params: {
        liftR: -0.3,
        liftG: 0.4,
        gammaMaster: 3.5,
        gainR: 2.4,
        gainB: 0.3,
        offsetG: -0.2,
        contrast: 2.5,
        pivot: 0.2,
        saturation: 3,
        hue: 137,
        colorBoost: 0.9,
        shadows: -1,
        highlights: 1,
      },
    },
  ],
  "white-balance-warm-scene": [
    { effect: "grade.white-balance", params: { temperature: 3200, tint: 10 } },
  ],
  "white-balance-extreme": [
    {
      effect: "grade.white-balance",
      params: { temperature: 1667, tint: -100 },
    },
  ],
  "cdl-asc": [
    {
      effect: "grade.cdl",
      params: {
        slopeR: 1.1,
        slopeG: 0.97,
        slopeB: 1.05,
        offsetR: -0.02,
        offsetB: 0.03,
        powerR: 0.9,
        powerG: 1.1,
        powerB: 1.2,
        saturation: 1.3,
        clamp: 1,
      },
    },
  ],
  "cdl-unclamped": [
    {
      effect: "grade.cdl",
      params: {
        slopeR: 2,
        offsetG: -0.3,
        powerB: 0.5,
        saturation: 2.2,
        clamp: 0,
      },
    },
  ],
  "mixer-owner-like": [
    {
      effect: "grade.rgb-mixer",
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
        strength: 0.6,
      },
    },
  ],
  chain: [
    { effect: "grade.white-balance", params: { temperature: 5200, tint: 6 } },
    {
      effect: "grade.primary",
      params: { gainMaster: 1.6, contrast: 1.3, pivot: 0.4 },
    },
    {
      effect: "grade.cdl",
      params: {
        slopeR: 0.8,
        slopeG: 0.8,
        slopeB: 0.8,
        powerR: 1.1,
        powerG: 1.1,
        powerB: 1.1,
        clamp: 0,
      },
    },
    {
      effect: "grade.rgb-mixer",
      params: { rr: 1.1, rg: -0.1, bb: 0.9, bg: 0.1, strength: 0.8 },
    },
    { effect: "grade.primary", params: { saturation: 1.25, hue: -8 } },
  ],
  "neutral-run": [
    { effect: "grade.primary", params: {} },
    { effect: "grade.white-balance", params: {} },
    { effect: "grade.rgb-mixer", params: {} },
  ],
};

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
    async ({ stills, cases }) => {
      const m = (await import(
        String("/packages/renderer-core/src/index.ts")
      )) as typeof Render;
      const fg = (await import(
        String("/packages/renderer-core/src/composition/render/float-grade.ts")
      )) as typeof FloatGrade;
      const contract = (await import(
        String("/packages/scene-contract/src/index.ts")
      )) as typeof Contract;
      const defaults = (id: string) =>
        Object.fromEntries(
          Object.entries(
            contract.compositionEffectDefinition(id)!.properties,
          ).map(([k, p]) => [k, p.default as number]),
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
          id: "cg2",
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
      const hash = async (bytes: Uint8ClampedArray<ArrayBuffer>) =>
        [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      // 1. Parity with the float64 reference.
      const parity: Record<string, unknown>[] = [];
      for (const [label, effects] of Object.entries(cases)) {
        const ops = effects.flatMap((e) => {
          const op = fg.floatGradeOp(e.effect as never, {
            ...defaults(e.effect),
            ...e.params,
          });
          return op ? [op] : [];
        });
        for (const still of stills) {
          const canvas = render(still, effects, "canvas2d");
          const webgl = render(still, effects, "webgl2");
          const again = render(still, effects, "webgl2");
          const plain =
            label === "neutral-run"
              ? [render(still, [], "canvas2d"), render(still, [], "webgl2")]
              : undefined;
          let canvasMax = 0,
            webglMax = 0,
            webglAtOne = 0,
            opaque = 0,
            backendMax = 0;
          for (let i = 0; i < still.width * still.height; i++) {
            const at = i * 4;
            for (let c = 0; c < 4; c++)
              backendMax = Math.max(
                backendMax,
                Math.abs(canvas[at + c]! - webgl[at + c]!),
              );
            if (still.rgba[at + 3] !== 255) continue;
            opaque++;
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
              if (d === 1) webglAtOne++;
            }
          }
          parity.push({
            case: label,
            still: still.id,
            opaquePixels: opaque,
            canvasVsReference: canvasMax,
            webglVsReference: webglMax,
            webglChannelsAtOne: webglAtOne,
            backendMax,
            repeatIdentical: (await hash(webgl)) === (await hash(again)),
            identity: plain
              ? canvas.every((v, i) => v === plain[0]![i]) &&
                webgl.every((v, i) => v === plain[1]![i])
              : undefined,
          });
        }
      }

      // 2. Recovery: gain 2 then gain 0.5 (float) against exposure +1/-1 stop (8-bit).
      const ramp = stills[0]!;
      const recovery = (["canvas2d", "webgl2"] as const).map((backend) => {
        const float = render(
          ramp,
          [
            { effect: "grade.primary", params: { gainMaster: 2 } },
            { effect: "grade.primary", params: { gainMaster: 0.5 } },
          ],
          backend,
        );
        const bytes = render(
          ramp,
          [
            { effect: "color.exposure", params: { exposure: 1 } },
            { effect: "color.exposure", params: { exposure: -1 } },
          ],
          backend,
        );
        let floatMax = 0,
          byteMax = 0;
        for (let x = 0; x < 256; x++) {
          floatMax = Math.max(floatMax, Math.abs(float[x * 4]! - x));
          byteMax = Math.max(byteMax, Math.abs(bytes[x * 4]! - x));
        }
        return {
          backend,
          floatMaxError: floatMax,
          eightBitExposureMaxError: byteMax,
        };
      });

      // 3. Banding: ten stacked corrections whose product is neutral vs one pass.
      const stack: { effect: string; params: object }[] = [];
      for (let i = 0; i < 5; i++)
        stack.push(
          {
            effect: "grade.primary",
            params: { gammaMaster: 1.5, gainMaster: 0.8 },
          },
          { effect: "grade.primary", params: { gainMaster: 1.25 } },
        );
      const undo = {
        effect: "grade.primary",
        params: { gammaMaster: 1 / 1.5 ** 5 },
      };
      const banding = [];
      for (const still of [stills[0]!, stills[1]!])
        for (const backend of ["canvas2d", "webgl2"] as const) {
          // The stack's product is neutral, so one pass is the ungraded render.
          const one = render(still, [], backend);
          const many = render(still, [...stack, undo], backend);
          const row = (bytes: Uint8ClampedArray) =>
            Array.from({ length: still.width }, (_, x) => bytes[x * 4]!);
          const a = row(one),
            b = row(many);
          banding.push({
            still: still.id,
            backend,
            passes: stack.length + 1,
            distinctOnePass: new Set(a).size,
            distinctStacked: new Set(b).size,
            maxDifference: Math.max(...a.map((v, i) => Math.abs(v - b[i]!))),
          });
        }

      // 4. Layer kinds, animated controls, seeks (backend parity).
      const reference = (await import(
        String("/tests/helpers/composition-color-effect-reference.ts")
      )) as typeof ColorReference;
      const kinds = await reference.checkNativeEffectRendering({
        "grade.primary": [
          {},
          { gainMaster: 1.3, saturation: 1.4, hue: 20, shadows: 0.3 },
          {
            contrast: {
              keys: [
                { frame: 0, value: 0.5 },
                { frame: 11, value: 2 },
              ],
            },
            pivot: 0.4,
          },
        ],
        "grade.white-balance": [
          {},
          { temperature: 3400, tint: -20 },
          {
            temperature: {
              keys: [
                { frame: 0, value: 2500 },
                { frame: 11, value: 12000 },
              ],
            },
          },
        ],
        "grade.cdl": [
          {},
          { slopeR: 1.2, powerB: 0.8, saturation: 1.3 },
          {
            clamp: 0,
            offsetG: {
              keys: [
                { frame: 0, value: -0.2 },
                { frame: 11, value: 0.2 },
              ],
            },
          },
        ],
        "grade.rgb-mixer": [
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
      });
      return {
        parity,
        recovery,
        banding,
        kinds: {
          cases: kinds.cases,
          frames: kinds.frames,
          maxDelta: Math.max(...kinds.rows.map((r) => r.maxDelta)),
        },
      };
    },
    { stills, cases: CASES },
  );

  const proof = join(root, "benchmarks/results/color-grading-cg2");
  await mkdir(proof, { recursive: true });
  await writeFile(
    join(proof, "float-grade.json"),
    JSON.stringify(result, null, 2) + "\n",
  );

  type Row = {
    case: string;
    still: string;
    canvasVsReference: number;
    webglVsReference: number;
    webglChannelsAtOne: number;
    repeatIdentical: boolean;
    identity?: boolean;
  };
  const rows = result.parity as Row[];
  assert.deepEqual(
    rows
      .filter((r) => r.canvasVsReference !== 0)
      .map((r) => `${r.case}/${r.still}`),
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
    rows.filter((r) => r.case === "neutral-run").every((r) => r.identity),
    "a neutral run is an exact identity",
  );
  for (const r of result.recovery)
    assert.equal(r.floatMaxError, 0, `${r.backend}: recovered exactly`);
  for (const b of result.banding) {
    assert.equal(
      b.distinctStacked,
      b.distinctOnePass,
      `${b.still}/${b.backend}: no levels lost`,
    );
    assert.ok(
      b.maxDifference <= 1,
      `${b.still}/${b.backend}: stacked within one code`,
    );
  }
  assert.ok(
    result.kinds.maxDelta <= 1,
    `layer kinds and seeks: ${result.kinds.maxDelta}`,
  );
  console.log(
    "CG2 float grade:",
    JSON.stringify({
      parityRows: rows.length,
      canvasMax: Math.max(...rows.map((r) => r.canvasVsReference)),
      webglMax: Math.max(...rows.map((r) => r.webglVsReference)),
      webglChannelsAtOne: rows.reduce((a, r) => a + r.webglChannelsAtOne, 0),
      recovery: result.recovery,
      banding: result.banding,
      kinds: result.kinds,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}

// 5. A graded native-video composition exports through `comp render`, and the
// scene manifest records the grade effect versions.
const work = await mkdtemp(join(tmpdir(), "cg2-video-"));
try {
  await copyFile(
    join(root, "benchmarks/fixtures/color/cg0/media/moving-disc.mp4"),
    join(work, "moving-disc.mp4"),
  );
  const probe = await probeCompositionVideo(join(work, "moving-disc.mp4"));
  const composition = (effects: Effect[]) => ({
    schemaVersion: "composition-1",
    id: "cg2-video",
    width: probe.width,
    height: probe.height,
    fps: 24,
    frameCount: probe.frameCount,
    background: "#000000",
    assets: [
      {
        id: "clip",
        type: "video",
        path: "moving-disc.mp4",
        sha256: probe.sourceHash,
        width: probe.width,
        height: probe.height,
        frameCount: probe.frameCount,
        frameRate: probe.frameRate,
        color: probe.color,
      },
    ],
    layers: [
      {
        id: "clip",
        type: "video",
        asset: "clip",
        effects: effects.map((e, i) => ({ id: `g${i}`, ...e })),
      },
    ],
  });
  const exported: Record<string, unknown> = {};
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const input = join(work, `${backend}.json`);
    await writeFile(input, JSON.stringify(composition(CASES.chain!)));
    const output = join(work, `${backend}.mp4`);
    const run = spawnSync(
      "pnpm",
      [
        "--silent",
        "still-shift",
        "comp",
        "render",
        "--input",
        input,
        "--output",
        output,
        "--backend",
        backend,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          STILL_SHIFT_COMPOSITION_MEDIA_CACHE: join(work, "cache"),
        },
      },
    );
    assert.equal(run.status, 0, `${backend} export failed: ${run.stderr}`);
    const result = JSON.parse(run.stdout) as {
      sceneManifestPath: string;
      frameCount: number;
    };
    const manifest = JSON.parse(
      await readFile(result.sceneManifestPath, "utf8"),
    ) as {
      scene: { effectVersions?: Record<string, string> };
    };
    const versions = manifest.scene.effectVersions ?? {};
    for (const id of [
      "grade.primary",
      "grade.white-balance",
      "grade.cdl",
      "grade.rgb-mixer",
    ])
      assert.equal(
        versions[id],
        "1.0.0",
        `${backend}: ${id} version in the scene manifest`,
      );
    const frames = (await probeCompositionVideo(output)).frameCount;
    assert.equal(frames, probe.frameCount, `${backend}: exported frame count`);
    exported[backend] = {
      frames,
      effectVersions: Object.fromEntries(
        Object.entries(versions).filter(([id]) => id.startsWith("grade.")),
      ),
    };
  }
  console.log("CG2 graded native-video export:", JSON.stringify(exported));
} finally {
  await rm(work, { recursive: true, force: true });
}
