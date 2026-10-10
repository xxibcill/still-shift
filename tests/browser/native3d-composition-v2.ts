import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  CompositionSchema,
  NativeObservedOutputFrameV2Schema,
} from "@still-shift/scene-contract";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { readCompositionSource } from "../../packages/animation-engine/src/composition-source.ts";
import { assertNativeAppearanceCodeIdentity } from "../../packages/animation-engine/src/native3d-appearance-identity.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { resolveNative3DVariantVersions } from "../../packages/renderer-core/src/native3d/catalogue-versions.ts";
import { assertNativeObservedFrameV2 } from "../../packages/renderer-core/src/native3d/observed-validation-v2.ts";
import { nativeCompositionObservationCapacityV2 } from "../../packages/renderer-core/src/native3d/observation-capacity-v2.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import { nativeSolidFixture } from "../helpers/native3d-fixture.ts";
import type * as Proof from "../helpers/native3d-composition-v2-proof.ts";
import { verifyNativeJournalV2Proof } from "../helpers/native3d-journal-v2-proof.ts";
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export async function runNativeCompositionV2Proof() {
  const root = resolve(import.meta.dirname, "../..");
  const directory = await mkdtemp(
    "/private/tmp/still-shift-ms2-composition-v2-",
  );
  const source2 = mechanismV2Fixture();
  source2.camera = {
    ...source2.camera,
    position: [8, 5, 15],
    target: [4, 0, 0],
    fovDegrees: 50,
  };
  for (const shape of source2.teachingShapes)
    shape.drawEvidence = {
      version: "mechanism-shape-draw-evidence-1",
      requiredIntervals: [{ startFrame: 0, endFrameExclusive: 20 }],
      allowedOutsideProof: ["authored-hidden", "outside-frustum"],
    };
  const source1 = nativeSolidFixture();
  const source2Bytes = JSON.stringify(source2, null, 2) + "\n",
    source1Bytes = JSON.stringify(source1, null, 2) + "\n";
  await writeFile(join(directory, "mechanism.json"), source2Bytes, {
    flag: "wx",
  });
  await writeFile(join(directory, "solid.json"), source1Bytes, { flag: "wx" });
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "mixed-native-preview",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 6,
    motionBlur: {
      enabled: true,
      shutterAngle: 360,
      shutterPhase: 0,
      samples: 3,
    },
    assets: [
      {
        id: "mechanism",
        type: "native3d",
        path: "mechanism.json",
        sha256: hash(source2Bytes),
        format: "mechanism-scene-2",
      },
      {
        id: "solid",
        type: "native3d",
        path: "solid.json",
        sha256: hash(source1Bytes),
        format: "solid-scene-1",
      },
    ],
    precomps: [
      {
        id: "legacy-inset",
        width: 320,
        height: 180,
        frameCount: 6,
        layers: [
          {
            id: "inset-world1",
            type: "native3d",
            asset: "solid",
            sourceStartFrame: 0.75,
            sourceFps: 30,
            motionBlur: true,
          },
        ],
      },
    ],
    layers: [
      {
        id: "world2",
        motionBlur: true,
        type: "native3d",
        asset: "mechanism",
        inPoint: 0,
        outPoint: 4,
        sourceStartFrame: 0.25,
        sourceFps: 30,
        rigControls: {
          hinge: {
            type: "hinge",
            keys: [
              { frame: 0, value: 0 },
              { frame: 4, value: 0.5 },
            ],
          },
          latch: {
            type: "ratchet",
            position: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 4, value: 0.5 },
              ],
            },
            latchKeys: [{ frame: 0, state: "engaged" }],
          },
        },
      },
      {
        id: "world1",
        motionBlur: true,
        type: "native3d",
        asset: "solid",
        inPoint: 4,
        outPoint: 6,
        sourceStartFrame: 0.5,
        sourceFps: 30,
      },
      {
        id: "inset",
        type: "precomp",
        comp: "legacy-inset",
        motionBlur: true,
        transform: { anchor: [0, 0], position: [256, 144], scale: [0.2, 0.2] },
      },
    ],
  });
  await writeFile(
    join(directory, "composition.json"),
    JSON.stringify(composition, null, 2) + "\n",
    { flag: "wx" },
  );
  const loaded = await readCompositionSource(
    join(directory, "composition.json"),
    { backend: "webgl2" },
  );
  assert.equal(
    loaded.preparedNative3D?.version,
    "composition-prepared-native3d-2",
  );
  const paths = [
    "tests/browser/native3d-composition-v2.ts",
    "tests/helpers/native3d-composition-v2-proof.ts",
    "tests/helpers/native3d-journal-v2-proof.ts",
  ];
  const producers = await Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: hash(await readFile(join(root, path))),
    })),
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
    server: { host: "127.0.0.1", port: 0 },
  });
  server.middlewares.use((req, res, next) => {
    if (req.url !== "/composition2-proof") return next();
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><html><body></body></html>");
  });
  let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
  try {
    await server.listen();
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    await page.addInitScript("window.__name=(fn)=>fn;");
    await page.goto(server.resolvedUrls!.local[0]! + "composition2-proof");
    const environment = await probeRenderEnvironment(page);
    assertPinnedRenderEnvironment(environment);
    const serialized = await page.evaluate(
      async (serializedInput) => {
        const path = "/tests/helpers/native3d-composition-v2-proof.ts";
        const proof = (await import(path)) as typeof Proof;
        const input = JSON.parse(serializedInput) as Parameters<
          typeof proof.nativeCompositionV2Proof
        >;
        return JSON.stringify(await proof.nativeCompositionV2Proof(...input));
      },
      JSON.stringify([
        loaded.composition,
        loaded.preparedNative3D!,
        loaded.nativeAppearanceCodeIdentity!,
      ]),
    );
    const result = JSON.parse(serialized) as Awaited<
      ReturnType<typeof Proof.nativeCompositionV2Proof>
    >;
    const captures = [];
    for (const [index, capture] of result.captures.entries()) {
      const assigned = [
        ...compositionNativePasses(loaded.composition, capture.frame, {
          preparedNative3D: loaded.native3D!,
          nativeObservationRequired: true,
        }),
      ];
      const actual = capture.report.nativeObservationsV2!;
      assert.equal(actual.length, assigned.length);
      assert.ok(actual.length > 0 && actual.length <= 6);
      const bytes = Buffer.from(capture.rgba);
      assert.equal(bytes.length, 320 * 180 * 4);
      assert.ok(bytes.some((value, at) => at % 4 !== 3 && value !== 0));
      const packet = NativeObservedOutputFrameV2Schema.parse({
        version: "native3d-observed-output-frame-2",
        outputFrame: capture.frame,
        executionSha256: hash("contract-example-only"),
        passes: actual,
      });
      assert.ok(
        Buffer.byteLength(JSON.stringify(packet)) <=
          nativeCompositionObservationCapacityV2(
            loaded.composition,
            capture.frame,
            {
              preparedNative3D: loaded.native3D!,
              nativeObservationRequired: true,
            },
          ),
      );
      for (const [sampleIndex, assignment] of assigned.entries()) {
        const reference = assignment.frame,
          observed = actual[sampleIndex]!.observed;
        const variant = resolveNative3DVariantVersions(
          loaded.native3D,
          reference,
        );
        assert.equal(actual[sampleIndex]!.sampleIndex, sampleIndex);
        assert.equal(actual[sampleIndex]!.sampleFrame, assignment.sampleFrame);
        if (
          reference.version === "native3d-frame-2" &&
          variant.version === "prepared-native3d-variant-2"
        ) {
          await assertNativeObservedFrameV2(
            variant,
            reference,
            observed,
            loaded.nativeAppearanceCodeSha256!,
          );
        } else {
          assert.equal(reference.version, "native3d-frame-1");
          assert.equal(observed.version, "native3d-observed-frame-1");
          for (const [id, part] of Object.entries(reference.frame.parts)) {
            for (const key of ["worldMatrix", "localMatrix"] as const)
              part[key].forEach((value, at) =>
                assert.ok(
                  Math.abs(value - observed.parts[id]![key][at]!) <= 1e-8,
                ),
              );
          }
        }
      }
      const name = `${index}-frame-${capture.frame}`,
        receipt = JSON.stringify(packet, null, 2) + "\n";
      await writeFile(join(directory, name + ".rgba"), bytes, { flag: "wx" });
      await writeFile(
        join(directory, name + ".png"),
        Buffer.from(capture.png.split(",")[1]!, "base64"),
        { flag: "wx" },
      );
      await writeFile(join(directory, name + ".json"), receipt, { flag: "wx" });
      captures.push({
        name,
        frame: capture.frame,
        rgbaSha256: hash(bytes),
        receiptSha256: hash(receipt),
        protocols: actual.map((pass) => pass.observed.version),
        sampleFrames: actual.map((pass) => pass.sampleFrame),
        sourceFrames: assigned.map((pass) => pass.frame.sourceFrame),
      });
    }
    assert.equal(captures[0]!.rgbaSha256, captures[2]!.rgbaSha256);
    assert.notEqual(captures[0]!.rgbaSha256, captures[1]!.rgbaSha256);
    assert.deepEqual(result.emptyPasses, []);
    assert.equal(
      hash(Buffer.from(result.defaultRgba)),
      captures[0]!.rgbaSha256,
    );
    assert.ok(captures[3]!.protocols.includes("native3d-observed-frame-1"));
    assert.ok(captures[1]!.protocols.includes("native3d-observed-frame-1"));
    assert.ok(captures[1]!.protocols.includes("native3d-observed-frame-2"));
    assert.ok(
      captures[3]!.protocols.every(
        (protocol) => protocol === "native3d-observed-frame-1",
      ),
    );
    assert.ok(
      captures.some((capture) =>
        capture.sampleFrames.some((frame) => !Number.isInteger(frame)),
      ),
    );
    await writeFile(
      join(directory, "default-preview.rgba"),
      Buffer.from(result.defaultRgba),
      { flag: "wx" },
    );
    assert.ok(
      result.negatives
        .find((item) => item.id === "native-finalizer-failure")
        ?.message.includes("injected-first-native-finalization-failure"),
    );
    const journalFrames = await page.evaluate(
      async (serializedInput) => {
        const path = "/tests/helpers/native3d-composition-v2-proof.ts";
        const proof = (await import(path)) as typeof Proof;
        const input = JSON.parse(serializedInput) as Parameters<
          typeof proof.nativeCompositionJournalV2Frames
        >;
        return await proof.nativeCompositionJournalV2Frames(...input);
      },
      JSON.stringify([
        loaded.composition,
        loaded.preparedNative3D!,
        loaded.nativeAppearanceCodeIdentity!,
      ]),
    );
    const journal = await verifyNativeJournalV2Proof(
      loaded,
      journalFrames,
      directory,
    );
    for (const item of producers)
      assert.equal(hash(await readFile(join(root, item.path))), item.sha256);
    await assertNativeAppearanceCodeIdentity(
      loaded.nativeAppearanceCodeIdentity!,
    );
    await writeFile(
      join(directory, "run.json"),
      JSON.stringify(
        {
          status: "passed",
          scope: result.scope,
          environment,
          producers,
          appearanceCodeIdentity: loaded.nativeAppearanceCodeIdentity,
          captures,
          journal,
          defaultPreviewWithoutCollection:
            "same-pixels-after-mandatory-native-finalization",
          negatives: result.negatives,
          emptyDeclaredScene2: "version2-empty-passes",
          verification:
            "fresh-independent-node-frame2-checker-and-original-frame1-matrices",
          limits:
            "Normal source IO, graph and composition preview only. Output packets are contract examples; no authenticated export2, reusable family or human acceptance claim.",
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
        captures: captures.length,
        negatives: result.negatives.length,
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
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    throw error;
  } finally {
    await browser?.close();
    await server.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
)
  await runNativeCompositionV2Proof();
