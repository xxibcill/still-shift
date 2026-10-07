import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { CompositionSurfaceStore } from "../../packages/execution-runtime/src/composition-surface-store.ts";
import { CompositionSurfaceBroker } from "../../packages/execution-runtime/src/composition-surface-broker.ts";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as Checks from "../helpers/composition-surface-reference.ts";

import type * as SourceChecks from "../helpers/composition-source-reference.ts";

type SurfaceOutcome = Awaited<
  ReturnType<typeof Checks.checkSharedCompositionSurfaces>
>;
type SourceOutcome = Awaited<
  ReturnType<typeof SourceChecks.checkSharedCompositionSources>
>;

const root = resolve(import.meta.dirname, "../..");
const scratch = await mkdtemp(
  join(tmpdir(), "composition-surfaces-acceptance-"),
);
const brokers = new Map<string, CompositionSurfaceBroker>();
const failures: unknown[] = [];
const server = await createServer({
  root,
  configFile: false,
  cacheDir: join(scratch, "vite"),
  logLevel: "error",
  plugins: [
    {
      name: "composition-surface-acceptance",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const parts = new URL(
            request.url ?? "/",
            "http://localhost",
          ).pathname.split("/");
          if (parts[1] !== "_surface") return next();
          const broker = brokers.get(parts[2] ?? "");
          if (!broker) {
            response.statusCode = 404;
            response.end("Unknown surface export");
            return;
          }
          void broker.respond(parts[3] ?? "", request, response);
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0, watch: null },
});
let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
try {
  await server.listen();
  browser = await launchRenderBrowser();
  const workers = [];
  for (let worker = 0; worker < 4; worker++) {
    const context = await browser.newContext(),
      page = await context.newPage();
    await page.addInitScript("window.__name=(fn)=>fn;");
    await page.goto(server.resolvedUrls!.local[0]!);
    workers.push({ context, page });
  }
  const environments = await Promise.all(
    workers.map(({ page }) => probeRenderEnvironment(page)),
  );
  environments.forEach(assertPinnedRenderEnvironment);
  assert.equal(
    new Set(environments.map((env) => env.rasterFingerprint)).size,
    1,
  );
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const variant of [
      "isolate",
      "nested",
      "late",
      "coverage",
      "matte",
      "effect-input",
      "history",
      "exposure",
      "linear",
      "provider",
      "shape",
      "dynamic",
    ]) {
      const id = backend + "-" + variant,
        credentials = workers.map(() => randomUUID());
      const store = await CompositionSurfaceStore.create(scratch, {
        workers: 4,
        byteLimit: 64 * 1024 * 1024,
      });
      brokers.set(
        id,
        new CompositionSurfaceBroker(store, credentials, (error) => {
          failures.push(error);
          void store.dispose(
            error instanceof Error ? error : Error(String(error)),
          );
        }),
      );
      try {
        const denied = await fetch(
          server.resolvedUrls!.local[0]! + `_surface/${id}/claim`,
          {
            method: "POST",
            headers: { "x-composition-cache-worker": "3" },
            body: "{}",
          },
        );
        assert.equal(denied.status, 403);
        assert.equal(store.statistics.reservedDiskBytes, 0);
        const scopeKey =
          "sha256:" +
          createHash("sha256")
            .update(JSON.stringify([id, environments[0]]))
            .digest("hex");
        const outcomes: SurfaceOutcome[] = await Promise.all(
          workers.map(({ page }, worker) =>
            page.evaluate(
              async (options) => {
                const url = "/tests/helpers/composition-surface-reference.ts";
                return (
                  (await import(url)) as typeof Checks
                ).checkSharedCompositionSurfaces(options);
              },
              {
                variant,
                backend,
                worker,
                credential: credentials[worker]!,
                scopeKey,
                baseUrl: `/_surface/${id}`,
              },
            ),
          ),
        );
        assert.deepEqual(failures, []);
        const statistics = store.statistics;
        assert.ok(statistics.publishedSurfaces > 0);
        assert.equal(
          outcomes.reduce(
            (sum, outcome) => sum + outcome.statistics.independentSurfacePaints,
            0,
          ),
          statistics.publishedSurfaces,
        );
        assert.equal(
          outcomes.reduce(
            (sum, outcome) => sum + outcome.statistics.surfaceRestores,
            0,
          ),
          statistics.publishedSurfaces * 3,
        );
        assert.equal(
          statistics.dynamicPaths,
          variant === "dynamic" ? 1 : 0,
          "These independent sources are actually static",
        );
        if (variant === "late")
          outcomes.forEach((outcome) =>
            assert.deepEqual(outcome.lateBefore, [0, 0, 0, 0]),
          );
        if (variant === "provider") {
          assert.equal(
            outcomes.reduce(
              (sum, outcome) => sum + outcome.providerDrawCalls,
              0,
            ),
            1,
          );
          assert.equal(
            outcomes.reduce(
              (sum, outcome) => sum + outcome.providerPreparations,
              0,
            ),
            4,
          );
        }
        reports.push({ backend, variant, statistics, outcomes });
      } finally {
        brokers.delete(id);
        await store.dispose();
      }
    }
  const sources = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const software of [false, true])
      for (const animated of [false, true]) {
        const id = `sources-${backend}-${software}-${animated}`,
          credentials = workers.map(() => randomUUID());
        const store = await CompositionSurfaceStore.create(scratch, {
          workers: 4,
          byteLimit: 64 * 1024 * 1024,
        });
        brokers.set(
          id,
          new CompositionSurfaceBroker(store, credentials, (error) => {
            failures.push(error);
            void store.dispose(
              error instanceof Error ? error : Error(String(error)),
            );
          }),
        );
        try {
          const scopeKey =
            "sha256:" +
            createHash("sha256")
              .update(JSON.stringify([id, environments[0]]))
              .digest("hex");
          const outcomes: SourceOutcome[] = await Promise.all(
            workers.map(({ page }, worker) =>
              page.evaluate(
                async (options) => {
                  const url = "/tests/helpers/composition-source-reference.ts";
                  return (
                    (await import(url)) as typeof SourceChecks
                  ).checkSharedCompositionSources(options);
                },
                {
                  backend,
                  software,
                  animated,
                  worker,
                  credential: credentials[worker]!,
                  scopeKey,
                  baseUrl: `/_surface/${id}`,
                },
              ),
            ),
          );
          assert.deepEqual(failures, []);
          const totals = (kind: string, field: "paints" | "restores") =>
            outcomes.reduce(
              (sum, result) =>
                sum +
                (result.sourceStatistics.sources.find(
                  (source) => source.kind === kind,
                )?.[field] ?? 0),
              0,
            );
          assert.equal(totals("coverage-asset", "paints"), 1);
          assert.equal(totals("coverage-asset", "restores"), 3);
          assert.equal(totals("glyph", "paints"), 3);
          assert.equal(totals("glyph", "restores"), 9);
          assert.equal(totals("glyph-stroke", "paints"), animated ? 8 : 2);
          assert.equal(totals("glyph-stroke", "restores"), animated ? 24 : 6);
          assert.equal(
            outcomes.reduce(
              (sum, result) => sum + result.preparationPaintCalls.drawImage,
              0,
            ),
            1,
          );
          assert.equal(
            outcomes.reduce(
              (sum, result) => sum + result.preparationPaintCalls.fillText,
              0,
            ),
            3,
          );
          assert.equal(
            outcomes.reduce(
              (sum, result) => sum + result.preparationPaintCalls.strokeText,
              0,
            ),
            animated ? 8 : 2,
          );
          const independentPaints = outcomes.reduce(
            (sum, result) =>
              sum + result.surfaceStatistics.independentSurfacePaints,
            0,
          );
          assert.equal(
            store.statistics.publishedSurfaces,
            (animated ? 12 : 6) + independentPaints,
          );
          sources.push({
            backend,
            software,
            statistics: store.statistics,
            outcomes,
          });
        } finally {
          brokers.delete(id);
          await store.dispose();
        }
      }
  const floating = await workers[0]!.page.evaluate(async () => {
    const url = "/tests/helpers/composition-surface-reference.ts";
    return ((await import(url)) as typeof Checks).checkFloatSurfaceTransfer();
  });
  const nativeStorage = await workers[0]!.page.evaluate(async () => {
    const url = "/tests/helpers/composition-surface-reference.ts";
    return ((await import(url)) as typeof Checks).checkNativeSurfaceStorage();
  });
  const protectedPreparation = await workers[0]!.page.evaluate(async () => {
    const url = "/tests/helpers/composition-surface-reference.ts";
    return (
      (await import(url)) as typeof Checks
    ).checkSurfacePreparationFailures();
  });
  const protectedSources = await workers[0]!.page.evaluate(async () => {
    const url = "/tests/helpers/composition-source-reference.ts";
    return (
      (await import(url)) as typeof SourceChecks
    ).checkSourcePreparationFailures();
  });
  const directory = join(root, "benchmarks/results/composition-ce15-surfaces");
  await mkdir(directory, { recursive: true });
  const result = {
    status: "passed",
    environments,
    surfaceCases: reports.length,
    sourceCases: sources.length,
    cases: reports.length + sources.length,
    sourceFrameChecks: sources.reduce(
      (sum, report) =>
        sum +
        report.outcomes.reduce(
          (count, outcome) => count + outcome.frameChecks,
          0,
        ),
      0,
    ),
    frameChecks: [...reports, ...sources].reduce(
      (sum, report) =>
        sum +
        report.outcomes.reduce(
          (count, outcome) => count + outcome.frameChecks,
          0,
        ),
      0,
    ),
    sources,
    floating,
    nativeStorage,
    protectedPreparation,
    protectedSources,
    reports,
  };
  await writeFile(
    join(directory, "acceptance.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
  await rm(scratch, { recursive: true, force: true });
}
