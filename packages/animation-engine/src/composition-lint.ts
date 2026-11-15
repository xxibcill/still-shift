import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  AnimationEngineError,
  resolveCompositionMediaLimits,
  type Composition,
} from "@still-shift/scene-contract";
import { createReadStream } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import type { Browser } from "playwright";
import {
  analyzeCompositionQuality,
  PassageError,
  textLegibilityFontEvidence,
  type PassageDiagnostic,
  type CompositionQualityPolicy,
  type CompositionBackend,
  type CompositionQualityReport,
} from "@still-shift/renderer-core";
import type { CompositionMediaResourceStats } from "../../renderer-core/src/composition/render/media-resources.ts";
import type * as Renderer from "@still-shift/renderer-core";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  defaultBrowserProjectRoot,
  runtimeBrowserUrl,
  type BrowserRuntimeOptions,
} from "@still-shift/execution-runtime/browser";
import { loadComposition } from "./composition-render.ts";

export type CompositionLintReport = CompositionQualityReport & {
  validationDiagnostics: PassageDiagnostic[];
  backend?: CompositionBackend;
  rendererVersion?: string;
  renderStatistics?: ReturnType<
    NonNullable<
      ReturnType<typeof Renderer.createCompositionPreview>["renderStatistics"]
    >
  >;
  textBounds?: NonNullable<
    NonNullable<CompositionQualityPolicy["evaluation"]>["textBounds"]
  >;
  /**
   * ET2: native media decode residency after the last linted frame, with the
   * browser LRU budget (`mediaLimits.decodedFrameBytes`). Present only when
   * `collectMediaStatistics` is set and the composition has video or sequence
   * media, so existing reports keep their bytes.
   */
  mediaStatistics?: Readonly<CompositionMediaResourceStats> & {
    decodedFrameBytesLimit: number;
  };
};

