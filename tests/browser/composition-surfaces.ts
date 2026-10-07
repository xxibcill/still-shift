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

import type * as PrefixChecks from "../helpers/composition-prefix-reference.ts";
import type * as RootChecks from "../helpers/composition-root-reference.ts";
import { COMPOSITION_TINT_VARIANTS } from "../helpers/composition-tint-fixture.ts";
import type * as SourceChecks from "../helpers/composition-source-reference.ts";
import type * as MemoryChecks from "../helpers/composition-memory-reference.ts";

type SurfaceOutcome = Awaited<
  ReturnType<typeof Checks.checkSharedCompositionSurfaces>
>;
type SourceOutcome = Awaited<
  ReturnType<typeof SourceChecks.checkSharedCompositionSources>
>;
type PrefixOutcome = Awaited<
  ReturnType<typeof PrefixChecks.checkSharedCompositionPrefixes>
>;
type RootOutcome = Awaited<
  ReturnType<typeof RootChecks.checkSharedCompositionRoots>
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
            (sum, outcome) =>
              sum +
              outcome.statistics.independentSurfacePaints +
              outcome.rootStatistics.roots.reduce(
                (sum, root) => sum + root.paints,
                0,
              ),
            0,
          ),
          statistics.publishedSurfaces,
        );
        assert.equal(
          outcomes.reduce(
            (sum, outcome) =>
              sum +
              outcome.statistics.surfaceRestores +
              outcome.rootStatistics.roots.reduce(
                (sum, root) => sum + root.restores,
                0,
              ),
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
      for (const sourceCase of [
        { animated: false, variant: undefined },
        { animated: true, variant: undefined },
        ...COMPOSITION_TINT_VARIANTS.map((variant) => ({
          animated: false,
          variant,
        })),
      ]) {
        const { animated, variant } = sourceCase;
        const id = `sources-${backend}-${software}-${variant ?? animated}`,
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
                  ...(variant ? { variant } : {}),
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
          if (!variant) {
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
          }
          if (variant) {
            const glyphs =
              variant === "axes"
                ? 27
                : variant === "correction" || variant === "state-mix"
                  ? 4
                  : 3;
            const tints =
              variant === "colors"
                ? 44
                : variant === "axes"
                  ? 15
                  : variant === "state-mix"
                    ? 14
                    : 10;
            assert.equal(totals("glyph", "paints"), glyphs);
            assert.equal(totals("glyph", "restores"), glyphs * 3);
            assert.equal(totals("glyph-tint", "paints"), tints);
            assert.equal(totals("glyph-tint", "restores"), tints * 3);
            assert.equal(
              outcomes.reduce(
                (sum, result) => sum + result.preparationPaintCalls.fillText,
                0,
              ),
              glyphs,
            );
            assert.equal(
              outcomes.reduce(
                (sum, result) => sum + result.preparationPaintCalls.strokeText,
                0,
              ),
              variant === "axes" ? 0 : 2,
            );
          }
          const tintPaints = outcomes.reduce(
            (sum, result) => sum + result.nativeTintPaints,
            0,
          );
          assert.ok(tintPaints > 0, id + ": actual native tint painting");
          assert.equal(
            tintPaints,
            totals("glyph-tint", "paints"),
            id + ": once-global native tint paint count",
          );
          const sourcePaints = outcomes.reduce(
            (sum, result) =>
              sum +
              result.sourceStatistics.sources.reduce(
                (n, source) => n + source.paints,
                0,
              ),
            0,
          );
          const independentPaints = outcomes.reduce(
            (sum, result) =>
              sum + result.surfaceStatistics.independentSurfacePaints,
            0,
          );
          assert.equal(
            store.statistics.publishedSurfaces,
            sourcePaints +
              independentPaints +
              outcomes.reduce(
                (sum, result) =>
                  sum +
                  result.rootStatistics.roots.reduce(
                    (sum, root) => sum + root.paints,
                    0,
                  ),
                0,
              ),
          );
          sources.push({
            backend,
            software,
            animated,
            variant,
            statistics: store.statistics,
            outcomes,
          });
        } finally {
          brokers.delete(id);
          await store.dispose();
        }
      }
  const roots = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const alpha of [false, true])
      for (const software of [false, true])
        for (const variant of ["static", "coverage", "late"] as const) {
          const id = `roots-${backend}-${alpha}-${software}-${variant}`;
          const credentials = workers.map(() => randomUUID());
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
            const outcomes: RootOutcome[] = await Promise.all(
              workers.map(({ page }, worker) =>
                page.evaluate(
                  async (options) => {
                    const url = "/tests/helpers/composition-root-reference.ts";
                    return (
                      (await import(url)) as typeof RootChecks
                    ).checkSharedCompositionRoots(options);
                  },
                  {
                    backend,
                    alpha,
                    software,
                    variant,
                    worker,
                    credential: credentials[worker]!,
                    scopeKey,
                    baseUrl: `/_surface/${id}`,
                  },
                ),
              ),
            );
            assert.deepEqual(failures, []);
            const paints = outcomes.reduce(
              (sum, outcome) =>
                sum +
                outcome.statistics.roots.reduce(
                  (sum, root) => sum + root.paints,
                  0,
                ),
              0,
            );
            const restored = outcomes.reduce(
              (sum, outcome) =>
                sum +
                outcome.statistics.roots.reduce(
                  (sum, root) => sum + root.restores,
                  0,
                ),
              0,
            );
            assert.equal(paints, variant === "static" ? 1 : 2);
            assert.equal(restored, paints * 3);
            assert.equal(store.statistics.publishedSurfaces, paints);
            assert.equal(
              outcomes.reduce(
                (sum, outcome) => sum + outcome.nativeProviderPaints,
                0,
              ),
              variant === "coverage" ? 2 : 1,
            );
            assert.equal(
              outcomes.reduce(
                (sum, outcome) =>
                  sum + outcome.independent.independentSurfacePaints,
                0,
              ),
              0,
            );
            assert.ok(
              outcomes.every((outcome) =>
                outcome.statistics.roots.every((root) => root.fallbacks === 0),
              ),
            );
            roots.push({
              backend,
              alpha,
              software,
              variant,
              outcomes,
              store: store.statistics,
            });
          } finally {
            brokers.delete(id);
            await store.dispose();
          }
        }
  const prefixes = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const alpha of [false, true])
      for (const software of [false, true])
        for (const variant of [
          "closed",
          "mixed-batch",
          "upstream",
          "late",
          "changing-provider",
          "linear",
        ] as const) {
          const id = `prefixes-${backend}-${alpha}-${software}-${variant}`;
          const credentials = workers.map(() => randomUUID());
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
            const outcomes: PrefixOutcome[] = await Promise.all(
              workers.map(({ page }, worker) =>
                page.evaluate(
                  async (options) => {
                    const url =
                      "/tests/helpers/composition-prefix-reference.ts";
                    return (
                      (await import(url)) as typeof PrefixChecks
                    ).checkSharedCompositionPrefixes(options);
                  },
                  {
                    backend,
                    alpha,
                    software,
                    variant,
                    worker,
                    credential: credentials[worker]!,
                    scopeKey,
                    baseUrl: `/_surface/${id}`,
                  },
                ),
              ),
            );
            assert.deepEqual(failures, []);
            for (const outcome of outcomes) {
              const measured = outcome.submissionStatistics;
              assert.equal(measured.scope, "synchronous-submission-wall-time");
              assert.ok(measured.spans.some((span) => span.phase === "frame"));

              assert.ok(
                measured.spans.some((span) =>
                  span.members.some((member) => member.layer === "moving"),
                ),
              );
              assert.ok(
                measured.spans.every(
                  (span) =>
                    span.inclusiveMs >= span.exclusiveMs &&
                    span.exclusiveMs >= 0 &&
                    span.failures === 0,
                ),
              );
              assert.ok(
                Math.abs(
                  measured.byLayerType.reduce(
                    (sum, row) => sum + row.submissionWallMs,
                    0,
                  ) - measured.exclusiveMs,
                ) < 1e-6,
              );
            }
            assert.ok(
              outcomes.some((outcome) =>
                outcome.submissionStatistics.spans.some(
                  (span) => span.phase === "preparation",
                ),
              ),
            );
            const phases = outcomes.flatMap(
              (outcome) => outcome.statistics.roots,
            );
            assert.equal(
              store.statistics.publishedSurfaces,
              phases.reduce((sum, phase) => sum + phase.paints, 0),
            );
            assert.equal(
              store.statistics.hits,
              phases.reduce((sum, phase) => sum + phase.restores, 0),
            );
            const nativePaints = outcomes.reduce(
              (sum, outcome) => sum + outcome.nativeProviderPaints,
              0,
            );
            const reusable =
              variant === "closed" ||
              variant === "late" ||
              variant === "linear" ||
              (variant === "mixed-batch" && backend === "canvas2d");
            if (reusable) {
              assert.equal(
                nativePaints,
                1,
                "The actual static native provider paints once globally",
              );
              assert.ok(
                phases.some(
                  (phase) => phase.phase === "prefix" && phase.paints === 1,
                ),
              );
              assert.ok(
                phases
                  .filter((phase) => phase.phase === "prefix")
                  .every((phase) => phase.fallbacks === 0),
              );
            } else {
              assert.ok(
                nativePaints > 1,
                "Changing closures and whole mixed batches retain original painting",
              );
              if (variant === "mixed-batch")
                assert.equal(
                  phases.filter((phase) => phase.phase === "prefix").length,
                  0,
                );
              if (variant === "changing-provider")
                assert.ok(
                  phases.some(
                    (phase) => phase.phase === "prefix" && phase.fallbacks > 0,
                  ),
                );
            }
            prefixes.push({
              backend,
              alpha,
              software,
              variant,
              outcomes,
              store: store.statistics,
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
  const nativeRoots = await workers[0]!.page.evaluate(async () => {
    const url = "/tests/helpers/composition-root-reference.ts";
    return ((await import(url)) as typeof RootChecks).checkNativeRootStorage();
  });
  const protectedRoots = await workers[0]!.page.evaluate(async () => {
    const url = "/tests/helpers/composition-root-reference.ts";
    return (
      (await import(url)) as typeof RootChecks
    ).checkRootPreparationFailures();
  });
  const memoryPrimitives = await workers[0]!.page.evaluate(async () => {
    const url = "/tests/helpers/composition-memory-reference.ts";
    return (
      (await import(url)) as typeof MemoryChecks
    ).checkManagedMemoryPrimitives();
  });
  const directory = join(root, "benchmarks/results/composition-ce15-surfaces");
  await mkdir(directory, { recursive: true });
  const result = {
    status: "passed",
    environments,
    surfaceCases: reports.length,
    sourceCases: sources.length,
    rootCases: roots.length,
    prefixCases: prefixes.length,
    cases: reports.length + sources.length + roots.length + prefixes.length,
    sourceFrameChecks: sources.reduce(
      (sum, report) =>
        sum +
        report.outcomes.reduce(
          (count, outcome) => count + outcome.frameChecks,
          0,
        ),
      0,
    ),
    frameChecks: [...reports, ...sources, ...roots, ...prefixes].reduce(
      (sum, report) =>
        sum +
        report.outcomes.reduce(
          (count, outcome) => count + outcome.frameChecks,
          0,
        ),
      0,
    ),
    sources,
    roots,
    prefixes,
    floating,
    nativeStorage,
    protectedPreparation,
    protectedSources,
    nativeRoots,
    protectedRoots,
    memoryPrimitives,
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
