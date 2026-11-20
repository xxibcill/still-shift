/**
 * CG0 color-effect baseline: the current behavior of every `color.*` effect
 * on the CG0 test stills, before the float grade stage (CG2) is added.
 *
 * Each effect renders on each still at its defaults, one typical setting and
 * one extreme setting, through Canvas and WebGL2. The baseline records one
 * SHA-256 per render (backends must agree byte for byte, as the exact-parity
 * effects guarantee) and the gray-ramp transfer table (input code 0–255 →
 * output RGB) so later milestones can compare grade operators against these
 * effects numerically.
 *
 *   pnpm test:browser:color-grading-cg0                         # check
 *   pnpm test:browser:color-grading-cg0 --write-cg0-baseline    # record
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { format } from "prettier";
import { createServer } from "vite";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type { Composition } from "@still-shift/scene-contract";

const root = resolve(import.meta.dirname, "../..");
const fixtures = join(root, "benchmarks/fixtures/color/cg0");

/** Defaults, a typical setting and an extreme setting per effect (static). */
export const CG0_EFFECT_CASES: Record<string, Record<string, object>> = {
  "color.levels": {
    defaults: {},
    typical: {
      inputBlack: 0.05,
      inputWhite: 0.92,
      gamma: 1.2,
      outputBlack: 0.02,
      outputWhite: 0.98,
    },
    extreme: { inputBlack: 0.3, inputWhite: 0.6, gamma: 0.3, outputWhite: 0.8 },
  },
  "color.curves": {
    defaults: {},
    typical: {
      curve: [
        [0, 0],
        [0.25, 0.2],
        [0.75, 0.82],
        [1, 1],
      ],
    },
    extreme: {
      curve: [
        [0, 1],
        [0.5, 0],
        [1, 1],
      ],
      amount: 0.8,
    },
  },
  "color.exposure": {
    defaults: {},
    typical: { exposure: 0.5, offset: -0.01, gamma: 0.95 },
    extreme: { exposure: 3, offset: 0.2, gamma: 4 },
  },
  "color.hue-saturation": {
    defaults: {},
    typical: { hue: 10, saturation: 25, lightness: -5 },
    extreme: { hue: 180, saturation: -100, lightness: 60 },
  },
  "color.brightness-contrast": {
    defaults: {},
    typical: { brightness: 0.05, contrast: 0.2 },
    extreme: { brightness: -0.6, contrast: 1 },
  },
  "color.tint": {
    defaults: {},
    typical: { black: "#1a2030", white: "#fff2e0", amount: 0.5 },
    extreme: { black: "#ff0000", white: "#00ffff" },
  },
  "color.fill": {
    defaults: {},
    typical: { color: "#3366cc", amount: 0.25 },
    extreme: { color: "#00ff0080" },
  },
  "color.gradient-ramp": {
    defaults: {},
    typical: {
      start: [0, 0],
      end: [256, 64],
      startColor: "#203040",
      endColor: "#f0e0c0",
      amount: 0.3,
    },
    extreme: { start: [10, 10], end: [10, 10], startColor: "#ff00ff" },
  },
  "color.invert": {
    defaults: {},
    typical: { amount: 0.5 },
    extreme: { amount: 0 },
  },
  "color.posterize": {
    defaults: {},
    typical: { levels: 32 },
    extreme: { levels: 2 },
  },
  "color.matrix": {
    defaults: {},
    typical: {
      rr: 0.955,
      gg: 0.961,
      bb: 1.034,
      ro: -0.004,
      go: -0.002,
      bo: 0.003,
      strength: 0.6,
    },
    extreme: {
      rr: -1,
      rg: 2,
      rb: 0.5,
      gr: 1.5,
      gg: -0.5,
      bb: 3,
      ro: 0.3,
      bo: -0.4,
    },
  },
  "color.white-balance": {
    defaults: {},
    typical: { temperature: -20, tint: 8 },
    extreme: { temperature: 100, tint: -100 },
  },
  "color.vibrance": {
    defaults: {},
    typical: { vibrance: 40, saturation: 5 },
    extreme: { vibrance: -100, saturation: 100, protectSkin: 0 },
  },
};
const EXACT_EFFECTS = new Set([
  "color.matrix",
  "color.white-balance",
  "color.vibrance",
]);
const STILLS = [
  "gray-ramp-256",
  "chart-24",
  "hue-sweep",
  "saturation-sweep",
  "skin-tones",
  "noisy-gradient",
  "alpha-patches",
] as const;

type Row = {
  effect: string;
  label: string;
  still: string;
  maxDelta: number;
  canvas2d: string;
  webgl2: string;
  /** Gray-ramp row 0 as RGB bytes (gray-ramp-256 only). */
  ramp?: number[];
};

const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

