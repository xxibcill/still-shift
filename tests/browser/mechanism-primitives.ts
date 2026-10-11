import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  CompositionSchema,
  SolidSceneSchema,
  NativeObservedOutputFrameSchema,
} from "@still-shift/scene-contract";
import {
  createMechanismPrimitiveGeometry,
  admitMechanismPrimitive,
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
  isNativeObservationRequestV3,
} from "@still-shift/execution-runtime/export";
import { validateNativeObservationPacket } from "../../packages/execution-runtime/src/native-observation-journal.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { mechanismPrimitiveExamples } from "../helpers/mechanism-primitive-fixtures.ts";
import type * as Proof from "../helpers/mechanism-primitive-preview.ts";
const hash = (bytes: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-primitives-native-");
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
  if (req.url !== "/primitives-proof") return next();
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><html><body></body></html>");
});
let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
const records = [];
try {
  await server.listen();
  browser = await launchRenderBrowser();
  const page = await browser.newPage();
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0]! + "primitives-proof");
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  for (const input of mechanismPrimitiveExamples()) {
    const { admission } = admitMechanismPrimitive(input),
      geometry = createMechanismPrimitiveGeometry({
        meshes: [input],
        materials: [
          { id: "paint", color: "#b87a37", roughness: 0.5, metalness: 0.15 },
        ],
      });
    const bounds = geometry.meshes[0]!.bounds,
      center = bounds.min.map((v, i) => (v + bounds.max[i]!) / 2),
      radius = Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i]!)) / 2;
    const source = SolidSceneSchema.parse({
      schemaVersion: "solid-scene-1",
      id: input.id,
      coordinateSystem: "right-handed-y-up",
      units: { kind: "illustrative", scaleToMeters: 1 },
      geometrySha256: hash(canonicalMechanismJson(geometry)),
      geometry,
      parts: [{ id: "root" }],
      camera: {
        position: center.map((v, i) => v + [1.8, 1.2, 2.8][i]! * radius),
        target: center,
        fovDegrees: 45,
        near: 0.01,
        far: 100,
      },
      profile: {
        toneMapping: "aces-filmic",
        exposure: 1,
        output: "srgb-rgba8-straight",
      },
      lights: [
        {
          id: "key",
          type: "directional",
          position: center.map((v, i) => v + [3, 4, 5][i]! * radius),
          target: center,
          intensity: 3,
        },
      ],
    });
    const sourceBytes = JSON.stringify(source, null, 2) + "\n";
    await writeFile(join(directory, input.id + ".json"), sourceBytes, {
      flag: "wx",
    });
    const composition = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: `primitive-${input.id}`,
      width: 320,
      height: 240,
      fps: 30,
      frameCount: 1,
      assets: [
        {
          id: "primitive",
          type: "native3d",
          path: input.id + ".json",
          sha256: hash(sourceBytes),
          format: "solid-scene-1",
        },
      ],
      layers: [
        {
          id: "native",
          type: "native3d",
          asset: "primitive",
          inPoint: 0,
          outPoint: 1,
          sourceStartFrame: 0,
          sourceFps: 30,
        },
      ],
    });
    const compositionPath = join(directory, input.id + ".composition.json");
    await writeFile(
      compositionPath,
      JSON.stringify(composition, null, 2) + "\n",
      { flag: "wx" },
    );
    const loaded = await loadComposition(compositionPath, "webgl2"),
      binding = await createNativeObservationRequestVersions(loaded);
    assert(
      binding &&
        !isNativeObservationRequestV2(binding) &&
        !isNativeObservationRequestV3(binding),
    );
    const serialized = await page.evaluate(
      async (text) => {
        const modulePath = "/tests/helpers/mechanism-primitive-preview.ts",
          proof = (await import(modulePath)) as typeof Proof;
        const args = JSON.parse(text) as Parameters<
          typeof proof.primitivePreview
        >;
        return JSON.stringify(await proof.primitivePreview(...args));
      },
      JSON.stringify([
        loaded.composition,
        loaded.preparedNative3D!,
        loaded.nativeAppearanceCodeIdentity!,
      ]),
    );
    const proof = JSON.parse(serialized) as Awaited<
      ReturnType<typeof Proof.primitivePreview>
    >;
    assert.equal(proof.captures.length, 2);
    const captures = [];
    for (const [index, capture] of proof.captures.entries()) {
      const rgba = Buffer.from(capture.rgba);
      assert.equal(rgba.length, 320 * 240 * 4);
      assert(rgba.some((v, i) => i % 4 !== 3 && v !== rgba[0]));
      const packet = NativeObservedOutputFrameSchema.parse({
        version: "native3d-observed-output-frame-1",
        outputFrame: 0,
        executionSha256: hash(canonicalMechanismJson(binding.execution)),
        passes: capture.report.nativeObservations,
      });
      validateNativeObservationPacket(
        packet,
        hash(canonicalMechanismJson(binding.execution)),
        binding.expectedPasses(0),
      );
      assert.equal(packet.passes.length, 1);
      await writeFile(
        join(directory, `${input.id}-${index}.png`),
        Buffer.from(capture.png.split(",")[1]!, "base64"),
        { flag: "wx" },
      );
      await writeFile(join(directory, `${input.id}-${index}.rgba`), rgba, {
        flag: "wx",
      });
      captures.push({ sha256: hash(rgba), packet });
    }
    assert.equal(captures[0]!.sha256, captures[1]!.sha256);
    records.push({
      input,
      admission,
      actualVertices: geometry.meshes[0]!.positions.length / 3,
      actualTriangles: geometry.meshes[0]!.indices.length / 3,
      captures,
    });
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "shared-static-primitive-native-rendering-not-mechanism-family-acceptance",
        environment,
        records,
        supportedPacks: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      directory,
      status: "passed",
      primitives: records.length,
      captures: records.length * 2,
    }),
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        records,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      directory,
      status: "failed",
      completedPrimitives: records.length,
    }),
  );
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
