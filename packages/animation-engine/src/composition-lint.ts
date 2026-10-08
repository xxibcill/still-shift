import {
  AnimationEngineError,
  type Composition,
} from "@still-shift/scene-contract";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
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
  } = {},
) {
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
  if (!options.pixels)
    return {
      ...analyzeCompositionQuality(loaded.composition, policy),
      validationDiagnostics: loaded.warnings,
    };
  const urls = Object.fromEntries(
    await Promise.all(
      Object.entries(loaded.assetPaths).map(async ([id, path]) => [
        id,
        `data:application/octet-stream;base64,${(await readFile(path)).toString("base64")}`,
      ]),
    ),
  );
  const root = options.projectRoot ?? defaultBrowserProjectRoot;
  const cacheDir = await mkdtemp(join(tmpdir(), "composition-lint-vite-"));
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  try {
    server = await createServer({
      root,
      cacheDir,
      configFile: false,
      logLevel: "silent",
      server: {
        host: "127.0.0.1",
        port: 0,
        fs: { allow: [root, defaultBrowserProjectRoot] },
      },
    });
    await server.listen();
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    await page.goto(
      runtimeBrowserUrl(server.resolvedUrls!.local[0]!, "composition-compile"),
    );
    const result = await page.evaluate(
      async ({ json, urls, policyJson, backend }) => {
        const comp = JSON.parse(json) as Composition;
        const policy = JSON.parse(policyJson) as CompositionQualityPolicy;
        const moduleUrl = "/packages/renderer-core/src/index.ts";
        const renderer = (await import(moduleUrl)) as typeof Renderer;
        let preview:
          | ReturnType<typeof renderer.createCompositionPreview>
          | undefined;
        try {
          const resources = await renderer.loadCompositionResources(
            comp,
            (id: string) => urls[id]!,
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
        urls,
        policyJson: JSON.stringify(policy),
        backend,
      },
    );
    if (!result.ok) throw new PassageError(result.diagnostics);
    return { ...result.report, validationDiagnostics: loaded.warnings };
  } finally {
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