export type CompositionLintOptions = BrowserRuntimeOptions & {
  pixels?: boolean;
  backend?: CompositionBackend;
  collectTextBounds?: boolean;
  collectStatistics?: boolean;
  /** ET2: report native media decode residency (see `mediaStatistics`). */
  collectMediaStatistics?: boolean;
  cacheDirectory?: string;
  nodeMemory?: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
  /**
   * ET2: the caller turns process signals into an abort of `signal` (the CLI
   * does). The pinned browser is then launched without Playwright's process
   * signal handlers, which exit the process before cleanup can finish.
   */
  ownsProcessSignals?: boolean;
  /** ET1: raise exact-copy font coverage to strict; findings then fail loading. */
  fontCoverage?: "legacy" | "strict";
};
export async function lintCompositionFile(
  input: string,
  policy: CompositionQualityPolicy = {},
  options: CompositionLintOptions = {},
): Promise<CompositionLintReport> {
  const owner = new CompositionNodeMemory(options.nodeMemory);
  try {
    return await lintOwnedComposition(input, policy, {
      ...options,
      nodeMemory: owner,
    });
  } finally {
    owner.dispose();
  }
}
async function lintOwnedComposition(
  input: string,
  policy: CompositionQualityPolicy,
  options: CompositionLintOptions & { nodeMemory: CompositionNodeMemory },
): Promise<CompositionLintReport> {
  options.signal?.throwIfAborted();
  const backend = options.backend ?? "canvas2d";
  const loaded = await loadComposition(input, backend, {
    nodeMemory: options.nodeMemory,
    ...(options.cacheDirectory
      ? { cacheDirectory: options.cacheDirectory }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.fontCoverage ? { fontCoverage: options.fontCoverage } : {}),
  }).catch((error: unknown) => {
    if (
      error instanceof AnimationEngineError &&
      typeof error.context?.diagnosticsJson === "string"
    )
      throw new PassageError(
        JSON.parse(error.context.diagnosticsJson) as PassageDiagnostic[],
      );
    throw error;
  });
  options.signal?.throwIfAborted();
  policy = await withTextLegibilityFonts(
    loaded.composition,
    loaded.assetPaths,
    policy,
  );
  options.signal?.throwIfAborted();
  if (!options.pixels)
    return {
      ...analyzeCompositionQuality(loaded.composition, {
        ...policy,
        evaluation: {
          ...policy.evaluation,
          ...(loaded.native3D ? { preparedNative3D: loaded.native3D } : {}),
        },
      }),
      validationDiagnostics: loaded.warnings,
    };
  const root = options.projectRoot ?? defaultBrowserProjectRoot;
  const cacheDir = await mkdtemp(join(tmpdir(), "composition-lint-vite-"));
  let server: ViteDevServer | undefined;
  let http: Server | undefined;
  let browser: Browser | undefined;
  // One close per browser. A second Browser.close() while the first is in
  // progress force-kills Chromium and resolves before Playwright removes its
  // profile and artifacts folders, so cleanup awaits the abort's close.
  let browserClosing: Promise<void> | undefined;
  const closeBrowser = () => {
    if (browser && !browserClosing) browserClosing = browser.close();
    return browserClosing;
  };
  const abort = () => {
    void closeBrowser()?.catch(() => {});
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    options.signal?.throwIfAborted();
    // ET2: middleware mode on an owned HTTP server. A listening Vite dev
    // server installs a process-wide SIGTERM handler that exits the process,
    // which would skip this function's cleanup of `cacheDir`.
    server = await createServer({
      root,
      cacheDir,
      configFile: false,
      logLevel: "silent",
      plugins: [lintAssetPlugin(loaded.assetPaths)],
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        fs: { allow: [root, defaultBrowserProjectRoot] },
      },
    });
    options.signal?.throwIfAborted();
    http = createHttpServer(server.middlewares);
    const port = await listenOnLoopback(http);
    options.signal?.throwIfAborted();
    browser = await launchRenderBrowser(
      options.ownsProcessSignals ? { handleProcessSignals: false } : {},
    );
    options.signal?.throwIfAborted();
    const page = await browser.newPage();
    await page.goto(
      runtimeBrowserUrl(`http://127.0.0.1:${port}/`, "composition-compile"),
    );
    const moduleUrl = `/@fs/${fileURLToPath(new URL("../../renderer-core/src/index.ts", import.meta.url))}`;
    await page.addScriptTag({
      type: "module",
      content: `import * as renderer from ${JSON.stringify(moduleUrl)}; globalThis.__stillShiftLintRenderer = renderer;`,
    });
    options.signal?.throwIfAborted();
    await page.waitForFunction(
      () =>
        Boolean(
          (
            globalThis as typeof globalThis & {
              __stillShiftLintRenderer?: typeof Renderer;
            }
          ).__stillShiftLintRenderer,
        ),
      undefined,
      { timeout: 30_000 },
    );
    options.signal?.throwIfAborted();
    const result = await page.evaluate(
      async ({
        json,
        preparedMedia,
        preparedNative3D,
        appearanceCodeIdentity,
        policyJson,
        backend,
        collectTextBounds,
        collectStatistics,
        collectMediaStatistics,
        decodedFrameBytesLimit,
      }) => {
        const comp = JSON.parse(json) as Composition;
        const policy = JSON.parse(policyJson) as CompositionQualityPolicy;
        const renderer = (
          globalThis as typeof globalThis & {
            __stillShiftLintRenderer: typeof Renderer;
          }
        ).__stillShiftLintRenderer;
        let preview:
          | ReturnType<typeof renderer.createCompositionPreview>
          | undefined;
        let resources:
          | Awaited<ReturnType<typeof renderer.loadCompositionResources>>
          | undefined;
        try {
          resources = await renderer.loadCompositionResources(
            comp,
            (id: string) => `/_lint/assets/${encodeURIComponent(id)}`,
            {
              ...(preparedMedia ? { preparedMedia } : {}),
              ...(preparedNative3D
                ? { preparedNative3D, appearanceCodeIdentity }
                : {}),
            },
          );
          preview = renderer.createCompositionPreview(
            document.createElement("canvas"),
            comp,
            resources,
            { backend, collectStatistics },
          );
          const report = await renderer.analyzeRenderedCompositionQuality(
            comp,
            preview,
            policy,
            policy.textLegibility ||
              (
                comp.metadata?.readingPolicy as
                  | { textLegibility?: unknown }
                  | undefined
              )?.textLegibility
              ? { legibilityResources: resources }
              : {},
          );
          return {
            ok: true as const,
            report,
            ...(collectStatistics
              ? { renderStatistics: preview.renderStatistics?.() }
              : {}),
            ...(collectTextBounds ? { textBounds: preview.textBounds } : {}),
            ...(collectMediaStatistics && resources.media
              ? {
                  mediaStatistics: {
                    ...resources.media.stats(),
                    decodedFrameBytesLimit,
                  },
                }
              : {}),
          };
        } catch (error) {
          return {
            ok: false as const,
            diagnostics: renderer.passageDiagnostics(error),
          };
        } finally {
          preview?.dispose();
        }
      },
      {
        json: JSON.stringify(loaded.composition),
        preparedMedia: loaded.preparedMedia,
        preparedNative3D: loaded.preparedNative3D,
        appearanceCodeIdentity: loaded.nativeAppearanceCodeIdentity,
        policyJson: JSON.stringify(policy),
        backend,
        collectTextBounds: options.collectTextBounds ?? false,
        collectStatistics: options.collectStatistics ?? false,
        collectMediaStatistics: options.collectMediaStatistics ?? false,
        decodedFrameBytesLimit: resolveCompositionMediaLimits(
          loaded.composition.mediaLimits,
        ).decodedFrameBytes,
      },
    );
    options.signal?.throwIfAborted();
    if (!result.ok) throw new PassageError(result.diagnostics);
    return {
      ...result.report,
      ...(result.renderStatistics
        ? { renderStatistics: result.renderStatistics }
        : {}),
      validationDiagnostics: loaded.warnings,
      ...(result.textBounds ? { textBounds: result.textBounds } : {}),
      ...(result.mediaStatistics
        ? { mediaStatistics: result.mediaStatistics }
        : {}),
    };
  } catch (error) {
    options.signal?.throwIfAborted();
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    try {
      // The abort started this close and already ignored its failure; the
      // caller's abort reason, thrown above, stays the result.
      await closeBrowser()?.catch((error: unknown) => {
        if (!options.signal?.aborted) throw error;
      });
    } finally {
      try {
        if (server) await closeViteServer(server);
      } finally {
        try {
          if (http?.listening) await closeHttpServer(http);
        } finally {
          await rm(cacheDir, { recursive: true, force: true });
        }
      }
    }
  }
}

