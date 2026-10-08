import type { Browser, Page } from "playwright";
import type {
  PassageDiagnostic,
  PreviewScene,
} from "@still-shift/renderer-core";
import { AnimationEngineError } from "@still-shift/scene-contract";
import { runtimeBrowserUrl } from "./browser.ts";
import {
  assertPinnedRenderEnvironment,
  probeRenderEnvironment,
  type RenderBrowserProfile,
  type RenderEnvironment,
} from "./render-browser.ts";
import type { ExportableScene } from "./export-worker.ts";
import type {
  BrowserCompositionOutput,
  BrowserExportResult,
} from "./export-page.ts";
import type { FrameTransport } from "./transport.ts";

export type ExportBrowserWorker = {
  page: Page;
  environment: RenderEnvironment;
  rendererProcessIds: number[];
  gpuProcessIds: number[];
};

/** Each independently launched pinned browser owns its renderer and SwiftShader processes. */
export async function prepareExportBrowserWorker(
  browser: Browser,
  options: {
    baseUrl: string;
    width: number;
    height: number;
    profile: RenderBrowserProfile;
    recordProcesses?: boolean;
  },
): Promise<ExportBrowserWorker> {
  const page = await browser.newPage({
    viewport: { width: options.width, height: options.height },
  });
  const startupErrors: string[] = [];
  page.on("pageerror", (error) => startupErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      startupErrors.push(message.text().slice(0, 1024));
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      startupErrors.push(
        `${response.status()} ${response.url().slice(0, 256)}`,
      );
  });
  page.on("requestfailed", (failed) =>
    startupErrors.push(
      `${failed.url().slice(0, 256)}: ${failed.failure()?.errorText ?? "request failed"}`,
    ),
  );
  await page.goto(runtimeBrowserUrl(options.baseUrl, "export"));
  try {
    await page.waitForFunction(() => Boolean(window.runStillShiftExport));
  } catch (cause) {
    throw Error(
      `Export browser did not initialize${startupErrors.length ? `: ${startupErrors.join("; ")}` : ": no browser error reported"}`,
      { cause },
    );
  }
  const environment = await probeRenderEnvironment(page, options.profile);
  assertPinnedRenderEnvironment(environment);
  let rendererProcessIds: number[] = [],
    gpuProcessIds: number[] = [];
  if (options.recordProcesses) {
    const session = await browser.newBrowserCDPSession();
    try {
      const snapshot = (await session.send("SystemInfo.getProcessInfo")) as {
        processInfo: { id: number; type: string }[];
      };
      rendererProcessIds = snapshot.processInfo
        .filter((process) => process.type === "renderer")
        .map((process) => process.id);
      gpuProcessIds = snapshot.processInfo
        .filter((process) => process.type.toLowerCase() === "gpu")
        .map((process) => process.id);
      if (!rendererProcessIds.length)
        throw Error("Composition worker has no actual renderer process");
    } finally {
      await session.detach();
    }
  }
  return { page, environment, rendererProcessIds, gpuProcessIds };
}

export async function runExportBrowserWorker(
  worker: ExportBrowserWorker,
  options: {
    scene: ExportableScene;
    hasDepth: boolean;
    transport: FrameTransport;
    output?: BrowserCompositionOutput;
  },
): Promise<BrowserExportResult> {
  const outcome = await worker.page.evaluate(
    async ({ scene, hasDepth, transport, output }) => {
      try {
        return {
          ok: true as const,
          value: await window.runStillShiftExport!(
            scene,
            hasDepth,
            transport,
            output,
          ),
        };
      } catch (error) {
        const diagnostics = (error as { diagnostics?: PassageDiagnostic[] })
          .diagnostics;
        if (!diagnostics?.length) throw error;
        return { ok: false as const, diagnostics };
      }
    },
    { ...options, scene: options.scene as PreviewScene },
  );
  if (outcome.ok) {
    if (outcome.value.memory)
      outcome.value.memory.afterAcknowledgement = await worker.page.evaluate(
        async () => {
          if (!window.acknowledgeStillShiftExport)
            throw Error("Composition export omitted memory acknowledgement");
          return window.acknowledgeStillShiftExport();
        },
      );
    return outcome.value;
  }
  const diagnostic = outcome.diagnostics[0]!;
  throw new AnimationEngineError(
    "RENDER_FAILED",
    `${diagnostic.code}: ${diagnostic.message}`,
    {
      diagnostic: diagnostic.code,
      ...(diagnostic.node ? { node: diagnostic.node } : {}),
      ...(diagnostic.path ? { path: diagnostic.path } : {}),
      ...(diagnostic.frame === undefined ? {} : { frame: diagnostic.frame }),
      diagnostics: JSON.stringify(outcome.diagnostics),
    },
  );
}

export function summarizeExportWorkers(
  results: BrowserExportResult[],
): BrowserExportResult {
  const frames = results.flatMap((result) => result.work?.frames ?? []);
  if (!frames.length)
    throw Error("Composition workers returned no actual frame timings");
  const summarize = (values: number[]) => {
    if (values.some((value) => !Number.isFinite(value) || value < 0))
      throw Error("Composition worker timing is invalid");
    values.sort((left, right) => left - right);
    return {
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      p95: values[Math.ceil(values.length * 0.95) - 1]!,
    };
  };
  const render = summarize(frames.map((frame) => frame.renderMs));
  const upload = summarize(frames.map((frame) => frame.uploadMs));
  if (results.some((result) => result.gpuRenderer !== results[0]!.gpuRenderer))
    throw Error("Composition workers use different backend renderers");
  return {
    frameRenderAverageMs: render.average,
    frameRenderP95Ms: render.p95,
    frameUploadAverageMs: upload.average,
    frameUploadP95Ms: upload.p95,
    gpuRenderer: results[0]!.gpuRenderer,
  };
}
