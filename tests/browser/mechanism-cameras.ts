import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  CompositionSchema,
  MechanismCameraSchema,
  MechanismRigControlsV2Schema,
  type MechanismRigControlsV2,
  NativeObservedOutputFrameV2Schema,
} from "@still-shift/scene-contract";
import {
  createTapeHookPack,
  createMechanismCameraRecipeFrame,
  compileMechanismCameraRecipeClip,
  createCableTiePack,
  inspectTapeHookPack,
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
import type * as Proof from "../helpers/mechanism-camera-preview.ts";
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-cameras-");
const fontPath = join(root, "assets/story-motion/fonts/plex-sans-semibold.ttf"),
  fontRequirement = inspectTapeHookPack().pack.compatibility.textureFont!;
assert.equal(hash(await readFile(fontPath)), fontRequirement.sha256);
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
  if (req.url !== "/camera-pack-proof") return next();
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
      family: "tape-hook",
      parameters: { hookThickness: 0.18, bladeLength: 10, bladeWidth: 2 },
    },
    {
      family: "tape-hook",
      parameters: { hookThickness: 0.26, bladeLength: 14, bladeWidth: 2.5 },
    },
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
    JSON.stringify(
      [inspectTapeHookPack(), inspectCableTiePack(), inspectClothespegPack()],
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  for (const [index, specification] of specifications.entries()) {
    const { family, parameters } = specification;
    const instance =
      family === "tape-hook"
        ? createTapeHookPack({ parameters })
        : family === "cable-tie"
          ? createCableTiePack({ parameters })
          : createClothespegPack({ parameters });
    const name = `${family}-dimension-${index % 2}`,
      sourceBytes = JSON.stringify(instance.scene, null, 2) + "\n";
    await writeFile(join(directory, name + ".json"), sourceBytes, {
      flag: "wx",
    });
    const rigControls: MechanismRigControlsV2 =
      MechanismRigControlsV2Schema.parse(
        family === "tape-hook"
          ? {}
          : family === "cable-tie"
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
              },
      );
    const viewport = { width: 640, height: 360 };
    const reservedRegions = [
      { id: "caption", rect: { left: 12, top: 282, right: 628, bottom: 348 } },
      { id: "label", rect: { left: 470, top: 12, right: 628, bottom: 88 } },
    ];
    const targets = [
      "recognition",
      "approach",
      "macro",
      "comparison",
      "orbit",
      "return",
    ];
    const plans: ReturnType<typeof compileMechanismCameraRecipeClip>[] = [];
    const layers: unknown[] = [];
    const shots: { controls: MechanismRigControlsV2; hiddenParts: string[] }[] =
      [];
    for (const [shot, target] of targets.entries()) {
      const sourceFrames = Array.from({ length: 4 }, (_, i) => shot * 4 + i);
      const controls = MechanismRigControlsV2Schema.parse(
        family === "tape-hook"
          ? {
              slider: {
                type: "slider" as const,
                ...(target === "comparison"
                  ? {
                      keys: [
                        { frame: sourceFrames[0]!, value: 0 },
                        {
                          frame: sourceFrames.at(-1)!,
                          value: parameters.hookThickness,
                        },
                      ],
                    }
                  : { value: 0 }),
              },
            }
          : rigControls,
      );
      const hiddenParts =
        family === "tape-hook"
          ? [target === "comparison" ? "board" : "wall"]
          : [];
      const plan = compileMechanismCameraRecipeClip(instance, {
        ...viewport,
        target,
        sourceFrames,
        reservedRegions,
        rigControls: controls,
        hiddenParts,
        editing:
          target === "approach" || target === "return"
            ? "transition"
            : target === "macro"
              ? "hold"
              : "cut",
        ...(target === "approach" || target === "macro" || target === "return"
          ? { fromCamera: plans.at(-1)!.endCamera }
          : {}),
        ...(target === "orbit"
          ? { orbitDegrees: [-8, 8] as [number, number] }
          : {}),
      });
      plans.push(plan);
      shots.push({ controls, hiddenParts });
      layers.push({
        id: target,
        type: "native3d",
        asset: "mechanism",
        startFrame: shot * 4,
        inPoint: shot * 4,
        outPoint: shot * 4 + 4,
        sourceStartFrame: shot * 4,
        sourceFps: 30,
        camera: plan.camera,
        cameraKeys: plan.cameraKeys,
        rigControls: controls,
        partOverrides: Object.fromEntries(
          hiddenParts.map((id) => [id, { visible: false }]),
        ),
      });
    }
    const composition = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: `camera-pack-${index}`,
      ...viewport,
      fps: 30,
      frameCount: 24,
      assets: [
        {
          id: "mechanism",
          type: "native3d",
          path: name + ".json",
          sha256: hash(sourceBytes),
          format: "mechanism-scene-2",
          ...(family === "tape-hook"
            ? { textureFont: "graduations-font" }
            : {}),
        },
        ...(family === "tape-hook"
          ? [
              {
                id: "graduations-font",
                type: "font",
                path: fontPath,
                sha256: fontRequirement.sha256,
                weight: fontRequirement.weight,
              },
            ]
          : []),
      ],
      layers,
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
    const proofs: Proof.CameraProofInput[] = Array.from(
      { length: 24 },
      (_, frame) => {
        const pass = binding.expectedPasses(frame)[0]!;
        assert.equal(pass.version, "native3d-frame-2");
        if (pass.version !== "native3d-frame-2")
          throw new Error("Expected native2 camera pass");
        const layer = shots[Math.floor(frame / 4)]!,
          target = targets[Math.floor(frame / 4)]!;
        const checked = createMechanismCameraRecipeFrame(instance, {
          ...viewport,
          target,
          frame,
          reservedRegions,
          rigControls: layer.controls,
          hiddenParts: layer.hiddenParts,
          authoredCamera: MechanismCameraSchema.parse(
            pass.reference.frame.camera,
          ),
        });
        return {
          frame,
          target,
          pose: pass.reference.frame,
          bindings: checked.bindings,
          region: checked.availableRegion,
        };
      },
    );
    const serialized = await page.evaluate(
      async (text) => {
        const path = "/tests/helpers/mechanism-camera-preview.ts",
          proof = (await import(path)) as typeof Proof;
        const args = JSON.parse(text) as Parameters<
          typeof proof.cameraPackPreview
        >;
        return JSON.stringify(await proof.cameraPackPreview(...args));
      },
      JSON.stringify([
        loaded.composition,
        loaded.preparedNative3D!,
        loaded.nativeAppearanceCodeIdentity!,
        instance.scene,
        proofs,
      ]),
    );
    const proof = JSON.parse(serialized) as Awaited<
        ReturnType<typeof Proof.cameraPackPreview>
      >,
      captures = [];
    const seen = new Map<number, string>();
    for (const [i, capture] of proof.captures.entries()) {
      const bytes = Buffer.from(capture.rgba),
        sha256 = hash(bytes);
      assert.equal(bytes.length, 640 * 360 * 4);
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
      assert(
        capture.surfaces.length > 0 &&
          capture.surfaces.every((surface) => surface.visibility === "visible"),
      );
      const png = Buffer.from(capture.png.split(",")[1]!, "base64");
      await writeFile(join(directory, `${name}-preview-${i}.png`), png, {
        flag: "wx",
      });
      await writeFile(join(directory, `${name}-preview-${i}.rgba`), bytes, {
        flag: "wx",
      });
      captures.push({
        frame: capture.frame,
        sha256,
        packet,
        surfaces: capture.surfaces,
      });
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
            width: 640,
            height: 360,
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
      plans,
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
          "three-family-two-dimension-six-camera-recipes-all-frame-native2-preview-independent-used-stream-ray-proof-and-repeated-final-export",
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
      families: 3,
      dimensionsPerFamily: 2,
      previewCaptures: 156,
      finalExports: 12,
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
