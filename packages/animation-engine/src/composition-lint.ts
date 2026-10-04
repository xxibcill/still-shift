import {
  AnimationEngineError,
  type Composition,
} from "@still-shift/scene-contract";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import type { Browser } from "playwright";
import {
  analyzeCompositionQuality,
  PassageError,
  type PassageDiagnostic,
  type CompositionQualityPolicy,
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
  options: BrowserRuntimeOptions & { pixels?: boolean } = {},
) {
  const loaded = await loadComposition(input).catch((error: unknown) => {
    if (
      error instanceof AnimationEngineError &&
      typeof error.context?.diagnosticsJson === "string"
    )
      throw new PassageError(
        JSON.parse(error.context.diagnosticsJson) as PassageDiagnostic[],
      );
    throw error;
  });
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
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [root, defaultBrowserProjectRoot] },
    },
  });
  let browser: Browser | undefined;
  try {
    await server.listen();
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    await page.goto(
      runtimeBrowserUrl(server.resolvedUrls!.local[0]!, "composition-compile"),
    );
    const report = await page.evaluate(
      async ({ json, urls, policyJson }) => {
        const comp = JSON.parse(json) as Composition;
        const policy = JSON.parse(policyJson) as CompositionQualityPolicy;
        const moduleUrl = "/packages/renderer-core/src/index.ts";
        const renderer = (await import(moduleUrl)) as typeof Renderer;
        const resources = await renderer.loadCompositionResources(
          comp,
          (id: string) => urls[id]!,
        );
        const preview = renderer.createCompositionPreview(
          document.createElement("canvas"),
          comp,
          resources,
        );
        try {
          return await renderer.analyzeRenderedCompositionQuality(
            comp,
            preview,
            policy,
          );
        } finally {
          preview.dispose();
        }
      },
      {
        json: JSON.stringify(loaded.composition),
        urls,
        policyJson: JSON.stringify(policy),
      },
    );
    return { ...report, validationDiagnostics: loaded.warnings };
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
}