const stills = await Promise.all(
  STILLS.map(async (id) => {
    const bytes = await readFile(join(fixtures, `stills/${id}.png`));
    const { width, height, rgba } = decodeCompositionRgbaPng(bytes);
    return { id, width, height, rgba: [...rgba], sha256: sha(bytes) };
  }),
);

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
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const rows: Row[] = await page.evaluate(
    async ({ stills, cases }) => {
      const m = (await import(
        String("/packages/renderer-core/src/index.ts")
      )) as typeof Render;
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
      const hex = async (bytes: Uint8ClampedArray<ArrayBuffer>) =>
        [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const out: Row[] = [];
      for (const [effect, settings] of Object.entries(cases))
        for (const [label, params] of Object.entries(settings))
          for (const still of stills) {
            const composition: Composition = {
              schemaVersion: "composition-1",
              id: "cg0",
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
                  effects: [{ id: "fx", effect, params: params as never }],
                },
              ],
            };
            const resources = {
              images: new Map<string, CanvasImageSource>([
                ["still", canvases.get(still.id)!],
              ]),
              fonts: new Map(),
            };
            const [canvas, webgl] = (["canvas2d", "webgl2"] as const).map(
              (backend) => {
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
              },
            );
            let maxDelta = 0;
            for (let i = 0; i < canvas!.length; i++)
              maxDelta = Math.max(maxDelta, Math.abs(canvas![i]! - webgl![i]!));
            const row: Row = {
              effect,
              label,
              still: still.id,
              maxDelta,
              canvas2d: await hex(canvas!),
              webgl2: await hex(webgl!),
            };
            if (still.id === "gray-ramp-256")
              row.ramp = Array.from(
                { length: 256 * 3 },
                (_, i) => canvas![Math.floor(i / 3) * 4 + (i % 3)]!,
              );
            out.push(row);
          }
      return out;
    },
    { stills, cases: CG0_EFFECT_CASES },
  );

  // CGA grade effects are exact; the original ten color effects are held to
  // the CE6 near tier (at most one code value), which is what they meet.
  const parityFailures = rows.filter(
    (row) => row.maxDelta > (EXACT_EFFECTS.has(row.effect) ? 0 : 1),
  );
  assert.deepEqual(
    parityFailures.map(
      (r) => `${r.effect}/${r.label}/${r.still}: ${r.maxDelta}`,
    ),
    [],
    "Canvas/WebGL2 parity: exact for CGA effects, within 1 for the others",
  );
  const effectVersions = Object.fromEntries(
    Object.keys(CG0_EFFECT_CASES).map((id) => [
      id,
      compositionEffectDefinition(id)!.version,
    ]),
  );
  type Item = { canvas2d: string; webgl2: string; maxDelta: number };
  const items: Record<string, Record<string, Record<string, Item>>> = {};
  const transfer: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    ((items[row.effect] ??= {})[row.label] ??= {})[row.still] = {
      canvas2d: row.canvas2d,
      webgl2: row.webgl2,
      maxDelta: row.maxDelta,
    };
    if (row.ramp)
      (transfer[row.effect] ??= {})[row.label] = Buffer.from(row.ramp).toString(
        "hex",
      );
  }
  const record = {
    version: "color-grading-cg0-effect-baseline-1",
    environment,
    effectVersions,
    stills: Object.fromEntries(stills.map((s) => [s.id, `sha256:${s.sha256}`])),
    cases: CG0_EFFECT_CASES,
    note: "SHA-256 of each render's RGBA pixels per backend, and the largest Canvas/WebGL2 byte difference. 'transfer' is the Canvas gray-ramp-256 output row as hex RGB bytes for input codes 0-255.",
    items,
    transfer,
  };
  const directory = join(root, "tests/visual/color-grading");
  const path = join(
    directory,
    `${environment.platform}-${environment.arch}-cg0.json`,
  );
  const text = await format(JSON.stringify(record), { parser: "json" });
  if (process.argv.includes("--write-cg0-baseline")) {
    await mkdir(directory, { recursive: true });
    await writeFile(path, text);
    console.log(`Wrote ${path}`);
  } else {
    const stored = JSON.parse(await readFile(path, "utf8"));
    assert.equal(stored.version, record.version);
    assert.equal(
      stored.environment.rasterFingerprint,
      environment.rasterFingerprint,
      "The baseline was recorded in another render environment",
    );
    assert.deepEqual(stored.effectVersions, effectVersions);
    assert.deepEqual(stored.stills, record.stills, "CG0 stills changed");
    const changed: string[] = [];
    for (const [effect, labels] of Object.entries(items))
      for (const [label, byStill] of Object.entries(labels))
        for (const [still, item] of Object.entries(byStill))
          if (
            JSON.stringify(stored.items?.[effect]?.[label]?.[still]) !==
            JSON.stringify(item)
          )
            changed.push(`${effect}/${label}/${still}`);
    assert.deepEqual(changed, [], "CG0 color-effect renders changed");
    assert.deepEqual(stored.transfer, transfer, "gray-ramp transfer changed");
  }
  const proof = join(root, "benchmarks/results/color-grading-cg0");
  await mkdir(proof, { recursive: true });
  await writeFile(
    join(proof, "effect-baseline.json"),
    JSON.stringify({ environment, renders: rows.length, rows }, null, 2) + "\n",
  );
  console.log(
    "CG0 color-effect baseline:",
    JSON.stringify({
      effects: Object.keys(items).length,
      renders: rows.length,
      backends: 2,
      parityMaxDelta: Math.max(...rows.map((r) => r.maxDelta)),
      rendersWithDelta1: rows.filter((r) => r.maxDelta === 1).length,
      result: process.argv.includes("--write-cg0-baseline")
        ? "written"
        : "unchanged",
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
