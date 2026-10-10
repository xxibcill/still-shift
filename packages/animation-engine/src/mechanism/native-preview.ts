import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import type { Browser } from "playwright";
import {
  AnimationEngineError,
  NativeObservedOutputFrameSchema,
  type Composition,
  type MechanismRouteSelection,
  type NativeObservedOutputFrame,
} from "@still-shift/scene-contract";
import {
  compositionNativePasses,
  resolveNative3DVariant,
  PassageError,
} from "@still-shift/renderer-core";
import type * as Renderer from "@still-shift/renderer-core";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { defaultBrowserProjectRoot } from "@still-shift/execution-runtime/browser";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { publishArtifacts } from "@still-shift/execution-runtime/publication";
import {
  validateNativeObservationPacket,
  type NativeObservationExpectedPass,
} from "@still-shift/execution-runtime/export";
import { assertNativeAppearanceCodeIdentity } from "../native3d-appearance-identity.ts";
import { tagCompositionSrgbPng } from "../composition-media-color.ts";
import {
  mechanismContentHash,
  mechanismHash,
  readMechanismEpisode,
  type LoadedMechanismEpisode,
} from "./io.ts";
import {
  prepareNativeMechanismEpisode,
  verifyNativePreparedEpisode,
  NATIVE_MECHANISM_PROFILE,
} from "./native-lifecycle.ts";
import {
  followPreparedMechanismRoute,
  mechanismRouteBackend,
} from "./route.ts";

export type NativeMechanismPreviewResult = {
  status: "previewed";
  projectHash: string;
  sourceFrame: number;
  shotId: string;
  outputDirectory: string;
  pngPath: string;
  pngSha256: string;
  pixelSha256: string;
  pixelByteLength: number;
  pixelEncoding: "rgba8-straight-top-first";
  receiptPath: string;
  backend: "webgl2";
  profile: typeof NATIVE_MECHANISM_PROFILE;
  routeSelection: MechanismRouteSelection;
  binding: {
    compositionSourceSha256: string;
    compositionSha256: string;
    preparedNativeSha256: string;
    appearanceCodeSha256: string;
    episodeSha256: string;
    geometrySha256: string;
    rigSha256: string;
    sourceFrame: number;
    routeSelection: MechanismRouteSelection;
    backend: "webgl2";
    profile: typeof NATIVE_MECHANISM_PROFILE;
  };
  observations: NativeObservedOutputFrame;
};
function fail(
  message: string,
  path: string,
  code = "comp-native3d-observation",
): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-native-preview",
    diagnosticCode: code,
    path,
  });
}

