/**
 * CG7 memory group: a generated 4K UHD 10-bit clip (FFmpeg testsrc2, FFV1
 * 4:2:2, deterministic and license-free, made in a temporary directory)
 * declared as S-Log3 in a color-managed composition, through the real
 * loader: preparation into the 16-bit scene cache, fetch and 16-bit decode in
 * the page, the source stage and both backends.
 *
 * Checks (docs/color-grading-cg7-decisions.md §5): a blended pair of 4K
 * frames is 126.6 MiB of live samples, within the 128 MiB default
 * `decodedFrameBytes`; the drawn RGBA8 raster (31.6 MiB) is within
 * `decodedTextureBytes`; a 100 MiB budget refuses the pair before any frame
 * is fetched. Canvas and WebGL2 agree byte for byte.
 *
 * Results go to research/color-grading-cg7/memory-results.json.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type {
  Composition,
  CompositionAsset,
  CompositionPreparedMedia,
} from "@still-shift/scene-contract";
import { COMPOSITION_MEDIA_SCENE_DECODER_VERSION } from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import { prepareCompositionVisualMedia } from "../../packages/animation-engine/src/composition-media-cache.ts";
import {
  compositionMediaChecksum,
  probeCompositionVideo,
} from "../../packages/animation-engine/src/composition-media-probe.ts";
import { repositoryRoot as root } from "../helpers/color-grading-browser.ts";

const MiB = 1024 * 1024;
const directory = await mkdtemp(join(tmpdir(), "cg7-memory-"));
const clip = join(directory, "uhd-10bit.mkv");
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=3840x2160:rate=24",
  "-frames:v",
  "3",
  "-pix_fmt",
  "yuv422p10le",
  "-color_range",
  "tv",
  "-colorspace",
  "bt709",
  "-c:v",
  "ffv1",
  clip,
]);
const probe = await probeCompositionVideo(clip, { colorManaged: true });
type Video = Extract<CompositionAsset, { type: "video" }>;
const asset: Video = {
  id: "uhd",
  type: "video",
  path: "uhd-10bit.mkv",
  sha256: await compositionMediaChecksum(clip),
  width: probe.width,
  height: probe.height,
  frameCount: probe.frameCount,
  frameRate: probe.frameRate,
  color: { ...probe.color, encoding: "sony-slog3-sgamut3" },
};
const started = performance.now();
const decoded = await prepareCompositionVisualMedia({
  asset,
  sourceDirectory: directory,
  cacheDirectory: join(directory, "cache"),
  ordinals: [0, 1],
  scene: true,
});
const prepareMs = Math.round(performance.now() - started);
const prepared: CompositionPreparedMedia = {
  schemaVersion: "composition-prepared-media-1",
  decoderVersion: COMPOSITION_MEDIA_SCENE_DECODER_VERSION,
  ffmpegIdentities: [decoded.ffmpegIdentity],
  frames: decoded.frames.map((frame) => ({
    ...frame,
    asset: decoded.asset,
    sourceHash: decoded.sourceHash,
  })),
};
// 48 fps over a 24 fps source: composition frame 1 needs source 0 and 1.
const composition = (limits?: object): Composition =>
  ({
    schemaVersion: "composition-1",
    id: "uhd",
    width: 3840,
    height: 2160,
    fps: 48,
    frameCount: 2,
    colorManagement: { workingSpace: "acescct" },
    ...(limits ? { mediaLimits: limits } : {}),
    assets: [asset],
    layers: [
      {
        id: "clip",
        type: "video",
        asset: "uhd",
        size: [3840, 2160],
        fit: "stretch",
        frameBlending: "linear",
        transform: { anchor: [0, 0], position: [0, 0] },
        effects: [
          {
            id: "grade",
            effect: "grade.primary",
            params: { gainMaster: 1.3, saturation: 1.1 },
          },
        ],
      },
    ],
  }) as unknown as Composition;
let served = 0;
const server = await createServer({
  root,
  configFile: false,
  cacheDir: join(directory, "vite"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "scene-frames",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url ?? "/", "http://localhost");
          if (url.pathname !== "/scene-frame") return next();
          const path = decoded.assetPaths[url.searchParams.get("id") ?? ""];
          if (!path) {
            response.statusCode = 404;
            response.end();
            return;
          }
          served++;
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
  const run = (comp: Composition, backend: "canvas2d" | "webgl2") =>
    page.evaluate(
      async ({ compositionJson, preparedJson, backend }) => {
        const m = (await import(
          String("/packages/renderer-core/src/index.ts")
        )) as typeof Render;
        const comp = JSON.parse(compositionJson) as Composition;
        const prepared = JSON.parse(preparedJson) as CompositionPreparedMedia;
        const assetUrl = (id: string) =>
          "/scene-frame?id=" + encodeURIComponent(id);
        const resources = await m.loadCompositionResources(comp, assetUrl, {
          preparedMedia: prepared,
        });
        const preview = m.createCompositionPreview(
          document.createElement("canvas"),
          comp,
          resources,
          { backend },
        );
        try {
          const t0 = performance.now();
          await preview.prepareFrame(1);
          const t1 = performance.now();
          preview.renderFrame(1);
          const t2 = performance.now();
          const pixels = new Uint8Array(preview.readPixels());
          const digest = await crypto.subtle.digest("SHA-256", pixels);
          return {
            ok: true as const,
            stats: resources.media!.stats(),
            prepareMs: Math.round(t1 - t0),
            renderMs: Math.round(t2 - t1),
            sha256: [...new Uint8Array(digest)]
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
          };
        } catch (error) {
          return {
            ok: false as const,
            error: String(
              (error as { diagnostics?: { code: string }[] }).diagnostics?.[0]
                ?.code ?? error,
            ),
          };
        } finally {
          preview.dispose();
        }
      },
      {
        compositionJson: JSON.stringify(comp),
        preparedJson: JSON.stringify(prepared),
        backend,
      },
    );
  const canvas = await run(composition(), "canvas2d");
  const webgl = await run(composition(), "webgl2");
  const servedBefore = served;
  const over = await run(
    composition({ decodedFrameBytes: 100 * MiB }),
    "webgl2",
  );
  const servedOver = served - servedBefore;
  const frameBytes = await Promise.all(
    Object.values(decoded.assetPaths).map(
      async (path) => (await stat(path)).size,
    ),
  );
  const result = {
    fixture: {
      generator:
        "ffmpeg lavfi testsrc2=size=3840x2160:rate=24, 3 frames, yuv422p10le, FFV1, tagged bt709 matrix / tv range, no transfer; declared sony-slog3-sgamut3",
      width: asset.width,
      height: asset.height,
    },
    node: {
      prepareMs,
      cacheFrameBytes: frameBytes,
      cacheBytes: decoded.cacheBytes,
    },
    canvas2d: canvas,
    webgl2: webgl,
    overBudget: { ...over, framesFetched: servedOver },
    limits: {
      decodedFrameBytes: 128 * MiB,
      livePairBytes: 3840 * 2160 * 8 * 2,
      decodedTextureBytes: 128 * MiB,
      rasterBytes: 3840 * 2160 * 4,
    },
  };
  await mkdir(join(root, "research/color-grading-cg7"), { recursive: true });
  await writeFile(
    join(root, "research/color-grading-cg7/memory-results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  assert.equal(canvas.ok, true, JSON.stringify(canvas));
  assert.equal(webgl.ok, true, JSON.stringify(webgl));
  if (!canvas.ok || !webgl.ok) throw Error("unreachable");
  assert.equal(webgl.sha256, canvas.sha256, "backends agree");
  assert.equal(webgl.stats.peakDecodedBytes, 3840 * 2160 * 8 * 2);
  assert.ok(webgl.stats.peakDecodedBytes <= 128 * MiB);
  assert.equal(over.ok, false);
  assert.equal(over.ok === false && over.error, "comp-media-limit");
  assert.equal(servedOver, 0, "refused before any fetch");
  console.log("CG7 memory group passed", JSON.stringify(result.webgl2));
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
