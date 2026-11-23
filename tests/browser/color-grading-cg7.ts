/**
 * CG7 browser group: color-managed compositions on both backends
 * (docs/color-grading-cg7-decisions.md).
 *
 * - Source stage: CG0 10-bit ramps prepared into the 16-bit scene cache,
 *   decoded in the page and drawn by a video layer, equal byte for byte to
 *   the float64 reference (input transform → ACEScct → grade → display) on
 *   Canvas and WebGL2, with and without a leading grade.
 * - Grade runs on display-referred layers in ACEScct: Canvas equals the
 *   float64 reference, WebGL2 within one code value, repeats identical.
 * - Compositing rule: a display-referred layer over a color-managed video
 *   renders as in a legacy composition.
 *
 * Results go to research/color-grading-cg7/browser-results.json.
 */
import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sourceTransform,
  workingToDisplay,
  type Rgb,
  type SourceEncoding,
} from "@still-shift/color-science";
import {
  compositionEffectDefinition,
  compositionSceneSample,
  type Composition,
  type CompositionAsset,
  type CompositionMediaColor,
} from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as SceneFrames from "../../packages/renderer-core/src/composition/render/scene-frames.ts";
import { prepareCompositionVisualMedia } from "../../packages/animation-engine/src/composition-media-cache.ts";
import {
  compositionMediaChecksum,
  probeCompositionVideo,
} from "../../packages/animation-engine/src/composition-media-probe.ts";
import { decodeScenePng } from "../../packages/animation-engine/src/composition-media-scene.ts";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import { renderComposition } from "../../packages/animation-engine/src/composition-render.ts";
import {
  conversionOp,
  floatGradeOp,
  quantizeGrade,
} from "../../packages/renderer-core/src/composition/render/float-grade.ts";
import {
  loadCg0Stills,
  openColorGradingPage,
  repositoryRoot as root,
} from "../helpers/color-grading-browser.ts";

type Video = Extract<CompositionAsset, { type: "video" }>;
const cg0 = join(root, "benchmarks/fixtures/color/cg0");
const work = await mkdtemp(join(tmpdir(), "cg7-browser-"));

const RAMPS: [string, SourceEncoding, CompositionMediaColor["encoding"]?][] = [
  [
    "sony-slog3",
    { kind: "camera", id: "sony-slog3-sgamut3" },
    "sony-slog3-sgamut3",
  ],
  ["arri-logc4", { kind: "camera", id: "arri-logc4-awg4" }, "arri-logc4-awg4"],
  ["apple-log", { kind: "camera", id: "apple-log-bt2020" }, "apple-log-bt2020"],
  ["pq", { kind: "display", primaries: "bt2020", transfer: "pq" }],
  ["hlg", { kind: "display", primaries: "bt2020", transfer: "hlg" }],
  ["bt709", { kind: "display", primaries: "bt709", transfer: "srgb" }],
];
/** A leading grade the source stage runs (exposure-like gain and contrast). */
const GRADE = { gainMaster: 1.6, contrast: 1.2, pivot: 0.42 };
const primary = (params: Record<string, number>) =>
  floatGradeOp("grade.primary", {
    ...Object.fromEntries(
      Object.entries(
        compositionEffectDefinition("grade.primary")!.properties,
      ).map(([k, p]) => [k, p.default as number]),
    ),
    ...params,
  })!;

const ramps = [] as {
  name: string;
  asset: Video;
  samples: string;
  png: string;
  expected: { neutral: number[]; graded: number[] };
}[];
for (const [name, source, encoding] of RAMPS) {
  const path = join(cg0, `ramps/${name}-10bit.mkv`);
  const probe = await probeCompositionVideo(path, { colorManaged: true });
  const asset: Video = {
    id: "ramp",
    type: "video",
    path,
    sha256: await compositionMediaChecksum(path),
    width: probe.width,
    height: probe.height,
    frameCount: probe.frameCount,
    frameRate: probe.frameRate,
    color: { ...probe.color, ...(encoding ? { encoding } : {}) },
  };
  const prepared = await prepareCompositionVisualMedia({
    asset,
    sourceDirectory: cg0,
    cacheDirectory: join(work, "cache"),
    ordinals: [0],
    scene: true,
  });
  const png = await readFile(Object.values(prepared.assetPaths)[0]!);
  const frame = decodeScenePng(png);
  // The float64 reference, written from the pieces, not the stage itself.
  const into = sourceTransform(source, "acescct");
  const out = workingToDisplay("acescct");
  const grade = primary(GRADE);
  const neutral: number[] = [],
    graded: number[] = [];
  for (let i = 0; i < frame.width * frame.height; i++) {
    const v = into.toWorking(
      [0, 1, 2].map((c) =>
        compositionSceneSample(frame.samples[i * 4 + c]!),
      ) as unknown as Rgb,
    );
    for (const [target, value] of [
      [neutral, v],
      [graded, grade.apply(v)],
    ] as const) {
      const d = out.apply(value);
      target.push(...d.map(quantizeGrade), 255);
    }
  }
  ramps.push({
    name,
    asset: { ...asset, path: `${name}.mkv` },
    samples: Buffer.from(frame.samples.buffer).toString("base64"),
    png: png.toString("base64"),
    expected: { neutral, graded },
  });
}