/**
 * ET3: when the policy (or the composition's saved reading policy) declares
 * `textLegibility`, read each pinned font's x-height per em from its OS/2
 * table for the `x-height-floor` rule; fonts that cannot be read are kept as
 * unmeasured with their reason. Other lints keep their policy as given.
 */
async function withTextLegibilityFonts(
  composition: Composition,
  assetPaths: Readonly<Record<string, string>>,
  policy: CompositionQualityPolicy,
): Promise<CompositionQualityPolicy> {
  const saved = composition.metadata?.readingPolicy as
    | { textLegibility?: unknown }
    | undefined;
  if (!policy.textLegibility && !saved?.textLegibility) return policy;
  const fonts: { id: string; bytes: ArrayBuffer }[] = [];
  for (const asset of composition.assets) {
    const path = assetPaths[asset.id];
    if (asset.type !== "font" || !path) continue;
    const bytes = await readFile(path);
    fonts.push({
      id: asset.id,
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    });
  }
  // WOFF/WOFF2 or unreadable fonts are reported as unmeasured, not thrown.
  return {
    ...policy,
    textLegibilityEvidence: {
      ...policy.textLegibilityEvidence,
      ...textLegibilityFontEvidence(fonts),
    },
  };
}

/**
 * Close Vite only after its dependency optimizer settles. In Vite 7.3.6 a run
 * started by the dependency scan is taken over by the crawl-end handler, so a
 * `close()` in that window has nothing to cancel; when the bundle lands, the
 * closed optimizer returns without removing it, and `deps_temp_*` reappears in
 * the lint cache after it was removed (a cancel in the first moments of lint).
 * Waiting for the scan and for every discovered dependency's processing lets
 * that run commit first. A completed lint has nothing pending, so this costs
 * nothing then; one deadline over the scan and the bundling keeps a stuck
 * optimizer from holding cleanup. Exported for tests.
 */
export async function closeViteServer(
  server: Pick<ViteDevServer, "environments" | "close">,
  settleTimeoutMs = optimizerSettleTimeoutMs,
) {
  const optimizers = Object.values(server.environments).flatMap(
    (environment) =>
      environment.depsOptimizer ? [environment.depsOptimizer] : [],
  );
  const settled = (async () => {
    await Promise.allSettled(
      optimizers.map((optimizer) => optimizer.scanProcessing),
    );
    await Promise.allSettled(
      optimizers.flatMap((optimizer) =>
        Object.values(optimizer.metadata.discovered).flatMap((dependency) =>
          dependency.processing ? [dependency.processing] : [],
        ),
      ),
    );
  })();
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    settled,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, settleTimeoutMs);
    }),
  ]);
  clearTimeout(timer);
  await server.close();
}

const optimizerSettleTimeoutMs = 10_000;

/** Listen on an ephemeral loopback port and return it. */
function listenOnLoopback(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function closeHttpServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

/** Serve only already validated resources; native frame decoding retains its bounded LRU. */
function lintAssetPlugin(paths: Readonly<Record<string, string>>): Plugin {
  return {
    name: "still-shift-lint-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost")
          .pathname;
        if (!pathname.startsWith("/_lint/assets/")) return next();
        let id: string;
        try {
          id = decodeURIComponent(pathname.slice("/_lint/assets/".length));
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
            response.setHeader("Content-Type", resourceContentType(path));
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
function resourceContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
