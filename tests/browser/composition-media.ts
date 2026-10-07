import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { prepareCompositionVisualMedia } from "@still-shift/animation-engine";
import type {
  Composition,
  CompositionPreparedMedia,
} from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/composition/render/index.ts";
import { verifyNativeMediaExports } from "./composition-media-exports.ts";
import { verifyNativeAudioAuthoring } from "./composition-audio-authoring.ts";
import { verifyNativeMediaAuthoring } from "./composition-media-authoring.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";
const root = resolve(import.meta.dirname, "../..");
const directory = await mkdtemp(join(tmpdir(), "ce13-browser-media-"));
const hash = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const colors = [
  [255, 0, 0, 128],
  [0, 255, 0, 255],
  [255, 255, 255, 255],
];
const hashes: string[] = [];
for (let frame = 0; frame < 3; frame++) {
  const rgba = Buffer.alloc(64 * 32 * 4);
  for (let pixel = 0; pixel < 64 * 32; pixel++)
    rgba.set(colors[frame]!, pixel * 4);
  const bytes = mediaRgbaPng(64, 32, rgba, [
    mediaPngChunk("sRGB", Buffer.from([0])),
  ]);
  hashes.push(hash(bytes));
  await writeFile(join(directory, `frame_${frame}.png`), bytes);
}
const manifestBytes = Buffer.from(
  JSON.stringify({ schemaVersion: "composition-sequence-1", frames: hashes }),
);
await writeFile(join(directory, "manifest.json"), manifestBytes);
const comp: Composition = {
  schemaVersion: "composition-1",
  id: "native-media",
  width: 128,
  height: 96,
  fps: 24,
  frameCount: 6,
  background: "#0000ff",
  mediaLimits: {
    decodedFrameBytes: 64 * 32 * 4 * 2,
    decodedTextureBytes: 32768,
  },
  assets: [
    {
      id: "clip",
      type: "sequence",
      path: join(directory, "frame_%01d.png"),
      manifestPath: join(directory, "manifest.json"),
      sha256: hash(manifestBytes),
      firstFrame: 0,
      width: 64,
      height: 32,
      frameCount: 3,
      frameRate: { numerator: 12, denominator: 1 },
      color: {
        primaries: "bt709",
        transfer: "iec61966-2-1",
        matrix: "gbr",
        range: "pc",
      },
    },
  ],
  layers: [
    {
      id: "picture",
      type: "sequence",
      asset: "clip",
      frameBlending: "linear",
      transform: { position: [12, 16] },
    },
  ],
};
const decoded = await prepareCompositionVisualMedia({
  asset: comp.assets[0] as Extract<
    (typeof comp.assets)[number],
    { type: "sequence" }
  >,
  sourceDirectory: directory,
  cacheDirectory: join(directory, "cache"),
  ordinals: [0, 1, 2],
});
const prepared: CompositionPreparedMedia = {
  schemaVersion: "composition-prepared-media-1",
  decoderVersion: decoded.decoderVersion,
  ffmpegIdentities: [decoded.ffmpegIdentity],
  frames: decoded.frames.map((frame) => ({
    ...frame,
    asset: decoded.asset,
    sourceHash: decoded.sourceHash,
  })),
};
const capturedPaths = { ...decoded.assetPaths };
const server = await createServer({
  root,
  configFile: false,
  cacheDir: join(directory, "vite"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "captured-native-frames",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url ?? "/", "http://localhost");
          if (url.pathname !== "/native-frame") return next();
          const path = capturedPaths[url.searchParams.get("id") ?? ""];
          if (!path) {
            response.statusCode = 404;
            response.end();
            return;
          }
          void readFile(path).then((bytes) => {
            response.setHeader("Content-Type", "image/png");
            response.setHeader("Content-Length", bytes.length);
            response.end(bytes);
          });
        });
      },
    },
  ],
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const proof = await page.evaluate(
    async ({ compositionJson, preparedJson }) => {
      const comp = JSON.parse(compositionJson) as Composition;
      const prepared = JSON.parse(preparedJson) as CompositionPreparedMedia;
      const moduleUrl =
        "/packages/renderer-core/src/composition/render/index.ts";
      const m = (await import(moduleUrl)) as typeof Render;
      const assetUrl = (id: string) =>
        "/native-frame?id=" + encodeURIComponent(id);
      const cases: unknown[] = [];
      for (const colorSpace of ["srgb", "linear-srgb"] as const)
        for (const backend of ["canvas2d", "webgl2"] as const) {
          const document = { ...comp, colorSpace };
          const resources = await m.loadCompositionResources(
            document,
            assetUrl,
            { preparedMedia: prepared },
          );
          const canvas = window.document.createElement("canvas");
          const preview = m.createCompositionPreview(
            canvas,
            document,
            resources,
            { backend },
          );
          let premature = "";
          try {
            preview.renderFrame(0);
          } catch (error) {
            premature = String(error);
          }
          if (!premature.includes("Prepare"))
            throw new Error("native draw did not require readiness");
          const pixels: number[][] = [];
          const frameHashes: string[] = [];
          for (const frame of [0, 1, 3, 5, 1, 0]) {
            await preview.prepareFrame(frame);
            preview.renderFrame(frame);
            const digest = await crypto.subtle.digest(
              "SHA-256",
              new Uint8Array(preview.readPixels()).buffer,
            );
            frameHashes.push(
              Array.from(new Uint8Array(digest), (value) =>
                value.toString(16).padStart(2, "0"),
              ).join(""),
            );
            pixels.push(
              Array.from(
                preview
                  .readPixels()
                  .slice(
                    (25 * comp.width + 25) * 4,
                    (25 * comp.width + 25) * 4 + 4,
                  ),
              ),
            );
          }
          const stats = resources.media!.stats();
          preview.dispose();
          if (resources.media!.stats().decodedBytes !== 0)
            throw new Error("disposed native bitmaps retained");
          cases.push({ colorSpace, backend, pixels, frameHashes, stats });
        }
      // Scaling and finite echo use the same captured originals; compare every actual pixel.
      const compare: unknown[] = [];
      for (const colorSpace of ["srgb", "linear-srgb"] as const) {
        const document = structuredClone(comp);
        document.colorSpace = colorSpace;
        document.mediaLimits!.decodedFrameBytes = 3 * 64 * 32 * 4;
        document.layers[0]!.transform!.scale = [1.25, 0.75];
        document.layers[0]!.effects = [
          {
            id: "echo",
            effect: "time.echo",
            params: { count: 2, spacing: 1, decay: 0.5 },
          },
        ];
        const frames: number[][] = [];
        for (const backend of ["canvas2d", "webgl2"] as const) {
          const resources = await m.loadCompositionResources(
            document,
            assetUrl,
            { preparedMedia: prepared },
          );
          const preview = m.createCompositionPreview(
            window.document.createElement("canvas"),
            document,
            resources,
            { backend },
          );
          await preview.prepareFrame(3);
          preview.renderFrame(3);
          frames.push(Array.from(preview.readPixels()));
          preview.dispose();
        }
        let maxDelta = 0,
          differing = 0;
        for (let i = 0; i < frames[0]!.length; i++) {
          const delta = Math.abs(frames[0]![i]! - frames[1]![i]!);
          maxDelta = Math.max(maxDelta, delta);
          if (delta) differing++;
        }
        compare.push({ colorSpace, maxDelta, differing });
      }
      const low = structuredClone(comp);
      low.mediaLimits!.decodedFrameBytes = 64 * 32 * 4;
      const resources = await m.loadCompositionResources(low, assetUrl, {
        preparedMedia: prepared,
      });
      let pairBudget = "";
      try {
        await resources.media!.prepareFrame(1);
      } catch (error) {
        pairBudget = String(error);
      }
      resources.media!.dispose();
      const gpuResources = await m.loadCompositionResources(comp, assetUrl, {
        preparedMedia: prepared,
      });
      await gpuResources.media!.prepareFrame(1);
      const canvas = window.document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 96;
      const gpu = m.createWebgl2Backend(canvas, {
        images: {
          images: gpuResources.images,
          ...(gpuResources.pngImages
            ? { pngImages: gpuResources.pngImages }
            : {}),
          sizes: new Map(
            prepared.frames.map((frame) => [
              frame.id,
              [frame.width, frame.height] as const,
            ]),
          ),
        },
        drawText: () => {},
        nativeImageByteLimit: 32768,
      });
      const content: Render.ImageContent = {
        type: "image",
        width: 64,
        height: 32,
        fit: "contain",
        rasterize: "draw",
        sources: [{ asset: "__media:clip:0" }, { asset: "__media:clip:1" }],
        state: 1,
        stateFrom: 0,
        stateMix: 0.5,
        media: {
          asset: "clip",
          sourceHash: comp.assets[0]!.sha256,
          pair: { first: 0, second: 1, mix: 0.5 },
        },
      };
      let peakGpu = 0;
      for (let iteration = 0; iteration < 12; iteration++) {
        gpu.clear(gpu.target, [0, 0, 1, 1]);
        gpu.drawImage(
          gpu.target,
          { ...content, sources: [...content.sources] },
          [1, 0, 0, 1, 12, 16],
          1,
          "normal",
          [],
        );
        peakGpu = Math.max(peakGpu, gpu.nativeImageAllocated);
        if (gpu.nativeImageAllocated > 32768)
          throw new Error("native GPU budget exceeded");
      }
      gpu.dispose();
      const disposedGpu = gpu.nativeImageAllocated;
      gpuResources.media!.dispose();
      const rejectResources = await m.loadCompositionResources(comp, assetUrl, {
        preparedMedia: prepared,
      });
      await rejectResources.media!.prepareFrame(1);
      const rejectCanvas = window.document.createElement("canvas");
      rejectCanvas.width = 128;
      rejectCanvas.height = 96;
      const small = m.createWebgl2Backend(rejectCanvas, {
        images: {
          images: rejectResources.images,
          ...(rejectResources.pngImages
            ? { pngImages: rejectResources.pngImages }
            : {}),
          sizes: new Map(
            prepared.frames.map((frame) => [
              frame.id,
              [frame.width, frame.height] as const,
            ]),
          ),
        },
        drawText: () => {},
        nativeImageByteLimit: 4,
      });
      let gpuBudget = "";
      try {
        small.drawImage(
          small.target,
          content,
          [1, 0, 0, 1, 12, 16],
          1,
          "normal",
          [],
        );
      } catch (error) {
        gpuBudget = String(error);
      }
      small.dispose();
      rejectResources.media!.dispose();
      return {
        cases,
        compare,
        pairBudget,
        gpu: { peakGpu, disposedGpu, gpuBudget },
      };
    },
    {
      compositionJson: JSON.stringify(comp),
      preparedJson: JSON.stringify(prepared),
    },
  );
  for (const item of proof.cases as {
    colorSpace: string;
    backend: string;
    pixels: number[][];
    frameHashes: string[];
    stats: { peakDecodedBytes: number; evictions: number };
  }[]) {
    assert.ok(item.stats.peakDecodedBytes <= 64 * 32 * 4 * 2);
    assert.ok(item.stats.evictions > 0);
    assert.deepEqual(item.pixels[1], item.pixels[4]);
    assert.equal(
      item.frameHashes[0],
      item.frameHashes[5],
      "held boundary pixels must remain independent of seek/cache state",
    );
    if (item.colorSpace === "srgb")
      for (let channel = 0; channel < 4; channel++)
        assert.ok(
          Math.abs(item.pixels[1]![channel]! - [64, 128, 64, 255][channel]!) <=
            2,
          `${item.backend} half-alpha pair must composite once: ${item.pixels[1]}`,
        );
    else {
      // Independent transfer calculation for the premultiplied sRGB pair over blue.
      const alpha = 192 / 255;
      const decode = (v: number) =>
        v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      const encode = (v: number) =>
        Math.round(
          255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055),
        );
      const expected = [
        encode(decode(85 / 255) * alpha),
        encode(decode(170 / 255) * alpha),
        encode(1 - alpha),
        255,
      ];
      for (let channel = 0; channel < 4; channel++)
        assert.ok(
          Math.abs(item.pixels[1]![channel]! - expected[channel]!) <= 3,
          `${item.backend} linear pair: ${item.pixels[1]} vs ${expected}`,
        );
    }
  }
  for (const item of proof.compare as {
    colorSpace: string;
    maxDelta: number;
  }[])
    assert.ok(
      item.maxDelta <= 2,
      `scaled/history backend parity ${item.colorSpace}: ${item.maxDelta}`,
    );
  assert.match(proof.pairBudget, /budget/);
  assert.match(proof.gpu.gpuBudget, /GPU/);
  assert.equal(proof.gpu.disposedGpu, 0);
  assert.ok(proof.gpu.peakGpu > 0 && proof.gpu.peakGpu <= 32768);
  const exports = await verifyNativeMediaExports(
    page,
    directory,
    comp,
    capturedPaths,
  );
  const authoring = await verifyNativeMediaAuthoring(
    browser,
    root,
    directory,
    comp,
  );
  const audioAuthoring = await verifyNativeAudioAuthoring(
    browser,
    root,
    directory,
  );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        preparedKey: decoded.key,
        ...proof,
        exports,
        authoring,
        audioAuthoring,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
