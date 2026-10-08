import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import {
  COMPOSITION_LIMITS,
  CommerceSceneSchema,
  StorySceneSchema,
  type CommerceScene,
  type StoryScene,
} from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Oracle from "../helpers/legacy-illustrated-oracle.ts";

type Preview = ReturnType<typeof Render.createIllustratedPreview>;
type Probe = {
  preview: Preview;
  legacy: ReturnType<typeof Oracle.createIllustratedPreview>;
  canvas: HTMLCanvasElement;
  oldCanvas: HTMLCanvasElement;
  scene: ReturnType<typeof Render.compilePreparedScene>;
  images: Awaited<ReturnType<typeof Render.loadIllustratedImages>>;
  render: typeof Render;
  surfaces: { generation: number; canvas: WeakRef<HTMLCanvasElement> }[];
  setGeneration(frame: number): void;
  setTracking(enabled: boolean): void;
  restoreCreateElement(): void;
  hashes: Map<number, string>;
};
declare global {
  interface Window {
    longTimelineProbe: Probe;
    captureLongTimelineRaw(
      run: number,
      frame: number,
      base64: string,
    ): Promise<void>;
  }
}

const root = resolve(import.meta.dirname, "../..");
const directory = await mkdtemp(join(tmpdir(), "pr47-family-timelines-"));
const commercePath = resolve(
  root,
  "benchmarks/fixtures/ecommerce-motion/atoms/drift.json",
);
const original = CommerceSceneSchema.parse(
  JSON.parse(await readFile(commercePath, "utf8")),
);
const base = {
  x: 0,
  y: 0,
  width: 900,
  height: 450,
  opacity: 1,
  rotation: 0,
  origin: [0.5, 0.5],
};
const story = StorySceneSchema.parse({
  schemaVersion: "story-scene-1",
  title: "Long story source clocks",
  width: 1920,
  height: 1080,
  fps: 30,
  frameCount: 2101,
  background: "#ffffff",
  assets: original.assets,
  fonts: original.fonts,
  motionModel: "curves-1",
  motionGrammar: "v2",
  nodes: [
    { ...base, id: "parent", type: "group", x: 400, y: 240, clip: false },
    {
      ...base,
      id: "box",
      parent: "parent",
      type: "rect",
      x: 40,
      y: 40,
      width: 560,
      height: 100,
      fill: "#e8dfc9",
      radius: 8,
    },
    {
      ...base,
      id: "route",
      parent: "parent",
      type: "path",
      x: 40,
      y: 180,
      width: 0,
      height: 0,
      points: [
        [0, 0],
        [560, 0],
      ],
      stroke: "#211f1b",
      lineWidth: 4,
    },
    {
      ...base,
      id: "caption",
      parent: "parent",
      type: "text",
      x: 40,
      y: 280,
      width: 0,
      height: 0,
      text: "Late source clock",
      fontSize: 56,
      color: "#211f1b",
      fontAsset: original.fonts[0]!.id,
      font: "sans-serif",
      weight: "normal",
      align: "left",
    },
  ],
  recipe: {
    preset: "generic",
    moves: [
      {
        node: "parent",
        window: { start: 0, end: 2100, easing: "linear" },
        to: { x: 540, rotation: 5, scaleX: 1.05, scaleY: 0.95 },
      },
      {
        node: "route",
        window: { start: 1850, end: 2099, easing: "linear" },
        to: { reveal: 0.7 },
      },
      {
        node: "caption",
        window: { start: 1850, end: 2099, easing: "linear" },
        to: { reveal: 0.6 },
      },
    ],
  },
  camera: {
    keys: [
      { frame: 0, x: 960, y: 540, zoom: 1 },
      { frame: 2100, x: 980, y: 550, zoom: 1.02 },
    ],
    depth: { parent: 0.5 },
    cover: [],
  },
  flows: [
    {
      id: "clock-flow",
      path: "route",
      direction: 1,
      count: 2,
      shape: "dot",
      size: 4,
      color: "#e83333",
      window: { start: 1850, end: 2101 },
      speed: [
        { frame: 0, pxPerFrame: 2 },
        { frame: 1900, pxPerFrame: 3 },
      ],
    },
  ],
});
const commerce = CommerceSceneSchema.parse({
  ...original,
  frameCount: 2101,
  events: [
    {
      node: "product",
      property: "y",
      start: 0,
      end: 2100,
      to: 190,
      easing: "linear",
    },
  ],
  effects: [
    {
      type: "drift",
      target: "product",
      start: 0,
      end: 2100,
      cycles: 4,
      travelX: 4,
      tilt: 0.5,
    },
    { type: "motion-blur", shutterAngle: 180, samples: 8 },
    { type: "echo", target: "product", spacing: 3, count: 4, decay: 0.6 },
    { type: "grain", amount: 0.02, seed: 3 },
  ],
});
const inputs: { id: string; source: StoryScene | CommerceScene }[] = [
  { id: "story", source: story },
  { id: "commerce", source: commerce },
];
const server = await createServer({
  root,
  configFile: false,
  cacheDir: join(directory, "vite-cache"),
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const browser = await launchRenderBrowser();
const reports: unknown[] = [];
try {
  for (const { id, source } of inputs) {
    const urls = Object.fromEntries(
      [...source.assets, ...(source.fonts ?? [])].map((asset) => [
        asset.id,
        `/@fs${resolve(dirname(commercePath), asset.path)}`,
      ]),
    );
    const page = await browser.newPage();
    const session = await page.context().newCDPSession(page);
    const raw = new Map<string, string>();
    try {
      await page.exposeFunction(
        "captureLongTimelineRaw",
        async (run: number, frame: number, base64: string) => {
          const bytes = Buffer.from(base64, "base64");
          assert.equal(bytes.length, source.width * source.height * 4);
          await writeFile(join(directory, `${id}-${run}-${frame}.rgba`), bytes);
          raw.set(
            `${run}/${frame}`,
            createHash("sha256").update(bytes).digest("hex"),
          );
        },
      );
      await page.addInitScript("window.__name = (fn) => fn;");
      await page.goto(server.resolvedUrls!.local[0]!);
      const environment = await probeRenderEnvironment(page);
      assertPinnedRenderEnvironment(environment);
      const windows = await page.evaluate(
        async ({ source, urls }) => {
          const moduleUrl = "/packages/renderer-core/src/index.ts";
          const oracleUrl = "/tests/helpers/legacy-illustrated-oracle.ts";
          const render = (await import(moduleUrl)) as typeof Render;
          const oracle = (await import(oracleUrl)) as typeof Oracle;
          const scene = render.compilePreparedScene(source);
          const images = await render.loadIllustratedImages(
            scene,
            (id) => urls[id]!,
          );
          const canvas = document.createElement("canvas");
          const oldCanvas = document.createElement("canvas");
          const legacy = oracle.createIllustratedPreview(
            oldCanvas,
            scene,
            await oracle.loadIllustratedImages(scene, (id) => urls[id]!),
          );
          const surfaces: Probe["surfaces"] = [];
          let generation = 0;
          let tracking = true;
          const createElement = document.createElement.bind(document);
          document.createElement = ((
            tag: string,
            options?: ElementCreationOptions,
          ) => {
            const element = createElement(tag, options);
            if (tracking && element instanceof HTMLCanvasElement)
              surfaces.push({ generation, canvas: new WeakRef(element) });
            return element;
          }) as typeof document.createElement;
          const preview = render.createIllustratedPreview(
            canvas,
            scene,
            images,
          );
          tracking = false;
          if (preview.backend !== "canvas2d" || !preview.windows?.length)
            throw new Error(
              "Long family defaults must use bounded native composition documents",
            );
          for (const window of preview.windows) {
            if (window.composition.frameCount !== source.frameCount)
              throw new Error("A native window changed the source timeline");
            for (const layer of window.composition.layers)
              if ((layer.sampleTimes?.length ?? 0) > 2000)
                throw new Error(
                  "A native window exceeded the frozen sample bound",
                );
          }
          window.longTimelineProbe = {
            preview,
            legacy,
            canvas,
            oldCanvas,
            scene,
            images,
            render,
            surfaces,
            hashes: new Map(),
            setGeneration(value) {
              generation = value;
            },
            setTracking(value) {
              tracking = value;
            },
            restoreCreateElement() {
              document.createElement = createElement;
            },
          };
          return preview.windows.map(({ start, end }) => ({ start, end }));
        },
        { source, urls },
      );
      assert.ok(windows.length > 1);
      assert.equal(windows[0]!.start, 0);
      assert.equal(windows.at(-1)!.end, source.frameCount);
      const boundary = windows[1]!.start;
      const frames = [
        ...new Set([
          0,
          boundary - 1,
          boundary,
          boundary + 1,
          1850,
          1900,
          1999,
          2000,
          source.frameCount - 1,
        ]),
      ].sort((a, b) => a - b);
      const visits = [
        ...frames,
        ...frames.toReversed(),
        boundary,
        source.frameCount - 1,
        boundary - 1,
      ];
      let maxDelta = 0;
      let minPsnr = Infinity;
      for (const frame of visits) {
        const comparison = await page.evaluate(async (frame) => {
          const p = window.longTimelineProbe;
          const selected = p.preview.windows!.find(
            (window) => frame >= window.start && frame < window.end,
          )!;
          p.setGeneration(selected.start);
          p.setTracking(true);
          try {
            p.preview.renderFrame(frame);
          } finally {
            p.setTracking(false);
          }
          if (p.preview.composition !== selected.composition)
            throw new Error(
              `Frame ${frame} selected the wrong native document`,
            );
          p.legacy.renderFrame(frame);
          const actual = p.preview.readPixels();
          const reference = p.oldCanvas
            .getContext("2d")!
            .getImageData(0, 0, p.oldCanvas.width, p.oldCanvas.height).data;
          const comparison = p.render.compareFrames(
            reference,
            actual,
            p.canvas.width,
            p.canvas.height,
          );
          if (!p.render.meetsTier(comparison, "near"))
            throw new Error(
              `Frame ${frame}: delta ${comparison.maxChannelDelta}, PSNR ${comparison.psnr}`,
            );
          const hash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", new Uint8Array(actual)),
            ),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join("");
          const previous = p.hashes.get(frame);
          if (previous && previous !== hash)
            throw new Error(`Reverse seek changed raw frame ${frame}`);
          p.hashes.set(frame, hash);
          return comparison;
        }, frame);
        maxDelta = Math.max(maxDelta, comparison.maxChannelDelta);
        minPsnr = Math.min(minPsnr, comparison.psnr);
        await session.send("HeapProfiler.collectGarbage");
        const leaked = await page.evaluate((frame) => {
          const p = window.longTimelineProbe;
          const selected = p.preview.windows!.find(
            (window) => frame >= window.start && frame < window.end,
          )!;
          return p.surfaces.filter(({ generation, canvas }) => {
            const element = canvas.deref();
            return (
              generation !== selected.start &&
              element &&
              element.width === p.scene.width &&
              element.height === p.scene.height
            );
          }).length;
        }, frame);
        assert.equal(
          leaked,
          0,
          `${id}/${frame}: disposed window retained full-size canvases`,
        );
      }
      const exportFrames = [
        ...new Set([boundary - 1, boundary, 2000, source.frameCount - 1]),
      ];
      const hashes = await page.evaluate(async (frames) => {
        const p = window.longTimelineProbe;
        for (let run = 0; run < 2; run++) {
          const independentCanvas = document.createElement("canvas");
          const preview = p.render.createIllustratedPreview(
            independentCanvas,
            structuredClone(p.scene),
            p.images,
          );
          try {
            if (preview.windows!.at(-1)!.end !== p.scene.timeline.frameCount)
              throw new Error("Raw capture shortened the source timeline");
            for (const frame of frames) {
              preview.renderFrame(frame);
              const bytes = preview.readPixels();
              let binary = "";
              for (let offset = 0; offset < bytes.length; offset += 32768)
                binary += String.fromCharCode(
                  ...bytes.subarray(offset, offset + 32768),
                );
              await window.captureLongTimelineRaw(run, frame, btoa(binary));
            }
          } finally {
            preview.dispose();
          }
        }
        return Object.fromEntries(
          frames.map((frame) => [frame, p.hashes.get(frame)!]),
        );
      }, exportFrames);
      for (const frame of exportFrames) {
        assert.equal(
          raw.get(`0/${frame}`),
          hashes[frame],
          `${id}/${frame}: independent raw capture`,
        );
        assert.equal(
          raw.get(`1/${frame}`),
          hashes[frame],
          `${id}/${frame}: repeated raw capture`,
        );
      }
      await page.evaluate(() => {
        const p = window.longTimelineProbe;
        p.preview.dispose();
        p.preview.dispose();
        p.legacy.dispose();
        p.restoreCreateElement();
        try {
          p.preview.renderFrame(0);
        } catch (error) {
          if (error instanceof Error && error.message.includes("disposed"))
            return;
          throw error;
        }
        throw new Error("A disposed family preview still renders");
      });
      await session.send("HeapProfiler.collectGarbage");
      const retained = await page.evaluate(() => {
        const p = window.longTimelineProbe;
        return p.surfaces.filter(({ canvas }) => {
          const element = canvas.deref();
          return (
            element &&
            element.width === p.scene.width &&
            element.height === p.scene.height
          );
        }).length;
      });
      assert.equal(
        retained,
        0,
        `${id}: disposal retained full-size frame canvases`,
      );
      reports.push({
        id,
        sourceFrameCount: source.frameCount,
        windows,
        selectedFrames: frames,
        parityVisits: visits.length,
        maxDelta,
        minPsnr,
        independentRepeatedRawFrames: exportFrames.length,
        disposedWindowSurfaces: "released",
        environment,
      });
      console.log(
        `${id}: ${visits.length} selected forward/reverse comparisons, ${windows.length} native windows, delta ${maxDelta}; ${exportFrames.length} independent/repeated raw frames and disposal pass`,
      );
    } finally {
      await session.detach();
      await page.close();
    }
  }
  assert.equal(COMPOSITION_LIMITS.maxKeys, 2000);
  console.log(
    JSON.stringify(
      {
        scope:
          "Focused long-timeline regression; selected frames retain the full source timelines",
        reports,
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await browser.close();
  } finally {
    try {
      await server.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
