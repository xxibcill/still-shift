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
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as PlateProof from "../helpers/mechanism-cue-plate-browser.ts";
import {
  loadComposition,
  compileMechanismCueProject,
  renderMechanismCueProject,
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
} from "@still-shift/animation-engine";
import { createVisibleCueProject } from "../helpers/mechanism-visible-cues.ts";
import { prepareMechanismCueNativePlates } from "../../packages/animation-engine/src/mechanism/cue-native-plates.ts";
import {
  renderMechanismCuePlateProject,
  checkMechanismCuePlateOutput,
} from "../../packages/animation-engine/src/mechanism/cue-plate-lifecycle.ts";
import {
  parallelOutputProof,
  parallelChecksum,
  verifyParallelMetrics,
} from "../helpers/composition-parallel-proof.ts";
const directory = await mkdtemp(
  "/private/tmp/still-shift-ms2-cue-plate-export-",
);
const root = resolve(import.meta.dirname, "../..");
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
  if (req.url !== "/plate-proof") return next();
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><html><body></body></html>");
});
await server.listen();
const browser = await launchRenderBrowser(),
  page = await browser.newPage();
const families: unknown[] = [];
const started = new Date().toISOString();
try {
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0] + "plate-proof");
  assertPinnedRenderEnvironment(await probeRenderEnvironment(page));
  for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
    const base = join(directory, family),
      fixture = await createVisibleCueProject(base, family),
      prepared = join(base, "compiled"),
      plates = join(base, "plates");
    await compileMechanismCueProject(
      fixture.familyPath,
      fixture.cuePath,
      prepared,
    );
    const capture = await prepareMechanismCueNativePlates(
      fixture.familyPath,
      fixture.cuePath,
      prepared,
      plates,
    );
    const stages: unknown[] = [];
    let beforeOutput = "",
      beforeAudio = "";
    const abortedDirectory = join(base, "aborted-cache");
    const controller = new AbortController(),
      reason = new Error("cached-pre-abort");
    controller.abort(reason);
    await assert.rejects(
      renderMechanismCuePlateProject(
        fixture.familyPath,
        fixture.cuePath,
        prepared,
        plates,
        abortedDirectory,
        { signal: controller.signal },
      ),
      (error) => error === reason,
    );
    await assert.rejects(access(abortedDirectory));
    for (const stage of ["before", "edited"] as const) {
      let currentPrepared = prepared;
      if (stage === "edited") {
        const current = await readMechanismCueAuthoring(
          fixture.instance,
          fixture.cuePath,
        );
        await patchMechanismCueAuthoring(fixture.instance, fixture.cuePath, {
          schemaVersion: "mechanism-cue-patch-1",
          baseRevision: current.document.revision,
          baseHash: current.projectHash,
          operations: [
            { cue: "contact", property: "caption", value: "Here" },
            {
              cue: "contact",
              sound: "tick",
              property: "sound-gain",
              value: -6,
            },
          ],
        });
        currentPrepared = join(base, "edited-compiled");
        await compileMechanismCueProject(
          fixture.familyPath,
          fixture.cuePath,
          currentPrepared,
        );
      }
      if (stage === "edited")
        await assert.rejects(
          checkMechanismCuePlateOutput(
            fixture.familyPath,
            fixture.cuePath,
            prepared,
            plates,
            beforeOutput,
          ),
        );
      const direct = await renderMechanismCueProject(
        fixture.familyPath,
        fixture.cuePath,
        currentPrepared,
        join(base, stage + "-direct"),
      );
      const first = await renderMechanismCuePlateProject(
        fixture.familyPath,
        fixture.cuePath,
        currentPrepared,
        plates,
        join(base, stage + "-cached-first"),
      );
      const repeat = await renderMechanismCuePlateProject(
        fixture.familyPath,
        fixture.cuePath,
        currentPrepared,
        plates,
        join(base, stage + "-cached-repeat"),
      );
      const checked = await checkMechanismCuePlateOutput(
        fixture.familyPath,
        fixture.cuePath,
        currentPrepared,
        plates,
        first.outputPath,
      );
      if (stage === "before") beforeOutput = first.outputPath;
      const controls: string[] = [];
      const sidecarBody = await readFile(first.receiptPath),
        sidecar = JSON.parse(sidecarBody.toString());
      for (const key of [
        "currentCompilation",
        "currentSource",
        "loweredSource",
        "originalPlateReceipt",
        "sceneManifest",
        "renderResult",
        "output",
      ]) {
        const path = sidecar[key].path,
          originalBody = await readFile(path);
        try {
          await writeFile(
            path,
            Buffer.concat([originalBody, Buffer.from(" ")]),
          );
          await assert.rejects(
            checkMechanismCuePlateOutput(
              fixture.familyPath,
              fixture.cuePath,
              currentPrepared,
              plates,
              first.outputPath,
            ),
          );
          controls.push(key);
        } finally {
          await writeFile(path, originalBody);
        }
      }
      try {
        await writeFile(
          first.receiptPath,
          JSON.stringify({
            ...sidecar,
            nativePictureSha256: "sha256:" + "0".repeat(64),
          }) + "\n",
        );
        await assert.rejects(
          checkMechanismCuePlateOutput(
            fixture.familyPath,
            fixture.cuePath,
            currentPrepared,
            plates,
            first.outputPath,
          ),
        );
        controls.push("receipt-native-picture");
      } finally {
        await writeFile(first.receiptPath, sidecarBody);
      }
      const resultBody = await readFile(sidecar.renderResult.path);
      for (const control of ["fresh-native-counter", "missing-measurements"]) {
        try {
          const forged = JSON.parse(resultBody.toString());
          if (control === "missing-measurements")
            delete forged.metrics.compositionStatistics;
          else {
            const native = {
              phase: "render",
              type: "native-depth",
              calls: 1,
              submissionWallMs: 0,
            };
            forged.metrics.work.workersDetail[0].result.renderStatistics.byLayerType.push(
              native,
            );
            forged.metrics.compositionStatistics.workers[0].render.byLayerType.push(
              native,
            );
            forged.metrics.compositionStatistics.byLayerType.push({
              ...native,
              submissionWallMsPerOutputFrame: 0,
            });
            forged.metrics.work.submissionStatistics.byLayerType.push({
              ...native,
              submissionWallMsPerOutputFrame: 0,
            });
          }
          const body = Buffer.from(JSON.stringify(forged) + "\n");
          await writeFile(sidecar.renderResult.path, body);
          await writeFile(
            first.receiptPath,
            JSON.stringify({
              ...sidecar,
              renderResult: {
                ...sidecar.renderResult,
                bytes: body.length,
                sha256: parallelChecksum(body),
              },
            }) + "\n",
          );
          await assert.rejects(
            checkMechanismCuePlateOutput(
              fixture.familyPath,
              fixture.cuePath,
              currentPrepared,
              plates,
              first.outputPath,
            ),
          );
          controls.push(control);
        } finally {
          await writeFile(sidecar.renderResult.path, resultBody);
          await writeFile(first.receiptPath, sidecarBody);
        }
      }
      await checkMechanismCuePlateOutput(
        fixture.familyPath,
        fixture.cuePath,
        currentPrepared,
        plates,
        first.outputPath,
      );
      verifyParallelMetrics(first.metrics, 1, false);
      verifyParallelMetrics(repeat.metrics, 1, false);
      assert.equal(checked.freshNativeSubmissionCalls, 0);
      assert.equal(checked.originalNativeFrames, 60);
      assert.equal(checked.reusedPlateFrames, 60);
      const proof = await parallelOutputProof(first.outputPath, first.metrics),
        repeated = await parallelOutputProof(repeat.outputPath, repeat.metrics),
        original = await parallelOutputProof(direct.outputPath, direct.metrics);
      assert.deepEqual(proof, repeated);
      assert.equal(proof.decodedAudio, original.decodedAudio);
      if (stage === "before") beforeAudio = proof.decodedAudio!;
      else
        assert.notEqual(
          proof.decodedAudio,
          beforeAudio,
          "Gain edit must change the actual decoded soundtrack while matching the current direct export",
        );
      assert.equal(
        checked.nativePictureSha256,
        capture.receipt.nativePictureSha256,
      );
      assert.equal(checked.sequenceSha256, capture.receipt.sequence.sha256);
      const nativeLoaded = await loadComposition(
          join(currentPrepared, "composition.json"),
          "webgl2",
        ),
        plateLoaded = await loadComposition(
          join(base, stage + "-cached-first", "plate-composition.json"),
          "webgl2",
        );
      const allowed = new Set(
        Object.values(plateLoaded.assetPaths).map((p) => dirname(p)),
      );
      for (const path of allowed)
        server.config.server.fs.allow.push(path, await realpath(path));
      const visual = await page.evaluate(
        async (inputJson: string) => {
          const input = JSON.parse(inputJson) as {
            modulePath: string;
            nativeScene: Parameters<typeof PlateProof.cuePlateBrowserProof>[0];
            nativePaths: Record<string, string>;
            plateScene: Parameters<typeof PlateProof.cuePlateBrowserProof>[2];
            platePaths: Record<string, string>;
          };
          const module = (await import(input.modulePath)) as typeof PlateProof;
          return module.cuePlateBrowserProof(
            input.nativeScene,
            input.nativePaths,
            input.plateScene,
            input.platePaths,
          );
        },
        JSON.stringify({
          modulePath: "/tests/helpers/mechanism-cue-plate-browser.ts",
          nativeScene: nativeLoaded.scene,
          nativePaths: nativeLoaded.assetPaths,
          plateScene: plateLoaded.scene,
          platePaths: plateLoaded.assetPaths,
        }),
      );
      for (const sample of visual.sampledPngs)
        await writeFile(
          join(base, stage + "-cached-frame-" + sample.frame + ".png"),
          Buffer.from(sample.png.split(",")[1]!, "base64"),
        );
      stages.push({
        stage,
        controls,
        direct,
        first,
        repeat,
        checked,
        proof,
        original,
        visual: {
          ...visual,
          sampledPngs: visual.sampledPngs.map((s) => ({
            frame: s.frame,
            path: join(base, stage + "-cached-frame-" + s.frame + ".png"),
          })),
        },
      });
    }
    families.push({ family, capture, stages });
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify({ status: "passed", started, families }, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify({ status: "passed", directory }) + "\n");
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      { status: "failed", error: String(error), families },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
