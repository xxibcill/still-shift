import { COMPOSITION_RESULT_CHUNK_CHARACTERS } from "./composition-result-size.ts";
import type { CompositionResultBudget } from "./composition-result-budget.ts";
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
    resultBudget?: CompositionResultBudget | undefined;
  },
): Promise<BrowserExportResult> {
  const remote = await worker.page.evaluateHandle(
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
    {
      scene: options.scene as PreviewScene,
      hasDepth: options.hasDepth,
      transport: options.transport,
      output: options.output,
    },
  );
  let pendingAcknowledgement = false;
  try {
    let outcome: Awaited<ReturnType<typeof remote.jsonValue>>;
    const transfer = await remote.evaluate(
      (outcome) => outcome.ok && !!outcome.value.memory,
    );
    if (transfer) {
      pendingAcknowledgement = true;
      if (!options.resultBudget)
        throw Error("Composition result has no Node admission budget");
      const size = await remote.evaluate(async (outcome) => {
        if (!outcome.ok || !window.prepareStillShiftExportTransfer)
          throw Error("Composition result transfer is unavailable");
        return window.prepareStillShiftExportTransfer(outcome.value);
      });
      const receive = options.resultBudget.receive(size);
      try {
        const chunks: string[] = [];
        for (
          let offset = 0;
          offset < size.characters;
          offset += COMPOSITION_RESULT_CHUNK_CHARACTERS
        ) {
          const chunk = await worker.page.evaluate(async (offset) => {
            if (!window.readStillShiftExportTransfer)
              throw Error("Composition result transfer is unavailable");
            return window.readStillShiftExportTransfer(offset);
          }, offset);
          if (
            chunk.length !==
            Math.min(
              COMPOSITION_RESULT_CHUNK_CHARACTERS,
              size.characters - offset,
            )
          )
            throw Error(
              "Composition result transfer has an invalid chunk length",
            );
          chunks.push(chunk);
        }
        let text = chunks.join("");
        chunks.length = 0;
        const value = JSON.parse(text) as BrowserExportResult;
        text = "";
        if (!value.memory)
          throw Error("Composition result lost its ownership descriptor");
        value.memory.beforeAcknowledgement = size.memory;
        outcome = { ok: true, value };
        receive.complete();
      } finally {
        receive.dispose();
      }
    } else outcome = await remote.jsonValue();
    if (outcome.ok) {
      if (outcome.value.memory)
        outcome.value.memory.afterAcknowledgement = await worker.page.evaluate(
          async () => {
            if (!window.acknowledgeStillShiftExport)
              throw Error("Composition export omitted memory acknowledgement");
            return window.acknowledgeStillShiftExport();
          },
        );
      pendingAcknowledgement = false;
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
  } finally {
    if (pendingAcknowledgement)
      await worker.page
        .evaluate(async () => window.acknowledgeStillShiftExport?.())
        .catch(() => undefined);
    await remote.dispose().catch(() => undefined);
  }
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