/** One current native composition frame and actual same-invocation observations; not a movie/closure proof. */
export async function previewNativeMechanismEpisode(
  loaded: LoadedMechanismEpisode,
  options: {
    outputDirectory: string;
    frame: number;
    signal?: AbortSignal;
    cacheDirectory?: string;
  },
  selection: MechanismRouteSelection,
): Promise<NativeMechanismPreviewResult> {
  options.signal?.throwIfAborted();
  const routeSelection = followPreparedMechanismRoute(
    loaded.episode,
    selection,
    "native3d",
  );
  mechanismRouteBackend(routeSelection);
  const shot = loaded.episode.shots.find(
    (item) =>
      options.frame >= item.startFrame &&
      options.frame < item.endFrameExclusive,
  );
  if (!shot || !Number.isInteger(options.frame))
    fail(
      "Preview frame must be an integer inside the authored episode",
      "frame",
      "comp-native3d-clock",
    );
  const outputDirectory = resolve(options.outputDirectory),
    preparedDirectory = join(outputDirectory, "prepared");
  await prepareNativeMechanismEpisode(
    loaded,
    { ...options, outputDirectory: preparedDirectory },
    routeSelection,
  );
  const { receipt, loadedComposition } = await verifyNativePreparedEpisode(
    loaded,
    preparedDirectory,
    {
      ...(options.signal ? { signal: options.signal } : {}),
      route: "native3d",
    },
  );
  const binding: NativeMechanismPreviewResult["binding"] = {
    compositionSourceSha256: receipt.compositionSourceSha256,
    compositionSha256: receipt.compositionSha256,
    preparedNativeSha256: receipt.preparedNativeSha256,
    appearanceCodeSha256: receipt.appearanceCodeSha256,
    episodeSha256: receipt.episodeSha256,
    geometrySha256: receipt.geometrySha256,
    rigSha256: receipt.rigSha256,
    sourceFrame: options.frame,
    routeSelection,
    backend: "webgl2",
    profile: NATIVE_MECHANISM_PROFILE,
  };
  const executionSha256 = mechanismContentHash(binding);
  const expected: NativeObservationExpectedPass[] = [
    ...compositionNativePasses(loadedComposition.composition, options.frame, {
      preparedNative3D: loadedComposition.native3D!,
      nativeObservationRequired: true,
    }),
  ].map((pass) => {
    const frame = pass.frame,
      source = resolveNative3DVariant(loadedComposition.native3D, frame).source;
    return {
      sampleFrame: pass.sampleFrame,
      frameKey: frame.frameKey,
      controller: frame.controller,
      scope: frame.scope,
      scopeFrame: frame.scopeFrame,
      sourceFrame: frame.sourceFrame,
      sourceSha256: frame.sourceSha256,
      effectiveSceneSha256: frame.effectiveSceneSha256,
      geometrySha256: frame.geometrySha256,
      appearanceCodeSha256: receipt.appearanceCodeSha256,
      viewport: [0, 0, pass.width, pass.height],
      parts: Object.fromEntries(
        source.parts.map((part) => [
          part.id,
          part.parent === undefined ? {} : { parent: part.parent },
        ]),
      ),
      anchors: Object.fromEntries(
        source.anchors.map((anchor) => [anchor.id, { part: anchor.part }]),
      ),
    };
  });
  if (!expected.length)
    fail(
      "The chosen episode frame has no active native physical pass",
      "composition.layers",
    );
  options.signal?.throwIfAborted();
  await mkdir(outputDirectory, { recursive: true });
  const release = await acquireArtifactLock(
    join(outputDirectory, ".preview.lock"),
    outputDirectory,
  );
  const suffix = `${String(options.frame).padStart(6, "0")}-${executionSha256.slice(7, 19)}`;
  const pngPath = join(outputDirectory, `preview-${suffix}.png`),
    receiptPath = `${pngPath}.json`;
  const stagedPng = `${pngPath}.pending-${randomUUID()}`,
    stagedReceipt = `${receiptPath}.pending-${randomUUID()}`;
  let temporary: string | undefined,
    server: ViteDevServer | undefined,
    browser: Browser | undefined;
  const abort = () => {
    void browser?.close().catch(() => {});
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    options.signal?.throwIfAborted();
    temporary = await mkdtemp(join(tmpdir(), "mechanism-native-preview-"));
    await writeFile(
      join(temporary, "index.html"),
      "<!doctype html><meta charset=utf-8><title>Native mechanism preview</title>",
      { flag: "wx" },
    );
    const rendererModule = fileURLToPath(
      new URL("../../../renderer-core/src/index.ts", import.meta.url),
    );
    server = await createServer({
      root: temporary,
      configFile: false,
      cacheDir: join(temporary, "vite-cache"),
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [nativePreviewAssets(loadedComposition.assetPaths)],
      server: {
        host: "127.0.0.1",
        port: 0,
        fs: {
          allow: [
            temporary,
            defaultBrowserProjectRoot,
            dirname(rendererModule),
          ],
        },
      },
    });
    await server.listen();
    options.signal?.throwIfAborted();
    browser = await launchRenderBrowser();
    options.signal?.throwIfAborted();
    const page = await browser.newPage();
    await page.goto(server.resolvedUrls!.local[0]!);
    await page.addScriptTag({
      type: "module",
      content: `import * as renderer from ${JSON.stringify(`/@fs/${rendererModule}`)}; globalThis.__nativeMechanismPreviewRenderer = renderer;`,
    });
    await page.waitForFunction(
      () =>
        Boolean(
          (
            globalThis as typeof globalThis & {
              __nativeMechanismPreviewRenderer?: typeof Renderer;
            }
          ).__nativeMechanismPreviewRenderer,
        ),
      undefined,
      { timeout: 30_000 },
    );
    options.signal?.throwIfAborted();
    const captured = await page.evaluate(
      async ({ json, resourcesJson, frame }) => {
        const renderer = (
          globalThis as typeof globalThis & {
            __nativeMechanismPreviewRenderer: typeof Renderer;
          }
        ).__nativeMechanismPreviewRenderer;
        const composition = JSON.parse(json) as Composition;
        const resourceOptions = JSON.parse(resourcesJson) as NonNullable<
          Parameters<typeof renderer.loadCompositionResources>[2]
        >;
        let preview:
          | ReturnType<typeof renderer.createCompositionPreview>
          | undefined;
        let snapshot: HTMLCanvasElement | undefined;
        try {
          const resources = await renderer.loadCompositionResources(
            composition,
            (id) => `/_native-preview/assets/${encodeURIComponent(id)}`,
            resourceOptions,
          );
          preview = renderer.createCompositionPreview(
            document.createElement("canvas"),
            composition,
            resources,
            { backend: "webgl2", collectNativeObservations: true },
          );
          await preview.prepareFrame(frame);
          const report = preview.renderFrame(frame),
            pixels = preview.readPixels();
          if (
            report.diagnostics.some(
              (diagnostic) => diagnostic.severity === "error",
            )
          )
            return { ok: false as const, diagnostics: report.diagnostics };
          const pixelHash = await crypto.subtle.digest(
            "SHA-256",
            new Uint8Array(
              pixels.buffer as ArrayBuffer,
              pixels.byteOffset,
              pixels.byteLength,
            ),
          );
          const pixelSha256 = `sha256:${Array.from(new Uint8Array(pixelHash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
          snapshot = renderer.createRenderCanvas();
          snapshot.width = composition.width;
          snapshot.height = composition.height;
          const context = snapshot.getContext("2d");
          if (!context) throw Error("Preview PNG context is unavailable");
          context.putImageData(
            new ImageData(
              new Uint8ClampedArray(
                pixels.buffer as ArrayBuffer,
                pixels.byteOffset,
                pixels.byteLength,
              ),
              composition.width,
              composition.height,
            ),
            0,
            0,
          );
          const pngDataUrl = snapshot.toDataURL("image/png");
          return {
            ok: true as const,
            observations: report.nativeObservations ?? [],
            pixelSha256,
            pixelByteLength: pixels.byteLength,
            pngDataUrl,
          };
        } catch (error) {
          return {
            ok: false as const,
            diagnostics: renderer.passageDiagnostics(error),
          };
        } finally {
          if (snapshot) snapshot.width = snapshot.height = 0;
          preview?.dispose();
        }
      },
      {
        json: JSON.stringify(loadedComposition.composition),
        resourcesJson: JSON.stringify({
          preparedMedia: loadedComposition.preparedMedia,
          preparedNative3D: loadedComposition.preparedNative3D!,
          appearanceCodeIdentity: receipt.appearanceCodeIdentity,
        }),
        frame: options.frame,
      },
    );
    options.signal?.throwIfAborted();
    if (!captured.ok) throw new PassageError(captured.diagnostics);
    const observations = NativeObservedOutputFrameSchema.parse({
      version: "native3d-observed-output-frame-1",
      outputFrame: options.frame,
      executionSha256,
      passes: captured.observations,
    });
    validateNativeObservationPacket(observations, executionSha256, expected);
    if (
      captured.pixelByteLength !==
        loadedComposition.composition.width *
          loadedComposition.composition.height *
          4 ||
      !captured.pngDataUrl.startsWith("data:image/png;base64,")
    )
      fail(
        "Native preview readback or PNG dimensions are incomplete",
        "preview.pixels",
      );
    const png = tagCompositionSrgbPng(
      Buffer.from(
        captured.pngDataUrl.slice("data:image/png;base64,".length),
        "base64",
      ),
    );
    if (
      !png.length ||
      png.length >
        captured.pixelByteLength +
          loadedComposition.composition.height +
          1_048_576
    )
      fail(
        "Native preview PNG exceeds its admitted readback capacity",
        "preview.png",
        "comp-native3d-limit",
      );
    const result: NativeMechanismPreviewResult = {
      status: "previewed",
      projectHash: loaded.projectHash,
      sourceFrame: options.frame,
      shotId: shot.id,
      outputDirectory,
      pngPath,
      pngSha256: mechanismHash(png),
      pixelSha256: captured.pixelSha256,
      pixelByteLength: captured.pixelByteLength,
      pixelEncoding: "rgba8-straight-top-first",
      receiptPath,
      backend: "webgl2",
      profile: NATIVE_MECHANISM_PROFILE,
      routeSelection,
      binding,
      observations,
    };
    await writeFile(stagedPng, png, { flag: "wx" });
    await writeFile(stagedReceipt, `${JSON.stringify(result, null, 2)}\n`, {
      flag: "wx",
    });
    await assertNativeAppearanceCodeIdentity(receipt.appearanceCodeIdentity);
    const current = await verifyNativePreparedEpisode(
      loaded,
      preparedDirectory,
      {
        ...(options.signal ? { signal: options.signal } : {}),
        route: "native3d",
      },
    );
    if (
      current.receipt.compositionSourceSha256 !==
        receipt.compositionSourceSha256 ||
      mechanismHash(await readFile(receipt.compositionPath)) !==
        receipt.compositionSourceSha256 ||
      (await readMechanismEpisode(loaded.sourcePath)).projectHash !==
        loaded.projectHash
    )
      fail(
        "Native source or saved composition changed before preview publication",
        "preview.binding",
        "comp-native3d-checksum",
      );
    options.signal?.throwIfAborted();
    await publishArtifacts(
      [
        { staged: stagedPng, destination: pngPath },
        { staged: stagedReceipt, destination: receiptPath },
      ],
      options.signal,
      { replaceExisting: true },
    );
    return result;
  } catch (error) {
    options.signal?.throwIfAborted();
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    try {
      await browser?.close();
    } finally {
      try {
        await server?.close();
      } finally {
        try {
          if (temporary) await rm(temporary, { recursive: true, force: true });
          await rm(stagedPng, { force: true });
          await rm(stagedReceipt, { force: true });
        } finally {
          await release();
        }
      }
    }
  }
}

function nativePreviewAssets(paths: Readonly<Record<string, string>>): Plugin {
  return {
    name: "still-shift-native-preview-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost")
            .pathname,
          prefix = "/_native-preview/assets/";
        if (!pathname.startsWith(prefix)) return next();
        let id: string;
        try {
          id = decodeURIComponent(pathname.slice(prefix.length));
        } catch {
          response.statusCode = 400;
          response.end("Invalid resource id");
          return;
        }
        const path = Object.hasOwn(paths, id) ? paths[id] : undefined;
        if (!path || (request.method !== "GET" && request.method !== "HEAD")) {
          response.statusCode = path ? 405 : 404;
          response.end("Resource unavailable");
          return;
        }
        void stat(path)
          .then((file) => {
            response.setHeader("Content-Length", file.size);
            response.setHeader(
              "Content-Type",
              extname(path).toLowerCase() === ".ttf"
                ? "font/ttf"
                : extname(path).toLowerCase() === ".otf"
                  ? "font/otf"
                  : "application/octet-stream",
            );
            if (request.method === "HEAD") return void response.end();
            const stream = createReadStream(path);
            response.once("close", () => stream.destroy());
            stream.once("error", () => response.destroy());
            stream.pipe(response);
          })
          .catch(() => {
            response.statusCode = 500;
            response.end("Resource unavailable");
          });
      });
    },
  };
}
