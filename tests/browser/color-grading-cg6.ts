/**
 * CG6: `grade.key` — qualifiers, windows, external mattes and matte finesse
 * in the float grade stage, on both backends.
 *
 * - qualifier keys (gray key view) on the CG0 hue and saturation sweeps match
 *   analytic masks computed from each pixel's own HSV (≤ 1 code value);
 * - the key is taken from the scoped operations' input, not their output;
 * - ellipse and rectangle window edges equal a solid layer carrying the same
 *   mask path (the layer-mask rasterizer), byte for byte;
 * - a keyed correction leaves pixels outside the key byte-identical (opaque
 *   and translucent pixels);
 * - every key configuration matches the float64 reference: Canvas exactly,
 *   WebGL2 within one code value, repeated WebGL2 renders byte-identical;
 * - on the moving CG0 clip the per-frame matte flicker is reported, and
 *   matte finesse reduces it.
 *
 *   pnpm test:browser:color-grading-cg6 [--json <file>]
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as FloatGrade from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import type * as BlurKernel from "../../packages/renderer-core/src/composition/render/webgl-blur-kernel.ts";
import type * as Shapes from "../../packages/renderer-core/src/composition/shapes/primitives.ts";
import type * as Science from "../../packages/color-science/src/index.ts";
import type { Composition } from "@still-shift/scene-contract";
import type * as Contract from "../../packages/scene-contract/src/index.ts";
import {
  loadCg0Stills,
  openColorGradingPage,
  repositoryRoot as root,
} from "../helpers/color-grading-browser.ts";

const STILLS = [
  "hue-sweep",
  "saturation-sweep",
  "chart-24",
  "skin-tones",
  "alpha-patches",
];
const stills = await loadCg0Stills(STILLS);

// The moving clip as RGBA frames (decode details do not matter here: every
// configuration keys the same frames).
const CLIP = { width: 640, height: 360, frames: 48 };
const clipBytes = execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-i",
    join(root, "benchmarks/fixtures/color/cg0/media/moving-disc.mp4"),
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-",
  ],
  { maxBuffer: 64 * 1024 * 1024 },
);
// Frames leave Node as base64 (number arrays of 48 frames exhaust the heap).
const frameBytes = CLIP.width * CLIP.height * 4;
const clipFrames = Array.from({ length: CLIP.frames }, (_, f) =>
  clipBytes.subarray(f * frameBytes, (f + 1) * frameBytes).toString("base64"),
);
const centre = (f: number) => [
  60 + 11 * f,
  150 + 2 * f + 30 * Math.sin((2 * Math.PI * f) / 48),
];

const { page, close } = await openColorGradingPage();
try {
  const result = await page.evaluate(
    async ({ stills, clipFrames, centres }) => {
      const m = (await import(
        String("/packages/renderer-core/src/index.ts")
      )) as typeof Render;
      const fg = (await import(
        String("/packages/renderer-core/src/composition/render/float-grade.ts")
      )) as typeof FloatGrade;
      const bk = (await import(
        String(
          "/packages/renderer-core/src/composition/render/webgl-blur-kernel.ts",
        )
      )) as typeof BlurKernel;
      const shapes = (await import(
        String("/packages/renderer-core/src/composition/shapes/primitives.ts")
      )) as typeof Shapes;
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
        ) as Record<string, unknown>;
      const sha = (n: number) => `sha256:${n.toString(16).padStart(64, "0")}`;
      type Still = (typeof stills)[number];
      const canvasOf = (still: Still) => {
        const canvas = document.createElement("canvas");
        canvas.width = still.width;
        canvas.height = still.height;
        const context = canvas.getContext("2d")!;
        const data = context.createImageData(still.width, still.height);
        data.data.set(still.rgba);
        context.putImageData(data, 0, 0);
        return canvas;
      };
      const canvases = new Map(stills.map((s) => [s.id, canvasOf(s)]));
      type Effect = {
        effect: string;
        params?: Record<string, unknown>;
        inputs?: Record<string, string>;
        enabled?: boolean;
      };
      type Backend = "canvas2d" | "webgl2";
      const image = (id: string, still: Still, extra: object = {}) => ({
        id,
        type: "image" as const,
        sources: [{ asset: still.id }],
        size: [still.width, still.height],
        fit: "stretch",
        transform: { anchor: [0, 0], position: [0, 0] },
        ...extra,
      });
      const renderComp = (
        size: Still,
        layers: unknown[],
        used: Still[],
        backend: Backend,
        frame = 0,
        background = "#000000",
      ) => {
        const composition = {
          schemaVersion: "composition-1",
          id: "cg6",
          width: size.width,
          height: size.height,
          fps: 24,
          frameCount: 12,
          background,
          assets: used.map((s, i) => ({
            id: s.id,
            type: "image",
            path: `${s.id}.png`,
            sha256: sha(i),
            width: s.width,
            height: s.height,
          })),
          layers,
        } as unknown as Composition;
        const preview = m.createCompositionPreview(
          document.createElement("canvas"),
          composition,
          {
            images: new Map<string, CanvasImageSource>(
              used.map((s) => [s.id, canvases.get(s.id) ?? canvasOf(s)]),
            ),
            fonts: new Map(),
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
      const render = (
        still: Still,
        effects: Effect[],
        backend: Backend,
        extra: { layers?: unknown[]; used?: Still[]; frame?: number } = {},
      ) =>
        renderComp(
          still,
          [
            ...(extra.layers ?? []),
            image("image", still, {
              effects: effects.map((e, i) => ({
                id: `g${i}`,
                effect: e.effect,
                ...(e.inputs ? { inputs: e.inputs } : {}),
                ...(e.enabled === false ? { enabled: false } : {}),
                params: (e.params ?? {}) as never,
              })),
            }),
          ],
          [still, ...(extra.used ?? [])],
          backend,
          extra.frame ?? 0,
        );

      // --- The float64 reference, written from @still-shift/color-science ---
      const hexRgb = (hex: string) =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
          number,
          number,
          number,
        ];
      const kernelOf = (sigma: number) => {
        const k = bk.blurKernel(sigma);
        return { weights: [...k.weights], divisor: k.divisor };
      };
      type Planes = {
        window?: Uint8ClampedArray;
        matte?: Uint8ClampedArray;
      };
      /** Key bytes (gray view) and graded output of one key + scoped ops. */
      const reference = (
        still: Still,
        keyParams: Record<string, unknown>,
        ops: Effect[],
        planes: Planes = {},
        /** The frame with no effects (composited over the black background). */
        base: ArrayLike<number> = still.rgba,
      ) => {
        const p = { ...defaults("grade.key"), ...keyParams } as Record<
          string,
          number | string | readonly number[]
        >;
        const N = (name: string) => p[name] as number;
        const pt = (name: string) => p[name] as [number, number];
        const n = still.width * still.height;
        const v = (i: number) => {
          const a = still.rgba[i * 4 + 3]!;
          return [0, 1, 2].map(
            (c) => Math.round((still.rgba[i * 4 + c]! * a) / 255) / a,
          ) as [number, number, number];
        };
        const samples = Array.from({ length: N("sampleCount") }, (_, i) =>
          cs.encodedToOklab(hexRgb(p[`sample${i + 1}`] as string)),
        );
        const q = new Float64Array(n).fill(1);
        if (N("qualifier")) {
          for (let i = 0; i < n; i++)
            q[i] = still.rgba[i * 4 + 3]
              ? cs.qualify(v(i), { ...p, samplesOklab: samples } as never)
              : 0;
          const refined = cs.refineMatte(
            q,
            still.width,
            still.height,
            p as never,
            N("blur") > 0 ? kernelOf(N("blur")) : undefined,
          );
          q.set(refined);
        }
        const mats = ops.flatMap((e) => {
          const op = fg.floatGradeOp(
            e.effect as never,
            {
              ...defaults(e.effect),
              ...e.params,
            } as never,
          );
          return op ? [op] : [];
        });
        const key = new Float64Array(n);
        const out = new Uint8ClampedArray(base);
        for (let i = 0; i < n; i++) {
          const x = (i % still.width) + 0.5,
            y = Math.floor(i / still.width) + 0.5;
          let w = 1;
          if (N("window")) {
            w = planes.window![i * 4]! / 255; // white over black: R = coverage
            if (N("windowInvert")) w = 1 - w;
          }
          const g = N("gradient")
            ? cs.gradientWindow(x, y, pt("gradientStart"), pt("gradientEnd"))
            : 1;
          let mt = 1;
          if (planes.matte) {
            const at = i * 4;
            const raw = N("matteMode")
              ? (0.2126 * planes.matte[at]! +
                  0.7152 * planes.matte[at + 1]! +
                  0.0722 * planes.matte[at + 2]!) /
                255
              : planes.matte[at]! / 255; // a white matte over black: R = alpha
            mt = cs.matteRange(
              raw,
              N("matteLow"),
              N("matteHigh"),
              N("matteInvert"),
            );
          }
          const k = cs.combineKey(q[i]!, w, g, mt, N("gain"), N("offset"));
          key[i] = k;
          const a = still.rgba[i * 4 + 3]!;
          if (!a) continue;
          const vin = v(i);
          let vout = vin;
          for (const op of mats) vout = op.apply(vout) as never;
          let o: readonly number[];
          if (N("view")) o = cs.keyView(N("view"), k, vout);
          else {
            if (k <= 0 || !mats.length) continue;
            o = cs.mixKeyed(vin, vout, k);
          }
          for (let c = 0; c < 3; c++)
            out[i * 4 + c] = Math.round((fg.quantizeGrade(o[c]!) * a) / 255);
        }
        return { key, out };
      };
      const diff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
        let max = 0,
          atOne = 0;
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i]! - b[i]!);
          max = Math.max(max, d);
          if (d === 1) atOne++;
        }
        return { max, atOne };
      };
      const same = (a: ArrayLike<number>, b: ArrayLike<number>) =>
        a.length === b.length && diff(a, b).max === 0;

      const GRADE: Effect = {
        effect: "grade.primary",
        params: { hue: 140, saturation: 1.6, gainR: 1.25, liftB: 0.08 },
      };
      const byId = new Map(stills.map((s) => [s.id, s]));
      const report: Record<string, unknown> = {};

      // 1. Qualifier keys on the sweeps vs analytic masks from each pixel's
      // own HSV (written here from the definition, not from the port).
      const hermite = (t: number) => {
        const c = Math.min(1, Math.max(0, t));
        return c * c * (3 - 2 * c);
      };
      const range = (x: number, lo: number, hi: number, s: number) =>
        s <= 0
          ? x >= lo && x <= hi
            ? 1
            : 0
          : Math.min(hermite((x - (lo - s)) / s), 1 - hermite((x - hi) / s));
      const analytic = (rgb: number[], q: Record<string, number>) => {
        const [r, g, b] = rgb as [number, number, number];
        const max = Math.max(r, g, b),
          min = Math.min(r, g, b),
          c = max - min;
        const hsvS = max ? c / max : 0;
        const l = max * (1 - hsvS / 2);
        const sl = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
        let hue: number | null = null;
        if (c > 0) {
          const h =
            max === r
              ? (g - b) / c
              : max === g
                ? (b - r) / c + 2
                : (r - g) / c + 4;
          hue = (h * 60 + 360) % 360;
        }
        let ht = 1;
        if (q.hueWidth! < 360) {
          if (hue === null) ht = 0;
          else {
            const d0 = Math.abs(hue - q.hueCenter!) % 360,
              d = Math.min(d0, 360 - d0);
            ht =
              q.hueSoftness! <= 0
                ? d <= q.hueWidth! / 2
                  ? 1
                  : 0
                : 1 - hermite((d - q.hueWidth! / 2) / q.hueSoftness!);
          }
        }
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return (
          ht *
          range(sl, q.saturationMin!, q.saturationMax!, q.saturationSoftness!) *
          range(y, q.luminanceMin!, q.luminanceMax!, q.luminanceSoftness!)
        );
      };
      const sweepCases: Record<string, number>[] = [
        { hueCenter: 30, hueWidth: 40, hueSoftness: 20 },
        { hueCenter: 350, hueWidth: 30, hueSoftness: 15 },
        { hueCenter: 200, hueWidth: 60, hueSoftness: 0 },
        {
          hueCenter: 120,
          hueWidth: 90,
          hueSoftness: 30,
          saturationMin: 0.6,
          saturationSoftness: 0.15,
        },
        { saturationMin: 0.3, saturationMax: 0.6, saturationSoftness: 0.1 },
        {
          hueCenter: 0,
          hueWidth: 60,
          hueSoftness: 20,
          luminanceMin: 0.3,
          luminanceSoftness: 0.1,
        },
      ];
      const sweeps = [];
      for (const id of ["hue-sweep", "saturation-sweep"])
        for (const sweep of sweepCases) {
          const still = byId.get(id)!;
          const q = {
            ...(defaults("grade.key") as Record<string, number>),
            ...sweep,
          };
          const want = Array.from(
            { length: still.width * still.height },
            (_, i) =>
              Math.round(
                255 *
                  analytic(
                    [0, 1, 2].map((c) => still.rgba[i * 4 + c]! / 255),
                    q,
                  ),
              ),
          );
          const row: Record<string, unknown> = { still: id, sweep };
          for (const backend of ["canvas2d", "webgl2"] as const) {
            const got = render(
              still,
              [
                {
                  effect: "grade.key",
                  params: { qualifier: 1, view: 1, ...sweep },
                },
              ],
              backend,
            );
            const gray = Array.from(
              { length: want.length },
              (_, i) => got[i * 4]!,
            );
            row[backend] = diff(gray, want);
          }
          sweeps.push(row);
        }
      report.sweeps = sweeps;

      // 2. The key is taken from the operations' input, not their output: a
      // key on orange scoping a 180° hue rotation keys the orange pixels
      // (which leave the range), and keying the output instead would differ.
      {
        const still = byId.get("hue-sweep")!;
        const keyParams = {
          qualifier: 1,
          hueCenter: 30,
          hueWidth: 40,
          hueSoftness: 10,
        };
        const rotate: Effect = {
          effect: "grade.primary",
          params: { hue: 180 },
        };
        const ref = reference(still, keyParams, [rotate]);
        const fromOutput = reference(
          {
            ...still,
            rgba: [...render(still, [rotate], "canvas2d")],
          },
          keyParams,
          [],
        );
        const keyed = [...ref.key].filter((k) => k > 0).length;
        const keyedIfOutput = [...fromOutput.key].filter((k) => k > 0).length;
        // Pixels whose key would differ if it were taken from the output.
        const keysDiffer = [...ref.key].filter(
          (k, i) => k !== fromOutput.key[i],
        ).length;
        const row: Record<string, unknown> = {
          keyed,
          keyedIfOutput,
          keysDiffer,
        };
        for (const backend of ["canvas2d", "webgl2"] as const) {
          const got = render(
            still,
            [{ effect: "grade.key", params: keyParams }, rotate],
            backend,
          );
          row[backend] = diff(got, ref.out);
          let changed = 0;
          for (let i = 0; i < got.length; i += 4)
            if (got[i] !== still.rgba[i]) changed++;
          row[`${backend}Changed`] = changed;
        }
        report.keyFromInput = row;
      }

      // 3. Window edges vs the layer-mask rasterizer: a white solid carrying
      // the same mask path, feather and expansion over black.
      const rotatePath = (
        path: NonNullable<ReturnType<typeof shapes.ellipsePath>>,
        degrees: number,
        about: [number, number],
      ) => {
        const a = (degrees * Math.PI) / 180,
          c = Math.cos(a),
          s = Math.sin(a);
        const turn = ([x, y]: readonly number[]) =>
          [x! * c - y! * s, x! * s + y! * c] as [number, number];
        return {
          ...path,
          vertices: path.vertices.map(([x, y]) => {
            const [rx, ry] = turn([x! - about[0], y! - about[1]]);
            return [rx + about[0], ry + about[1]] as [number, number];
          }),
          ...(path.inTangents ? { inTangents: path.inTangents.map(turn) } : {}),
          ...(path.outTangents
            ? { outTangents: path.outTangents.map(turn) }
            : {}),
        };
      };
      const windowCases = [
        {
          window: 1,
          windowCenter: [180, 128],
          windowSize: [220, 150],
          windowRotation: 0,
          windowFeather: 0,
          windowExpansion: 0,
        },
        {
          window: 1,
          windowCenter: [170, 120],
          windowSize: [200, 120],
          windowRotation: 25,
          windowFeather: 12,
          windowExpansion: 4,
        },
        {
          window: 2,
          windowCenter: [200, 140],
          windowSize: [160, 100],
          windowRotation: -15,
          windowRoundness: 18,
          windowFeather: 6,
          windowExpansion: -3,
        },
        {
          window: 2,
          windowCenter: [150.5, 99.25],
          windowSize: [97.3, 61.7],
          windowRotation: 0,
          windowFeather: 0,
          windowExpansion: 0,
        },
      ];
      const windowCoverage = (
        still: Still,
        w: Record<string, unknown>,
        backend: Backend,
      ) => {
        const centre = w.windowCenter as [number, number],
          size = w.windowSize as [number, number];
        const base =
          w.window === 1
            ? shapes.ellipsePath({ size, position: centre })!
            : shapes.rectanglePath({
                size,
                position: centre,
                roundness: (w.windowRoundness as number) ?? 0,
              })!;
        const path = rotatePath(base, w.windowRotation as number, centre);
        return renderComp(
          still,
          [
            {
              id: "solid",
              type: "solid",
              size: [still.width, still.height],
              color: "#ffffff",
              transform: { anchor: [0, 0], position: [0, 0] },
              masks: [
                {
                  id: "w",
                  path,
                  mode: "add",
                  feather: w.windowFeather,
                  expansion: w.windowExpansion,
                },
              ],
            },
          ],
          [],
          backend,
        );
      };
      const windows = [];
      const chart = byId.get("chart-24")!;
      for (const w of windowCases) {
        const row: Record<string, unknown> = { window: w };
        for (const backend of ["canvas2d", "webgl2"] as const) {
          const masked = windowCoverage(chart, w, backend);
          const got = render(
            chart,
            [{ effect: "grade.key", params: { ...w, view: 1 } }],
            backend,
          );
          const gray = Array.from(
            { length: chart.width * chart.height },
            (_, i) => got[i * 4]!,
          );
          const alpha = Array.from(
            { length: chart.width * chart.height },
            (_, i) => masked[i * 4]!,
          );
          row[backend] = diff(gray, alpha);
        }
        windows.push(row);
      }
      report.windows = windows;

      // 4 and 5. Configurations: float64 reference parity and outside-key
      // byte identity (opaque and translucent stills).
      const configs: Record<string, Record<string, unknown>> = {
        hsl: {
          qualifier: 1,
          hueCenter: 25,
          hueWidth: 30,
          hueSoftness: 15,
          saturationMin: 0.3,
          saturationSoftness: 0.1,
        },
        "hsl-hard": { qualifier: 1, hueCenter: 200, hueWidth: 60 },
        rgb: { qualifier: 2, redMin: 0.5, greenMax: 0.5, rgbSoftness: 0.1 },
        luma: {
          qualifier: 3,
          luminanceMin: 0.3,
          luminanceMax: 0.7,
          luminanceSoftness: 0.1,
        },
        sampled: {
          qualifier: 4,
          sampleCount: 2,
          sample1: "#db541f",
          sample2: "#c8906e",
          sampleRadius: 0.06,
          sampleSoftness: 0.08,
        },
        finesse: {
          qualifier: 1,
          hueCenter: 25,
          hueWidth: 30,
          hueSoftness: 15,
          clipBlack: 0.1,
          clipWhite: 0.9,
          denoise: 2,
          cleanBlack: 1,
          cleanWhite: 2,
          shrinkGrow: 1,
          blur: 2.5,
          inOutRatio: -0.5,
          invert: 1,
        },
        "finesse-out": {
          qualifier: 3,
          luminanceMin: 0.3,
          luminanceMax: 0.7,
          blur: 6,
          inOutRatio: 0.7,
          shrinkGrow: -2,
        },
        "gain-offset": {
          qualifier: 1,
          hueCenter: 25,
          hueWidth: 30,
          hueSoftness: 15,
          gain: 1.5,
          offset: -0.1,
        },
        ellipse: windowCases[1]!,
        "rect-inverted-luma": {
          ...windowCases[2]!,
          windowInvert: 1,
          qualifier: 3,
          luminanceMin: 0.4,
        },
        gradient: {
          gradient: 1,
          gradientStart: [0, 0],
          gradientEnd: [300, 200],
        },
        "view-highlight": {
          qualifier: 1,
          hueCenter: 25,
          hueWidth: 30,
          hueSoftness: 15,
          view: 2,
        },
        "view-contrast": {
          qualifier: 1,
          hueCenter: 25,
          hueWidth: 30,
          hueSoftness: 15,
          blur: 1.5,
          view: 3,
        },
      };
      const parity = [];
      const outside = [];
      for (const [name, keyParams] of Object.entries(configs))
        for (const id of ["chart-24", "skin-tones", "alpha-patches"]) {
          const still = byId.get(id)!;
          const row: Record<string, unknown> = { config: name, still: id };
          for (const backend of ["canvas2d", "webgl2"] as const) {
            const planes: Planes = keyParams.window
              ? { window: windowCoverage(still, keyParams, backend) }
              : {};
            const base = render(still, [], backend);
            const ref = reference(still, keyParams, [GRADE], planes, base);
            const got = render(
              still,
              [{ effect: "grade.key", params: keyParams }, GRADE],
              backend,
            );
            row[backend] = diff(got, ref.out);
            if (backend === "webgl2")
              row.repeatIdentical = same(
                got,
                render(
                  still,
                  [{ effect: "grade.key", params: keyParams }, GRADE],
                  backend,
                ),
              );
            if (!keyParams.view) {
              let n = 0,
                bad = 0;
              for (let i = 0; i < ref.key.length; i++)
                if (ref.key[i] === 0) {
                  n++;
                  for (let c = 0; c < 4; c++)
                    if (got[i * 4 + c] !== base[i * 4 + c]) {
                      bad++;
                      break;
                    }
                }
              outside.push({
                config: name,
                still: id,
                backend,
                outsidePixels: n,
                changed: bad,
              });
            }
          }
          parity.push(row);
        }
      report.parity = parity;
      report.outside = outside;

      // External matte: a hidden layer bound to `matte` (alpha of a masked
      // solid: a layer window; luma of an image: a luma matte).
      {
        const still = byId.get("chart-24")!;
        const lumaStill = byId.get("skin-tones")!;
        const rows = [];
        for (const [name, keyParams, layer, used] of [
          [
            "alpha-window",
            { matteMode: 0 },
            {
              id: "matte",
              type: "solid",
              enabled: false,
              size: [still.width, still.height],
              color: "#ffffff",
              transform: { anchor: [0, 0], position: [0, 0] },
              masks: [
                {
                  id: "m",
                  path: shapes.ellipsePath({
                    size: [180, 140],
                    position: [190, 120],
                  })!,
                  mode: "add",
                  feather: 8,
                },
              ],
            },
            [],
          ],
          [
            "luma-levels",
            {
              matteMode: 1,
              matteLow: 0.2,
              matteHigh: 0.8,
              matteInvert: 1,
              qualifier: 3,
              luminanceMin: 0.2,
            },
            image(
              "matte",
              { ...lumaStill, width: still.width, height: still.height },
              { enabled: false },
            ),
            [lumaStill],
          ],
        ] as const) {
          const row: Record<string, unknown> = { config: name };
          for (const backend of ["canvas2d", "webgl2"] as const) {
            const matte = renderComp(
              still,
              [{ ...(layer as object), enabled: true }],
              used as unknown as Still[],
              backend,
              0,
              "#00000000",
            );
            const ref = reference(still, keyParams, [GRADE], { matte });
            const got = render(
              still,
              [
                {
                  effect: "grade.key",
                  params: keyParams,
                  inputs: { matte: "matte" },
                },
                GRADE,
              ],
              backend,
              { layers: [layer], used: used as unknown as Still[] },
            );
            row[backend] = diff(got, ref.out);
          }
          rows.push(row);
        }
        report.externalMatte = rows;
      }

      // A neutral key and a key scoping only neutral ops are identities; a
      // second key ends the first one's scope.
      {
        const still = byId.get("chart-24")!;
        const id = (effects: Effect[], backend: Backend) =>
          same(render(still, effects, backend), render(still, [], backend));
        const second = reference(still, configs.hsl!, [GRADE]);
        report.identities = Object.fromEntries(
          (["canvas2d", "webgl2"] as const).map((backend) => [
            backend,
            {
              neutralKey: id([{ effect: "grade.key" }], backend),
              keyNeutralOp: id(
                [
                  { effect: "grade.key", params: configs.hsl! },
                  { effect: "grade.primary" },
                ],
                backend,
              ),
              secondKeyEndsScope: diff(
                render(
                  still,
                  [
                    { effect: "grade.key", params: configs.hsl! },
                    GRADE,
                    { effect: "grade.key" },
                  ],
                  backend,
                ),
                second.out,
              ).max,
            },
          ]),
        );
      }

      // 6. Matte stability on the moving clip: flicker of the gray key view
      // between consecutive frames, excluding a 3 px band around the disc edge
      // in either frame (true motion), raw and with finesse.
      const clipKey = {
        qualifier: 1,
        hueCenter: 75,
        hueWidth: 30,
        hueSoftness: 8,
        saturationMin: 0.1,
        saturationSoftness: 0.05,
      };
      const finesse = { denoise: 2, cleanBlack: 1, cleanWhite: 1, blur: 1.5 };
      const stability: Record<string, unknown> = {};
      for (const backend of ["canvas2d", "webgl2"] as const)
        for (const [name, params] of [
          ["raw", clipKey],
          ["finesse", { ...clipKey, ...finesse }],
        ] as const) {
          const keys = clipFrames.map((base64, f) => {
            const frame = {
              id: `clip-${f}`,
              width: 640,
              height: 360,
              rgba: Uint8Array.from(atob(base64), (c) =>
                c.charCodeAt(0),
              ) as unknown as number[],
            };
            const got = render(
              frame,
              [{ effect: "grade.key", params: { ...params, view: 1 } }],
              backend,
            );
            return Uint8Array.from(
              { length: frame.width * frame.height },
              (_, i) => got[i * 4]!,
            );
          });
          const perFrame: Record<string, number>[] = [];
          for (let f = 1; f < keys.length; f++) {
            const [ax, ay] = centres[f - 1]!,
              [bx, by] = centres[f]!;
            const stable = (i: number) => {
              const x = (i % 640) + 0.5,
                y = Math.floor(i / 640) + 0.5;
              return [
                Math.hypot(x - ax!, y - ay!),
                Math.hypot(x - bx!, y - by!),
              ].every((d) => Math.abs(d - 36) > 3);
            };
            const all = cs.matteFlicker(keys[f - 1]!, keys[f]!);
            const still = cs.matteFlicker(keys[f - 1]!, keys[f]!, stable);
            perFrame.push({
              frame: f,
              meanChange: +all.meanChange.toFixed(6),
              changedFraction: +all.changedFraction.toFixed(6),
              stableMeanChange: +still.meanChange.toFixed(6),
              stableChangedFraction: +still.changedFraction.toFixed(6),
            });
          }
          const mean = (
            k: "stableMeanChange" | "stableChangedFraction" | "meanChange",
          ) =>
            +(
              perFrame.reduce((a, r) => a + r[k]!, 0) / perFrame.length
            ).toFixed(6);
          stability[`${backend}:${name}`] = {
            params,
            meanChange: mean("meanChange"),
            stableMeanChange: mean("stableMeanChange"),
            stableChangedFraction: mean("stableChangedFraction"),
            perFrame,
          };
        }
      report.stability = stability;
      return report;
    },
    {
      stills,
      clipFrames,
      centres: Array.from({ length: CLIP.frames }, (_, f) => centre(f)),
    },
  );

  const jsonAt = process.argv.indexOf("--json");
  if (jsonAt > 0) {
    await mkdir(join(process.argv[jsonAt + 1]!, ".."), { recursive: true });
    await writeFile(
      process.argv[jsonAt + 1]!,
      JSON.stringify(result, null, 2) + "\n",
    );
  }
  type Diff = { max: number; atOne: number };
  const r = result as Record<string, unknown>;
  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (!ok) failures.push(what);
  };
  for (const row of r.sweeps as Record<string, Diff>[])
    for (const b of ["canvas2d", "webgl2"])
      check(row[b]!.max <= 1, `sweep ${JSON.stringify(row)} ${b}`);
  const kfi = r.keyFromInput as {
    keyed: number;
    keyedIfOutput: number;
    keysDiffer: number;
    canvas2d: Diff;
    webgl2: Diff;
    canvas2dChanged: number;
  };
  check(kfi.keyed > 0 && kfi.keysDiffer > 0, "key from input discriminates");
  check(
    (kfi.canvas2d as Diff).max === 0 && (kfi.webgl2 as Diff).max <= 1,
    "key from input parity",
  );
  check(
    (kfi.canvas2dChanged as number) > 0,
    "key from input changes keyed pixels",
  );
  for (const row of r.windows as Record<string, Diff>[])
    for (const b of ["canvas2d", "webgl2"])
      check(row[b]!.max === 0, `window ${JSON.stringify(row.window)} ${b}`);
  for (const row of r.parity as Record<string, unknown>[]) {
    check(
      (row.canvas2d as Diff).max === 0,
      `parity canvas ${row.config} ${row.still}`,
    );
    check(
      (row.webgl2 as Diff).max <= 1,
      `parity webgl ${row.config} ${row.still}`,
    );
    check(row.repeatIdentical === true, `repeat ${row.config} ${row.still}`);
  }
  for (const row of r.outside as Record<string, number>[])
    check(row.changed === 0, `outside ${JSON.stringify(row)}`);
  for (const row of r.externalMatte as Record<string, unknown>[]) {
    check((row.canvas2d as Diff).max === 0, `matte canvas ${row.config}`);
    check((row.webgl2 as Diff).max <= 1, `matte webgl ${row.config}`);
  }
  for (const [b, ids] of Object.entries(
    r.identities as Record<string, Record<string, unknown>>,
  )) {
    check(
      ids.neutralKey === true && ids.keyNeutralOp === true,
      `identities ${b}`,
    );
    check(
      (ids.secondKeyEndsScope as number) <= (b === "canvas2d" ? 0 : 1),
      `second key ${b}`,
    );
  }
  const st = r.stability as Record<string, { stableMeanChange: number }>;
  for (const b of ["canvas2d", "webgl2"])
    check(
      st[`${b}:finesse`]!.stableMeanChange < st[`${b}:raw`]!.stableMeanChange,
      `finesse reduces chatter ${b}`,
    );
  console.log(
    JSON.stringify(
      {
        sweeps: (r.sweeps as unknown[]).length,
        windows: r.windows,
        stability: Object.fromEntries(
          Object.entries(st).map(([k, v]) => [
            k,
            {
              meanChange: (v as never as { meanChange: number }).meanChange,
              stableMeanChange: v.stableMeanChange,
            },
          ]),
        ),
        failures,
      },
      null,
      1,
    ).slice(0, 4000),
  );
  assert.deepEqual(failures, []);
  console.log("color-grading-cg6: ok");
} finally {
  await close();
}
