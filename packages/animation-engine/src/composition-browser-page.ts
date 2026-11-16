/**
 * The pinned browser page that composition lint (ET2) and text measurement
 * (ET6a) run renderer code in: a Vite dev server in middleware mode on an
 * owned loopback HTTP server, serving only already validated assets, and the
 * pinned Chromium with the renderer module loaded as
 * `globalThis.__stillShiftLintRenderer`. Moved from `composition-lint.ts`
 * unchanged; every resource is released on success, failure and abort.
 */
import { createReadStream } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import type { Browser, Page } from "playwright";
import type * as Renderer from "@still-shift/renderer-core";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  defaultBrowserProjectRoot,
  runtimeBrowserUrl,
  type BrowserRuntimeOptions,
} from "@still-shift/execution-runtime/browser";

export type RendererPageOptions = BrowserRuntimeOptions & {
  signal?: AbortSignal | undefined;
  /** Launch Chromium without Playwright's process signal handlers (ET2). */
  ownsProcessSignals?: boolean;
  /** Prefix of the temporary Vite cache folder, removed on every exit. */
  cacheDirectoryPrefix: string;
};

/** Run `use` with a page that has the renderer loaded; then close everything. */
export async function withRendererPage<T>(
  assetPaths: Readonly<Record<string, string>>,
  options: RendererPageOptions,
  use: (page: Page) => Promise<T>,
): Promise<T> {
  const root = options.projectRoot ?? defaultBrowserProjectRoot;
  const cacheDir = await mkdtemp(join(tmpdir(), options.cacheDirectoryPrefix));
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
      plugins: [lintAssetPlugin(assetPaths)],
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
    const result = await use(page);
    options.signal?.throwIfAborted();
    return result;
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
