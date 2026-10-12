import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  realpath,
  access,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { createServer } from "vite";
import {
  compileMechanismCueProject,
  renderMechanismCueProject,
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
  loadComposition,
} from "@still-shift/animation-engine";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import {
  prepareMechanismCueNativePlates,
  checkMechanismCueNativePlates,
} from "../../packages/animation-engine/src/mechanism/cue-native-plates.ts";
import {
  renderMechanismCuePlateProject,
  checkMechanismCuePlateOutput,
} from "../../packages/animation-engine/src/mechanism/cue-plate-lifecycle.ts";
import { createWorldCueProject } from "../helpers/mechanism-world-cue-project.ts";
import { displayInk } from "../helpers/mechanism-world-annotations-browser.ts";
import { encodedWorldInkProof } from "../helpers/mechanism-encoded-ink.ts";
import { streamingCompositionOutputProof } from "../helpers/composition-streaming-proof.ts";
import { verifyParallelMetrics } from "../helpers/composition-parallel-proof.ts";
import type * as PlateProof from "../helpers/mechanism-cue-plate-browser.ts";
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-world-plate-export-");
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  resolve: {
    alias: [
      {
        find: /^@still-shift\/scene-contract$/,
        replacement: join(root, "packages/scene-contract/src/index.ts"),
      },
    ],
  },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root, directory] } },
});
server.middlewares.use((req, res, next) => {
  if (req.url !== "/proof") return next();
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><html><body></body></html>");
});
await server.listen();
const browser = await launchRenderBrowser(),
  page = await browser.newPage(),
  fixtures: unknown[] = [];
try {
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0] + "proof");
  assertPinnedRenderEnvironment(await probeRenderEnvironment(page));
  for (const route of ["world-text", "surface-marking"] as const)
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const base = join(directory, route, family),
        fixture = await createWorldCueProject(base, family, route),
        prepared = join(base, "compiled"),
        plates = join(base, "plates");
      const compiled = await compileMechanismCueProject(
          fixture.familyPath,
          fixture.cuePath,
          prepared,
        ),
        capture = await prepareMechanismCueNativePlates(
          fixture.familyPath,
          fixture.cuePath,
          prepared,
          plates,
        );
      const nativeSource = JSON.parse(
        await readFile(capture.receipt.nativeSource.path, "utf8"),
      );
      assert.equal(
        nativeSource.layers.filter(
          (l: { native3D?: { role: string } }) =>
            l.native3D?.role === "world-graphic",
        ).length,
        4,
      );
      const direct = await renderMechanismCueProject(
          fixture.familyPath,
          fixture.cuePath,
          prepared,
          join(base, "direct"),
        ),
        first = await renderMechanismCuePlateProject(
          fixture.familyPath,
          fixture.cuePath,
          prepared,
          plates,
          join(base, "cached-first"),
        ),
        repeat = await renderMechanismCuePlateProject(
          fixture.familyPath,
          fixture.cuePath,
          prepared,
          plates,
          join(base, "cached-repeat"),
        ),
        checked = await checkMechanismCuePlateOutput(
          fixture.familyPath,
          fixture.cuePath,
          prepared,
          plates,
          first.outputPath,
        );
      assert.equal(checked.freshNativeSubmissionCalls, 0);
      assert.equal(checked.originalNativeFrames, 60);
      verifyParallelMetrics(first.metrics, 1, false);
      verifyParallelMetrics(repeat.metrics, 1, false);
      const proof = await streamingCompositionOutputProof(
          first.outputPath,
          first.metrics,
        ),
        repeated = await streamingCompositionOutputProof(
          repeat.outputPath,
          repeat.metrics,
        ),
        original = await streamingCompositionOutputProof(
          direct.outputPath,
          direct.metrics,
        );
      assert.deepEqual(proof, repeated);
      assert.equal(proof.decodedAudio, original.decodedAudio);
      const native = await loadComposition(compiled.compositionPath, "webgl2"),
        cached = await loadComposition(
          join(base, "cached-first", "plate-composition.json"),
          "webgl2",
        ),
        ink = displayInk(
          native.composition,
          native.preparedNative3D!,
          "red",
        ) as [number, number, number];
      for (const path of new Set(
        Object.values(cached.assetPaths).map((p) => dirname(p)),
      ))
        server.config.server.fs.allow.push(path, await realpath(path));
      const visual = await page.evaluate(
        async (text) => {
          const input = JSON.parse(text) as {
            native: Parameters<typeof PlateProof.cuePlateBrowserProof>[0];
            nativePaths: Record<string, string>;
            cached: Parameters<typeof PlateProof.cuePlateBrowserProof>[2];
            cachedPaths: Record<string, string>;
            ink: [number, number, number];
          };
          const modulePath = "/tests/helpers/mechanism-cue-plate-browser.ts";
          const module = (await import(modulePath)) as typeof PlateProof;
          return module.cuePlateBrowserProof(
            input.native,
            input.nativePaths,
            input.cached,
            input.cachedPaths,
            input.ink,
          );
        },
        JSON.stringify({
          native: native.scene,
          nativePaths: native.assetPaths,
          cached: cached.scene,
          cachedPaths: cached.assetPaths,
          ink,
        }),
      );
      const previewPngs = [];
      for (const sample of visual.sampledPngs) {
        const path = join(base, "cached-frame-" + sample.frame + ".png");
        await writeFile(path, Buffer.from(sample.png.split(",")[1]!, "base64"));
        previewPngs.push({ frame: sample.frame, path });
      }
      const encodedInk = await encodedWorldInkProof(
        first.outputPath,
        first.metrics.width,
        first.metrics.height,
        60,
        ink,
      );
      const current = await readMechanismCueAuthoring(
          fixture.instance,
          fixture.cuePath,
        ),
        { id, ...value } = current.document.cues[0]!.worldAnnotations![0]!;
      await patchMechanismCueAuthoring(fixture.instance, fixture.cuePath, {
        schemaVersion: "mechanism-cue-patch-1",
        baseRevision: current.document.revision,
        baseHash: current.projectHash,
        operations: current.document.cues.map((cue) => ({
          cue: cue.id,
          annotation: id,
          property: "world-annotation" as const,
          value: { ...value, ink: "#00ff00" },
        })),
      });
      const changed = join(base, "changed-compiled");
      await compileMechanismCueProject(
        fixture.familyPath,
        fixture.cuePath,
        changed,
      );
      await assert.rejects(
        checkMechanismCueNativePlates(
          fixture.familyPath,
          fixture.cuePath,
          changed,
          plates,
        ),
        /native picture/i,
      );
      const rejectedDirectory = join(base, "forbidden-old-plate");
      await assert.rejects(
        renderMechanismCuePlateProject(
          fixture.familyPath,
          fixture.cuePath,
          changed,
          plates,
          rejectedDirectory,
        ),
        /native picture/i,
      );
      await assert.rejects(access(rejectedDirectory));
      fixtures.push({
        route,
        family,
        compiled,
        capture,
        direct,
        first,
        repeat,
        checked,
        proof,
        original,
        visual: { ...visual, sampledPngs: previewPngs },
        encodedInk,
        worldInkEditInvalidatesOriginalPlate: true,
        noRejectedOwnedDirectory: true,
        surface: fixture.surface,
      });
      await writeFile(
        join(directory, "progress.json"),
        JSON.stringify({ status: "running", fixtures }, null, 2) + "\n",
      );
    }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify({ status: "passed", fixtures }, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify({ status: "passed", directory }) + "\n");
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      { status: "failed", error: String(error), fixtures },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
