import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, realpath } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { promisify } from "node:util";
import { createServer } from "vite";
import {
  compileMechanismCueProject,
  prepareMechanismCueNativePlates,
  checkMechanismCueNativePlates,
  renderMechanismCuePlateProject,
  checkMechanismCuePlateOutput,
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
  loadComposition,
  MechanismCueNativePlatesSchema,
  MECHANISM_CUE_NATIVE_PLATES_VERSION,
} from "@still-shift/animation-engine";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
import { createVisibleCueProject } from "../helpers/mechanism-visible-cues.ts";
import {
  parallelOutputProof,
  parallelChecksum,
  verifyParallelMetrics,
} from "../helpers/composition-parallel-proof.ts";
import type * as PlateProof from "../helpers/mechanism-cue-plate-browser.ts";
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-public-cue-cache-");
const execute = promisify(execFile);
async function cli(args: string[], expectedCode = 0) {
  let stdout = "",
    stderr = "",
    code = 0;
  try {
    const result = await execute(
      process.execPath,
      [
        "--import",
        "tsx",
        "tools/still-shift-cli/src/cli.ts",
        "episode",
        ...args,
      ],
      { cwd: root, maxBuffer: 65536, timeout: 180000 },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const failure = error as {
      code?: unknown;
      stdout?: string;
      stderr?: string;
    };
    if (typeof failure.code !== "number") throw error;
    code = failure.code;
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
  }
  assert.equal(code, expectedCode, stderr);
  assert.ok(Buffer.byteLength(stdout) <= 32768);
  const receipt = MechanismCommandReceiptSchema.parse(JSON.parse(stdout));
  assert.equal(receipt.status, expectedCode === 0 ? "passed" : "failed");
  return { code, receipt };
}
process.stdout.write(JSON.stringify({ status: "running", directory }) + "\n");
const fixture = await createVisibleCueProject(
    join(directory, "project"),
    "tape-hook",
  ),
  prepared = join(directory, "compiled"),
  plates = join(directory, "plates"),
  stages: unknown[] = [];
const compiled = await compileMechanismCueProject(
  fixture.familyPath,
  fixture.cuePath,
  prepared,
);
const flags = [
  "--authoring",
  "cue",
  "--family-input",
  fixture.familyPath,
  "--input",
  fixture.cuePath,
];
const capture = await cli([
  "prepare",
  ...flags,
  "--prepared-dir",
  prepared,
  "--plates-dir",
  plates,
]);
assert.equal(
  capture.receipt.summary.schemaVersion,
  "mechanism-cue-native-plate-capture-result-1",
);
const originalReceipt = await readFile(join(plates, "native-plates.json")),
  plateReceipt = MechanismCueNativePlatesSchema.parse(
    JSON.parse(originalReceipt.toString()),
  );
assert.equal(plateReceipt.schemaVersion, MECHANISM_CUE_NATIVE_PLATES_VERSION);
const original = await checkMechanismCueNativePlates(
  fixture.familyPath,
  fixture.cuePath,
  prepared,
  plates,
);
assert.equal(original.originalNativeFrames, 60);
const nativeCheck = await cli([
  "check",
  ...flags,
  "--prepared-dir",
  prepared,
  "--plates-dir",
  plates,
]);
assert.equal(nativeCheck.receipt.summary.originalNativeFrames, 60);
await assert.rejects(
  prepareMechanismCueNativePlates(
    fixture.familyPath,
    fixture.cuePath,
    prepared,
    plates,
  ),
  /exists|EEXIST/,
);
assert.deepEqual(
  await readFile(join(plates, "native-plates.json")),
  originalReceipt,
);
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
  page = await browser.newPage();
let priorOutput = "",
  priorAudio = "";
try {
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0] + "proof");
  assertPinnedRenderEnvironment(await probeRenderEnvironment(page));
  for (const stage of ["before", "edited"] as const) {
    let currentPrepared = prepared,
      currentCompiled = compiled;
    const staleControls: unknown[] = [];
    if (stage === "edited") {
      const current = await readMechanismCueAuthoring(
          fixture.instance,
          fixture.cuePath,
        ),
        mark = current.document.cues.find((c) => c.id === "contact")!
          .annotations![0]!,
        { id, ...annotation } = mark;
      await patchMechanismCueAuthoring(fixture.instance, fixture.cuePath, {
        schemaVersion: "mechanism-cue-patch-1",
        baseRevision: current.document.revision,
        baseHash: current.projectHash,
        operations: [
          {
            cue: "contact",
            annotation: id,
            property: "annotation",
            value: { ...annotation, text: "Here" },
          },
          { cue: "contact", sound: "tick", property: "sound-gain", value: -6 },
        ],
      });
      currentPrepared = join(directory, "edited-compiled");
      currentCompiled = await compileMechanismCueProject(
        fixture.familyPath,
        fixture.cuePath,
        currentPrepared,
      );
      await assert.rejects(
        checkMechanismCuePlateOutput(
          fixture.familyPath,
          fixture.cuePath,
          prepared,
          plates,
          priorOutput,
        ),
      );
      const staleCompiled = await cli(
        [
          "check",
          ...flags,
          "--prepared-dir",
          prepared,
          "--plates-dir",
          plates,
          "--final-output",
          priorOutput,
        ],
        2,
      );
      const staleOutput = await cli(
        [
          "check",
          ...flags,
          "--prepared-dir",
          currentPrepared,
          "--plates-dir",
          plates,
          "--final-output",
          priorOutput,
        ],
        2,
      );
      assert.equal(staleCompiled.receipt.status, "failed");
      assert.equal(staleOutput.receipt.status, "failed");
      staleControls.push(
        { kind: "old-compilation", ...staleCompiled },
        { kind: "old-output-current-compilation", ...staleOutput },
      );
    }
    const first = await renderMechanismCuePlateProject(
      fixture.familyPath,
      fixture.cuePath,
      currentPrepared,
      plates,
      join(directory, stage + "-api"),
    );
    verifyParallelMetrics(first.metrics, 1, false);
    assert.equal(first.freshNativeSubmissionCalls, 0);
    const repeated = await cli([
      "render",
      ...flags,
      "--prepared-dir",
      currentPrepared,
      "--plates-dir",
      plates,
      "--output-dir",
      join(directory, stage + "-cli"),
    ]);
    assert.equal(repeated.receipt.summary.freshNativeSubmissionCalls, 0);
    assert.equal(repeated.receipt.summary.originalNativeFrames, 60);
    const repeatOutput = join(directory, stage + "-cli/output.mp4"),
      repeatResult = JSON.parse(
        await readFile(repeatOutput + ".result.json", "utf8"),
      );
    verifyParallelMetrics(repeatResult.metrics, 1, false);
    const checked = await checkMechanismCuePlateOutput(
      fixture.familyPath,
      fixture.cuePath,
      currentPrepared,
      plates,
      first.outputPath,
    );
    const cliCheck = await cli([
      "check",
      ...flags,
      "--prepared-dir",
      currentPrepared,
      "--plates-dir",
      plates,
      "--final-output",
      repeatOutput,
    ]);
    assert.equal(cliCheck.receipt.summary.freshNativeSubmissionCalls, 0);
    const proof = await parallelOutputProof(first.outputPath, first.metrics),
      repeatProof = await parallelOutputProof(
        repeatOutput,
        repeatResult.metrics,
      );
    assert.deepEqual(proof, repeatProof);
    if (stage === "edited") assert.notEqual(proof.decodedAudio, priorAudio);
    const native = await loadComposition(
        currentCompiled.compositionPath,
        "webgl2",
      ),
      cached = await loadComposition(
        join(directory, stage + "-api/plate-composition.json"),
        "webgl2",
      );
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
        };
        const path = "/tests/helpers/mechanism-cue-plate-browser.ts",
          module = (await import(path)) as typeof PlateProof;
        return module.cuePlateBrowserProof(
          input.native,
          input.nativePaths,
          input.cached,
          input.cachedPaths,
        );
      },
      JSON.stringify({
        native: native.scene,
        nativePaths: native.assetPaths,
        cached: cached.scene,
        cachedPaths: cached.assetPaths,
      }),
    );
    const previewPngs = [];
    for (const sample of visual.sampledPngs) {
      const path = join(directory, stage + "-frame-" + sample.frame + ".png");
      await writeFile(path, Buffer.from(sample.png.split(",")[1]!, "base64"));
      previewPngs.push({ frame: sample.frame, path });
    }
    assert.deepEqual(
      await readFile(join(plates, "native-plates.json")),
      originalReceipt,
    );
    assert.equal(
      (
        await checkMechanismCueNativePlates(
          fixture.familyPath,
          fixture.cuePath,
          currentPrepared,
          plates,
        )
      ).sequenceSha256,
      plateReceipt.sequence.sha256,
    );
    stages.push({
      stage,
      staleControls,
      currentCompiled,
      first,
      repeated,
      checked,
      cliCheck,
      proof,
      visual: { ...visual, sampledPngs: previewPngs },
      originalReceiptUnchanged: true,
    });
    priorOutput = first.outputPath;
    priorAudio = proof.decodedAudio!;
    await writeFile(
      join(directory, "progress.json"),
      JSON.stringify(
        { status: "running", capture, original, nativeCheck, stages },
        null,
        2,
      ) + "\n",
    );
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        capture,
        original,
        nativeCheck,
        originalReceiptSha256: parallelChecksum(originalReceipt),
        stages,
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(JSON.stringify({ status: "passed", directory }) + "\n");
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      { status: "failed", error: String(error), capture, stages },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
