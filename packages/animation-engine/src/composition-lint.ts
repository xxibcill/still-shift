import {
  AnimationEngineError,
  type Composition,
} from "@still-shift/scene-contract";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import type { Browser } from "playwright";
import {
  analyzeCompositionQuality,
  PassageError,
  type PassageDiagnostic,
  type CompositionQualityPolicy,
  type CompositionBackend,
} from "@still-shift/renderer-core";
import type * as Renderer from "@still-shift/renderer-core";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  defaultBrowserProjectRoot,
  runtimeBrowserUrl,
  type BrowserRuntimeOptions,
} from "@still-shift/execution-runtime/browser";
import { loadComposition } from "./composition-render.ts";

export async function lintCompositionFile(
  input: string,
  policy: CompositionQualityPolicy = {},
  options: BrowserRuntimeOptions & {
    pixels?: boolean;
    backend?: CompositionBackend;
    collectTextBounds?: boolean;
    signal?: AbortSignal;
  } = {},
) {
  options.signal?.throwIfAborted();
  const backend = options.backend ?? "canvas2d";
  const loaded = await loadComposition(input, backend).catch(
    (error: unknown) => {
      if (
        error instanceof AnimationEngineError &&
        typeof error.context?.diagnosticsJson === "string"
      )
        throw new PassageError(
          JSON.parse(error.context.diagnosticsJson) as PassageDiagnostic[],
        );
      throw error;
    },
  );
  options.signal?.throwIfAborted();
  if (!options.pixels)
    return {
      ...analyzeCompositionQuality(loaded.composition, policy),
      validationDiagnostics: loaded.warnings,
    };
  const root = options.projectRoot ?? defaultBrowserProjectRoot;
  const cacheDir = await mkdtemp(join(tmpdir(), "composition-lint-vite-"));
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  const abort = () => {
    void browser?.close().catch(() => {});
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    options.signal?.throwIfAborted();
    server = await createServer({
      root,
      cacheDir,
      configFile: false,
      logLevel: "silent",
      plugins: [lintAssetPlugin(loaded.assetPaths)],
      server: {
        host: "127.0.0.1",
        port: 0,
        fs: { allow: [root, defaultBrowserProjectRoot] },
      },
    });
    options.signal?.throwIfAborted();
    await server.listen();
    options.signal?.throwIfAborted();
    browser = await launchRenderBrowser();
    options.signal?.throwIfAborted();
    const page = await browser.newPage();
    await page.goto(
      runtimeBrowserUrl(server.resolvedUrls!.local[0]!, "composition-compile"),
    );
    const result = await page.evaluate(
      async ({
        json,
        moduleUrl,
        preparedMedia,
        policyJson,
        backend,
        collectTextBounds,
      }) => {
        const comp = JSON.parse(json) as Composition;
        const policy = JSON.parse(policyJson) as CompositionQualityPolicy;
        const renderer = (await import(moduleUrl)) as typeof Renderer;
        let preview:
          | ReturnType<typeof renderer.createCompositionPreview>
          | undefined;
        try {
          const resources = await renderer.loadCompositionResources(
            comp,
            (id: string) => `/_lint/assets/${encodeURIComponent(id)}`,
            preparedMedia ? { preparedMedia } : {},
          );
          preview = renderer.createCompositionPreview(
            document.createElement("canvas"),
            comp,
            resources,
            { backend },
          );
          return {
            ok: true as const,
            report: await renderer.analyzeRenderedCompositionQuality(
              comp,
              preview,
              policy,
            ),
            ...(collectTextBounds ? { textBounds: preview.textBounds } : {}),
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
        moduleUrl: `/@fs/${fileURLToPath(new URL("../../renderer-core/src/index.ts", import.meta.url))}`,
        preparedMedia: loaded.preparedMedia,
        policyJson: JSON.stringify(policy),
        backend,
        collectTextBounds: options.collectTextBounds ?? false,
      },
    );
    options.signal?.throwIfAborted();
    if (!result.ok) throw new PassageError(result.diagnostics);
    return {
      ...result.report,
      validationDiagnostics: loaded.warnings,
      ...(result.textBounds ? { textBounds: result.textBounds } : {}),
    };
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
        await rm(cacheDir, { recursive: true, force: true });
      }
    }
  }
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
