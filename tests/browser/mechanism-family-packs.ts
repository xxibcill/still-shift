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
  compileMechanismPackTimeline,
  sampleMechanismPackTimeline,
  createCableTiePack,
  inspectCableTiePack,
  createClothespegPack,
  inspectClothespegPack,
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
import type * as Proof from "../helpers/mechanism-family-pack-preview.ts";
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-family-packs-");
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
  if (req.url !== "/family-pack-proof") return next();
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
  await page.goto(server.resolvedUrls!.local[0]! + "family-pack-proof");
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const specifications = [
    {
      family: "cable-tie",
      parameters: { pitch: 0.5, strapWidth: 1, toothCount: 8 },
    },
    {
      family: "cable-tie",
      parameters: { pitch: 0.6, strapWidth: 1.4, toothCount: 12 },
    },
    {
      family: "clothespeg",
      parameters: { armLength: 6, armWidth: 0.8, clothThickness: 0.16 },
    },
    {
      family: "clothespeg",
      parameters: { armLength: 8, armWidth: 1.1, clothThickness: 0.3 },
    },
  ] as const;
  await writeFile(
    join(directory, "metadata.json"),
    JSON.stringify([inspectCableTiePack(), inspectClothespegPack()], null, 2) +
      "\n",
    { flag: "wx" },
  );
  for (const [index, specification] of specifications.entries()) {
    const { family, parameters } = specification;
    const instance =
      family === "cable-tie"
        ? createCableTiePack({ parameters })
        : createClothespegPack({ parameters });
    const name = `${family}-dimension-${index % 2}`,
      sourceBytes = JSON.stringify(instance.scene, null, 2) + "\n";
    await writeFile(join(directory, name + ".json"), sourceBytes, {
      flag: "wx",
    });
    const rigControls =
      family === "cable-tie"
        ? {
            ratchet: {
              type: "ratchet",
              position: {
                keys: [
                  { frame: 0, value: 0 },
                  { frame: 6, value: parameters.pitch },
                  { frame: 12, value: 2 * parameters.pitch },
                  { frame: 18, value: 3 * parameters.pitch },
                  { frame: 23, value: 3 * parameters.pitch },
                ],
              },
              latchKeys: [{ frame: 0, state: "engaged" }],
            },
          }
        : {
            "upper.return": {
              type: "spring-return",
              states: [
                { frame: 0, phase: "held", value: 0 },
                { frame: 6, phase: "held", value: -0.16 },
                { frame: 9, phase: "released", value: -0.16, stopValue: 0 },
              ],
            },
            "lower.return": {
              type: "spring-return",
              states: [
                { frame: 0, phase: "held", value: 0 },
                { frame: 6, phase: "held", value: 0.16 },
                { frame: 9, phase: "released", value: 0.16, stopValue: 0 },
              ],
            },
          };
    const required =
      family === "cable-tie"
        ? { rig: "ratchet", relationship: "pawl.root.fixed" }
        : { rig: "upper.return", relationship: "spring.upper.seated" };
    const contact =
      family === "cable-tie"
        ? { rig: "ratchet", relationship: "pawl.tooth.seated" }
        : {
            rig: "upper.return",
            relationship: "upper.cloth.gap",
            signedGap: [0, 0],
          };
    const timeline = compileMechanismPackTimeline(instance, {
      schemaVersion: "mechanism-pack-timeline-1",
      frameCount: 24,
      initialState: "active",
      rigControls,
      states: [
        { id: "active", requirements: [required] },
        { id: "contact", requirements: [required, contact] },
      ],
      transitions: [{ from: "active", to: "contact", event: "contact" }],
      events: [
        { id: "start", frame: 0, kind: "initial", state: "active" },
        {
          id: "contact",
          frame: family === "cable-tie" ? 18 : 21,
          kind: "contact",
          state: "contact",
        },
      ],
    });
    await writeFile(
      join(directory, name + ".timeline.json"),
      JSON.stringify(timeline, null, 2) + "\n",
      { flag: "wx" },
    );
    const composition = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: `family-pack-${index}`,
      width: 320,
      height: 180,
      fps: 30,
      frameCount: 24,
      assets: [
        {
          id: "mechanism",
          type: "native3d",
          path: name + ".json",
          sha256: hash(sourceBytes),
          format: "mechanism-scene-2",
        },
      ],
      layers: [
        {
          id: "cycle",
          type: "native3d",
          asset: "mechanism",
          startFrame: 0,
          inPoint: 0,
          outPoint: 24,
          sourceStartFrame: 0,
          sourceFps: 30,
          rigControls,
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
        const path = "/tests/helpers/mechanism-family-pack-preview.ts",
          proof = (await import(path)) as typeof Proof;
        const args = JSON.parse(text) as Parameters<
          typeof proof.familyPackPreview
        >;
        return JSON.stringify(await proof.familyPackPreview(...args));
      },
      JSON.stringify([
        loaded.composition,
        loaded.preparedNative3D!,
        loaded.nativeAppearanceCodeIdentity!,
      ]),
    );
    const proof = JSON.parse(serialized) as Awaited<
        ReturnType<typeof Proof.familyPackPreview>
      >,
      captures = [];
    const seen = new Map<number, string>();
    for (const [i, capture] of proof.captures.entries()) {
      const sample = sampleMechanismPackTimeline(
        instance,
        timeline,
        capture.frame,
        { width: 320, height: 180 },
      );
      assert.equal(
        canonicalMechanismJson(sample.request.rigControls),
        canonicalMechanismJson(
          composition.layers[0]!.type === "native3d"
            ? composition.layers[0]!.rigControls
            : {},
        ),
      );
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
          !relation.required || relation.residual <= relation.tolerance,
          `Required relation failed ${relation.id}`,
        );
      const state =
        family === "cable-tie"
          ? pass.reference.frame.rigs.ratchet
          : pass.reference.frame.rigs["upper.return"];
      if (family === "cable-tie") {
        assert(state?.type === "ratchet");
        assert.equal(
          pass.reference.frame.relationships["pawl.tooth.seated"]!.required,
          state.phase === "seated",
        );
      } else {
        assert(state?.type === "spring-return");
        if (capture.frame >= 21) assert.equal(state.phase, "contact");
      }
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
      assert.equal(closure.outputFrames, 24);
      assert.equal(closure.passCount, 24);
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
            frameCount: 24,
            width: 320,
            height: 180,
            transport: "raw_rgba",
          },
        });
        assert.equal(verified.passCount, 24);
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
      "Repeated complete family cycle final exports must be byte-identical",
    );
    fixtures.push({
      name,
      family,
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
          "two-family-two-dimension-candidates-actual-native2-preview-and-complete-cycle-repeated-final-export",
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
      families: 2,
      dimensionsPerFamily: 2,
      previewCaptures: 40,
      finalExports: 8,
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
