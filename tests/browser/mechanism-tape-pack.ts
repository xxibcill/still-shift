import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  CompositionSchema,
  NativeObservedOutputFrameV2Schema,
} from "@still-shift/scene-contract";
import {
  createTapeHookPack,
  inspectTapeHookPack,
  renderComposition,
  loadComposition,
} from "@still-shift/animation-engine";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { createNativeObservationRequestVersions } from "../../packages/animation-engine/src/native-observation.ts";
import {
  isNativeObservationRequestV2,
  verifyNativeObservationClosureV2,
} from "@still-shift/execution-runtime/export";
import { assertNativeObservedFrameV2 } from "../../packages/renderer-core/src/native3d/observed-validation-v2.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { compositionWorkerMemoryLimits } from "../../packages/execution-runtime/src/composition-export-memory.ts";
import type * as Proof from "../helpers/mechanism-tape-pack-preview.ts";
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-tape-pack-");
const fontPath = join(root, "assets/story-motion/fonts/plex-sans-semibold.ttf"),
  fontBytes = await readFile(fontPath),
  fontRequirement = inspectTapeHookPack().pack.compatibility.textureFont!;
assert.equal(hash(fontBytes), fontRequirement.sha256);
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
  server: { host: "127.0.0.1", port: 0 },
});
server.middlewares.use((req, res, next) => {
  if (req.url !== "/tape-pack-proof") return next();
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><html><body></body></html>");
});
let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
const fixtures = [];
try {
  await server.listen();
  browser = await launchRenderBrowser();
  const page = await browser.newPage();
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0]! + "tape-pack-proof");
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  await writeFile(
    join(directory, "metadata.json"),
    JSON.stringify(inspectTapeHookPack(), null, 2) + "\n",
    { flag: "wx" },
  );
  for (const [index, parameters] of [
    { hookThickness: 0.18, bladeLength: 10, bladeWidth: 2 },
    { hookThickness: 0.26, bladeLength: 14, bladeWidth: 2.5 },
  ].entries()) {
    const instance = createTapeHookPack({ parameters }),
      name = `dimension-${index}`,
      sourceBytes = JSON.stringify(instance.scene, null, 2) + "\n",
      sourcePath = join(directory, name + ".json");
    await writeFile(sourcePath, sourceBytes, { flag: "wx" });
    const h = parameters.hookThickness;
    const composition = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: `tape-pack-${index}`,
      width: 320,
      height: 180,
      fps: 30,
      frameCount: 9,
      assets: [
        {
          id: "tape",
          type: "native3d",
          path: name + ".json",
          sha256: hash(sourceBytes),
          format: "mechanism-scene-2",
          textureFont: "graduations-font",
        },
        {
          id: "graduations-font",
          type: "font",
          path: fontPath,
          sha256: fontRequirement.sha256,
          weight: fontRequirement.weight,
        },
      ],
      layers: [
        {
          id: "pull",
          type: "native3d",
          asset: "tape",
          inPoint: 0,
          outPoint: 3,
          sourceStartFrame: 0,
          sourceFps: 30,
          rigControls: { slider: { type: "slider", value: 0 } },
          partOverrides: { wall: { visible: false } },
        },
        {
          id: "travel",
          type: "native3d",
          asset: "tape",
          startFrame: 3,
          inPoint: 3,
          outPoint: 6,
          sourceStartFrame: 0,
          sourceFps: 30,
          rigControls: {
            slider: {
              type: "slider",
              keys: [
                { frame: 0, value: 0 },
                { frame: 2, value: h },
              ],
            },
          },
          partOverrides: {
            board: { visible: false },
            wall: { visible: false },
          },
        },
        {
          id: "push",
          type: "native3d",
          asset: "tape",
          startFrame: 6,
          inPoint: 6,
          outPoint: 9,
          sourceStartFrame: 0,
          sourceFps: 30,
          rigControls: { slider: { type: "slider", value: h } },
          partOverrides: { board: { visible: false } },
        },
      ],
    });
    const compositionPath = join(directory, name + ".composition.json");
    await writeFile(
      compositionPath,
      JSON.stringify(composition, null, 2) + "\n",
      { flag: "wx" },
    );
    const loaded = await loadComposition(compositionPath, "webgl2"),
      binding = await createNativeObservationRequestVersions(loaded);
    assert.ok(binding && isNativeObservationRequestV2(binding));
    const serialized = await page.evaluate(
      async (text) => {
        const path = "/tests/helpers/mechanism-tape-pack-preview.ts",
          proof = (await import(path)) as typeof Proof;
        const args = JSON.parse(text) as Parameters<
          typeof proof.tapePackPreview
        >;
        return JSON.stringify(await proof.tapePackPreview(...args));
      },
      JSON.stringify([
        loaded.composition,
        loaded.preparedNative3D!,
        loaded.nativeAppearanceCodeIdentity!,
      ]),
    );
    const proof = JSON.parse(serialized) as Awaited<
        ReturnType<typeof Proof.tapePackPreview>
      >,
      captures = [];
    const seen = new Map<number, string>();
    for (const [i, capture] of proof.captures.entries()) {
      const bytes = Buffer.from(capture.rgba),
        sha256 = hash(bytes);
      assert.equal(bytes.length, 320 * 180 * 4);
      assert.ok(bytes.some((v, at) => at % 4 !== 3 && v !== bytes[0]));
      if (seen.has(capture.frame))
        assert.equal(sha256, seen.get(capture.frame));
      else seen.set(capture.frame, sha256);
      const packet = NativeObservedOutputFrameV2Schema.parse({
        version: "native3d-observed-output-frame-2",
        outputFrame: capture.frame,
        executionSha256: hash(canonicalMechanismJson(binding.execution)),
        passes: capture.report.nativeObservationsV2,
      });
      const expected = binding.expectedPasses(capture.frame);
      assert.equal(packet.passes.length, expected.length);
      assert.equal(packet.passes.length, 1);
      const pass = expected[0]!,
        actual = packet.passes[0]!;
      assert.equal(pass.version, "native3d-frame-2");
      assert.equal(actual.observed.version, "native3d-observed-frame-2");
      assert.equal(actual.sampleFrame, pass.sampleFrame);
      if (
        pass.version !== "native3d-frame-2" ||
        actual.observed.version !== "native3d-observed-frame-2"
      )
        throw Error("Missing tape frame2");
      await assertNativeObservedFrameV2(
        pass.variant,
        pass.reference,
        actual.observed,
        pass.appearanceCodeSha256,
      );
      for (const relation of Object.values(pass.reference.frame.relationships))
        assert(
          relation.residual <= relation.tolerance,
          `Tape relation failed ${relation.id}`,
        );
      const state = pass.reference.frame.rigs.slider;
      assert(state?.type === "slider");
      if (capture.frame >= 3 && capture.frame < 6)
        assert(
          Math.abs(state.position - ((capture.frame - 3) * h) / 2) < 1e-12,
          "Travel controller must sample its own local source clock",
        );
      const png = Buffer.from(capture.png.split(",")[1]!, "base64");
      await writeFile(join(directory, `${name}-preview-${i}.png`), png, {
        flag: "wx",
      });
      await writeFile(join(directory, `${name}-preview-${i}.rgba`), bytes, {
        flag: "wx",
      });
      captures.push({ frame: capture.frame, sha256, packet });
    }
    const outputs = [];
    for (const suffix of ["a", "b"]) {
      const result = await renderComposition({
        compositionPath,
        outputPath: join(directory, `${name}-${suffix}.mp4`),
        backend: "webgl2",
        transport: "raw_rgba",
      });
      const closure = result.metrics.nativeObservations;
      assert(closure?.version === "native-observation-closure-2");
      assert.equal(closure.outputFrames, 9);
      assert.equal(closure.passCount, 9);
      assert.equal(
        result.checksums.output,
        hash(await readFile(result.outputPath)),
      );
      // This independent replay uses the same bounded metadata partition as
      // the normal exporter. The standalone verifier's 16 MiB default remains.
      const memory = new ManagedMemory({
        pixels: 1,
        metadata: compositionWorkerMemoryLimits(1).metadata,
      });
      try {
        const verified = await verifyNativeObservationClosureV2({
          closure,
          execution: binding.execution,
          expectedPasses: binding.expectedPasses,
          reserve: (bytes) => memory.reserve("metadata", bytes),
          output: {
            sha256: result.checksums.output,
            frameCount: 9,
            width: 320,
            height: 180,
            transport: "raw_rgba",
          },
        });
        assert.equal(verified.passCount, 9);
        assert.equal(memory.statistics.current.metadata, 0);
        assert.equal(memory.statistics.reservations, 0);
        outputs.push({ ...result, independentReplayMemory: memory.statistics });
      } finally {
        memory.dispose();
      }
    }
    assert.equal(
      outputs[0]!.checksums.output,
      outputs[1]!.checksums.output,
      "Repeated native tape fixture final exports must be byte-identical",
    );
    fixtures.push({
      name,
      parameters,
      pack: instance.pack,
      meshDataSha256: instance.meshDataSha256,
      captures,
      outputs,
    });
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "two-tape-dimension-candidates-actual-native2-preview-and-repeated-final-export",
        environment,
        fixtures,
        supportedPacks: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({
      directory,
      status: "passed",
      dimensions: 2,
      previewCaptures: 18,
      finalExports: 4,
    }) + "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fixtures,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stderr.write(
    JSON.stringify({
      directory,
      status: "failed",
      completedDimensions: fixtures.length,
    }) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