// Display-referred stills graded in ACEScct: the float64 reference.
const STILLS = ["chart-24", "hue-sweep", "gray-ramp-256"];
const stills = await loadCg0Stills(STILLS);
const DISPLAY_GRADE = { gainMaster: 1.25, saturation: 1.3, contrast: 1.15 };
const displayExpected = stills.map((still) => {
  const ops = [
    conversionOp("srgb", "acescct")!,
    primary(DISPLAY_GRADE),
    conversionOp("acescct", "srgb")!,
  ];
  const out: number[] = [];
  for (let i = 0; i < still.width * still.height; i++) {
    const a = still.rgba[i * 4 + 3]!;
    if (a !== 255) throw Error("CG0 stills used here are opaque");
    let v: Rgb = [0, 1, 2].map((c) => still.rgba[i * 4 + c]! / 255) as never;
    for (const op of ops) v = op.apply(v);
    out.push(...v.map(quantizeGrade), 255);
  }
  return out;
});

const { page, close } = await openColorGradingPage();
try {
  const result = await page.evaluate(
    async ({ ramps, stills, grade, displayGrade, displayExpected }) => {
      const m = (await import(
        String("/packages/renderer-core/src/index.ts")
      )) as typeof Render;
      const sf = (await import(
        String("/packages/renderer-core/src/composition/render/scene-frames.ts")
      )) as typeof SceneFrames;
      type Backend = "canvas2d" | "webgl2";
      const bytes = (b64: string) =>
        Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const sha = (i: number) => `sha256:${String(i).padStart(64, "0")}`;
      const render = (
        width: number,
        height: number,
        assets: unknown[],
        layers: unknown[],
        backend: Backend,
        resources: {
          images?: Map<string, CanvasImageSource>;
          sceneFrames?: Map<string, SceneFrames.SceneFrame>;
        },
        managed = true,
      ) => {
        const composition = {
          schemaVersion: "composition-1",
          id: "cg7",
          width,
          height,
          fps: 24,
          frameCount: 2,
          background: "#000000",
          ...(managed ? { colorManagement: { workingSpace: "acescct" } } : {}),
          assets,
          layers,
        } as unknown as Composition;
        const preview = m.createCompositionPreview(
          document.createElement("canvas"),
          composition,
          {
            images: resources.images ?? new Map(),
            fonts: new Map(),
            ...(resources.sceneFrames
              ? { sceneFrames: resources.sceneFrames }
              : {}),
          },
          { backend },
        );
        try {
          preview.renderFrame(0);
          return [...new Uint8ClampedArray(preview.readPixels())];
        } finally {
          preview.dispose();
        }
      };
      const diff = (a: number[], b: number[]) => {
        let max = 0,
          count = 0;
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i]! - b[i]!);
          if (d) count++;
          max = Math.max(max, d);
        }
        return { max, count };
      };
      const out: Record<string, unknown> = {};
      // --- Source stage on CG0 10-bit ramps --------------------------------
      for (const ramp of ramps) {
        const raw = bytes(ramp.samples);
        const samples = new Uint16Array(raw.buffer);
        const decoded = await sf.decodeSceneFrame(
          bytes(ramp.png),
          ramp.asset.width,
          ramp.asset.height,
          ramp.name,
        );
        const decodeEqual = decoded.samples.every((v, i) => v === samples[i]);
        const frameId = "__media:ramp:0";
        const sceneFrames = new Map([[frameId, decoded]]);
        const asset = { ...ramp.asset, sha256: sha(1) };
        const layer = (effects: unknown[]) => ({
          id: "clip",
          type: "video",
          asset: "ramp",
          size: [ramp.asset.width, ramp.asset.height],
          fit: "stretch",
          transform: { anchor: [0, 0], position: [0, 0] },
          effects,
        });
        const graded = [{ id: "g", effect: "grade.primary", params: grade }];
        const cases: Record<string, unknown> = { decodeEqual };
        for (const [label, effects, want] of [
          ["neutral", [], ramp.expected.neutral],
          ["graded", graded, ramp.expected.graded],
        ] as const) {
          const got = {} as Record<Backend, number[]>;
          for (const backend of ["canvas2d", "webgl2"] as const)
            got[backend] = render(
              ramp.asset.width,
              ramp.asset.height,
              [asset],
              [layer(effects as unknown[])],
              backend,
              { sceneFrames },
            );
          cases[label] = {
            canvasVsReference: diff(got.canvas2d, want as number[]),
            webglVsCanvas: diff(got.webgl2, got.canvas2d),
            repeat: diff(
              got.webgl2,
              render(
                ramp.asset.width,
                ramp.asset.height,
                [asset],
                [layer(effects as unknown[])],
                "webgl2",
                { sceneFrames },
              ),
            ),
          };
        }
        out[ramp.name] = cases;
      }
      // --- Display-referred stills graded in ACEScct -------------------------
      const canvasOf = (still: (typeof stills)[number]) => {
        const canvas = document.createElement("canvas");
        canvas.width = still.width;
        canvas.height = still.height;
        canvas
          .getContext("2d")!
          .putImageData(
            new ImageData(
              Uint8ClampedArray.from(still.rgba),
              still.width,
              still.height,
            ),
            0,
            0,
          );
        return canvas;
      };
      const display: Record<string, unknown> = {};
      for (const [index, still] of stills.entries()) {
        const images = new Map([[still.id, canvasOf(still)]]);
        const asset = {
          id: still.id,
          type: "image",
          path: `${still.id}.png`,
          sha256: sha(2),
          width: still.width,
          height: still.height,
        };
        const layer = (effects: unknown[]) => ({
          id: "still",
          type: "image",
          sources: [{ asset: still.id }],
          size: [still.width, still.height],
          fit: "stretch",
          transform: { anchor: [0, 0], position: [0, 0] },
          effects,
        });
        const grade = [
          { id: "g", effect: "grade.primary", params: displayGrade },
        ];
        const neutral = [
          { id: "g", effect: "grade.primary", params: { gainMaster: 1 } },
        ];
        const got = {} as Record<Backend, number[]>;
        for (const backend of ["canvas2d", "webgl2"] as const)
          got[backend] = render(
            still.width,
            still.height,
            [asset],
            [layer(grade)],
            backend,
            { images },
          );
        const repeat = render(
          still.width,
          still.height,
          [asset],
          [layer(grade)],
          "webgl2",
          { images },
        );
        const legacyPlain = render(
          still.width,
          still.height,
          [asset],
          [layer([])],
          "canvas2d",
          { images },
          false,
        );
        display[still.id] = {
          canvasVsReference: diff(got.canvas2d, displayExpected[index]!),
          webglVsReference: diff(got.webgl2, displayExpected[index]!),
          repeat: diff(got.webgl2, repeat),
          // A neutral grade and no grade in a managed composition both equal
          // the legacy render (the layer stays display-referred).
          neutralVsLegacy: Object.fromEntries(
            (["canvas2d", "webgl2"] as const).map((backend) => [
              backend,
              diff(
                render(
                  still.width,
                  still.height,
                  [asset],
                  [layer(neutral)],
                  backend,
                  { images },
                ),
                legacyPlain,
              ),
            ]),
          ),
          plainVsLegacy: diff(
            render(
              still.width,
              still.height,
              [asset],
              [layer([])],
              "canvas2d",
              { images },
            ),
            legacyPlain,
          ),
        };
      }
      out.display = display;
      // --- Compositing rule: a solid over a managed video ---------------------
      const ramp = ramps[0]!;
      const sceneFrames = new Map([
        [
          "__media:ramp:0",
          await sf.decodeSceneFrame(
            bytes(ramp.png),
            ramp.asset.width,
            ramp.asset.height,
            ramp.name,
          ),
        ],
      ]);
      const solid = {
        id: "bar",
        type: "solid",
        size: [300, 8],
        color: "#d0602a",
        transform: { anchor: [0, 0], position: [100, 4], opacity: 0.6 },
      };
      const clip = {
        id: "clip",
        type: "video",
        asset: "ramp",
        size: [ramp.asset.width, ramp.asset.height],
        fit: "stretch",
        transform: { anchor: [0, 0], position: [0, 0] },
      };
      const asset = { ...ramp.asset, sha256: sha(1) };
      const both = render(
        ramp.asset.width,
        ramp.asset.height,
        [asset],
        [solid, clip],
        "canvas2d",
        { sceneFrames },
      );
      // Expected: the managed video's display pixels with the solid over
      // them as a legacy composition draws it (the video as a still image).
      const videoCanvas = document.createElement("canvas");
      videoCanvas.width = ramp.asset.width;
      videoCanvas.height = ramp.asset.height;
      videoCanvas
        .getContext("2d")!
        .putImageData(
          new ImageData(
            Uint8ClampedArray.from(ramp.expected.neutral),
            ramp.asset.width,
            ramp.asset.height,
          ),
          0,
          0,
        );
      const legacy = render(
        ramp.asset.width,
        ramp.asset.height,
        [
          {
            id: "still",
            type: "image",
            path: "still.png",
            sha256: sha(3),
            width: ramp.asset.width,
            height: ramp.asset.height,
          },
        ],
        [
          solid,
          {
            id: "clip",
            type: "image",
            sources: [{ asset: "still" }],
            size: clip.size,
            fit: "stretch",
            transform: clip.transform,
          },
        ],
        "canvas2d",
        { images: new Map([["still", videoCanvas]]) },
        false,
      );
      out.compositing = diff(both, legacy);
      return out;
    },
    {
      ramps,
      stills,
      grade: GRADE,
      displayGrade: DISPLAY_GRADE,
      displayExpected,
    },
  );
  await mkdir(join(root, "research/color-grading-cg7"), { recursive: true });
  await writeFile(
    join(root, "research/color-grading-cg7/browser-results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  type D = { max: number; count: number };
  type RampCase = { canvasVsReference: D; webglVsCanvas: D; repeat: D };
  for (const ramp of RAMPS) {
    const r = result[ramp[0]] as Record<string, RampCase> & {
      decodeEqual: boolean;
    };
    assert.equal(r.decodeEqual, true, `${ramp[0]} page decode`);
    for (const label of ["neutral", "graded"]) {
      assert.equal(r[label]!.canvasVsReference.max, 0, `${ramp[0]} ${label}`);
      assert.equal(r[label]!.webglVsCanvas.max, 0, `${ramp[0]} ${label} gl`);
      assert.equal(r[label]!.repeat.max, 0, `${ramp[0]} ${label} repeat`);
    }
  }
  const display = result.display as Record<
    string,
    {
      canvasVsReference: D;
      webglVsReference: D;
      repeat: D;
      neutralVsLegacy: Record<string, D>;
      plainVsLegacy: D;
    }
  >;
  for (const [id, r] of Object.entries(display)) {
    assert.equal(r.canvasVsReference.max, 0, `${id} canvas`);
    assert.ok(r.webglVsReference.max <= 1, `${id} webgl`);
    assert.equal(r.repeat.max, 0, `${id} repeat`);
    assert.equal(r.neutralVsLegacy.canvas2d!.max, 0, `${id} neutral canvas`);
    assert.equal(r.neutralVsLegacy.webgl2!.max, 0, `${id} neutral webgl`);
    assert.equal(r.plainVsLegacy.max, 0, `${id} plain`);
  }
  assert.equal((result.compositing as D).max, 0, "compositing rule");

  // --- Export: a color-managed composition through the 8-bit sRGB output --
  const ramp = ramps[0]!;
  const exportDir = join(work, "export");
  await mkdir(exportDir, { recursive: true });
  await copyFile(
    join(cg0, `ramps/${ramp.name}-10bit.mkv`),
    join(exportDir, ramp.asset.path),
  );
  const exported = {
    schemaVersion: "composition-1",
    id: "cg7-export",
    width: ramp.asset.width,
    height: ramp.asset.height,
    fps: 24,
    frameCount: 1,
    background: "#000000",
    colorManagement: { workingSpace: "acescct" },
    assets: [ramp.asset],
    layers: [
      {
        id: "clip",
        type: "video",
        asset: "ramp",
        size: [ramp.asset.width, ramp.asset.height],
        fit: "stretch",
        transform: { anchor: [0, 0], position: [0, 0] },
        effects: [{ id: "g", effect: "grade.primary", params: GRADE }],
      },
    ],
  };
  const exportPath = join(exportDir, "managed.json");
  await writeFile(exportPath, JSON.stringify(exported));
  const exports: Record<string, { max: number; count: number }> = {};
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const outputPath = join(exportDir, `${backend}.%06d.png`);
    await renderComposition({
      compositionPath: exportPath,
      outputPath,
      backend,
      cacheDirectory: join(work, "export-cache"),
      format: "png8",
    });
    const frame = decodeCompositionRgbaPng(
      await readFile(outputPath.replace("%06d", "000000")),
    );
    let max = 0,
      count = 0;
    frame.rgba.forEach((v, i) => {
      const d = Math.abs(v - ramp.expected.graded[i]!);
      if (d) count++;
      max = Math.max(max, d);
    });
    exports[backend] = { max, count };
  }
  await writeFile(
    join(root, "research/color-grading-cg7/browser-results.json"),
    JSON.stringify({ ...result, export: exports }, null, 2) + "\n",
  );
  assert.equal(exports.canvas2d!.max, 0, "canvas export");
  assert.equal(exports.webgl2!.max, 0, "webgl export");
  console.log("CG7 browser group passed");
} finally {
  await close();
  await rm(work, { recursive: true, force: true });
}
