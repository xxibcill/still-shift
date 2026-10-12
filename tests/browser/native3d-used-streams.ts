import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import {
  NativeObservedShapePassSchema,
  Native3DLayerSchema,
} from "@still-shift/scene-contract";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { sampleNativeFrameV2 } from "../../packages/renderer-core/src/native3d/evaluate-v2.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { mechanismTeachingTopologyDocument } from "../../packages/renderer-core/src/mechanism/teaching-topology.ts";
import type * as Proof from "../helpers/native3d-used-streams-proof.ts";

const hash = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
export async function runNativeUsedStreamsProof() {
  const root = resolve(import.meta.dirname, "../.."),
    directory = await mkdtemp("/private/tmp/still-shift-ms2-used-streams-");
  const source = mechanismV2Fixture();
  source.camera = {
    ...source.camera,
    position: [8, 5, 15],
    target: [4, 0, 0],
    fovDegrees: 50,
  };
  for (const shape of source.teachingShapes)
    shape.drawEvidence = {
      version: "mechanism-shape-draw-evidence-1",
      requiredIntervals: [{ startFrame: 0, endFrameExclusive: 2 }],
      allowedOutsideProof: ["authored-hidden", "outside-frustum"],
    };
  const mesh = source.geometry.meshes.find((mesh) => mesh.id === "pawl.mesh")!;
  source.geometry.materials.push({
    ...source.geometry.materials[0]!,
    id: "paint.second",
  });
  const split = Math.floor(mesh.indices.length / 6) * 3;
  mesh.groups = [
    { start: 0, count: split, materialIndex: 0 },
    { start: split, count: mesh.indices.length - split, materialIndex: 1 },
  ];
  const pawl = source.teachingShapes.find((shape) => shape.id === "pawl")!;
  pawl.topologySha256 = hash(
    canonicalMechanismJson(mechanismTeachingTopologyDocument(pawl, mesh)),
  );
  source.geometrySha256 = hash(canonicalMechanismJson(source.geometry));
  const sourceBytes = JSON.stringify(source, null, 2) + "\n",
    sourceSha256 = hash(sourceBytes);
  await writeFile(join(directory, "source.json"), sourceBytes, { flag: "wx" });
  const producerPaths = [
    "tests/helpers/native3d-used-streams-proof.ts",
    "tests/browser/native3d-used-streams.ts",
    "packages/scene-contract/src/native3d/shape-observation.ts",
    "packages/scene-contract/src/mechanism/teaching-shapes.ts",
    "packages/renderer-core/src/native3d/shape-associations.ts",
    "packages/renderer-core/src/native3d/used-indexed-streams.ts",
    "packages/renderer-core/src/native3d/used-stream-bytes.ts",
    "packages/renderer-core/src/native3d/three-shape-material.ts",
    "packages/renderer-core/src/native3d/three-shape-draws.ts",
    "packages/renderer-core/src/native3d/three-shape-observation.ts",
    "packages/renderer-core/src/native3d/three-shapes.ts",
    "packages/renderer-core/src/native3d/three-world.ts",
    "packages/renderer-core/src/native3d/prepare-v2.ts",
    "packages/renderer-core/src/native3d/evaluate-v2.ts",
  ];
  const producers = await Promise.all(
    producerPaths.map(async (path) => ({
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
    if (req.url !== "/used-stream-proof") {
      next();
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><html><body></body></html>");
  });
  let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
  try {
    await server.listen();
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    await page.addInitScript("window.__name=(fn)=>fn;");
    await page.goto(server.resolvedUrls!.local[0]! + "used-stream-proof");
    const environment = await probeRenderEnvironment(page);
    assertPinnedRenderEnvironment(environment);
    const result = await page.evaluate(
      async (input) => {
        const path = "/tests/helpers/native3d-used-streams-proof.ts";
        const proof = (await import(path)) as typeof Proof;
        return proof.nativeUsedStreamsProof(input.source, input.sourceSha256);
      },
      { source, sourceSha256 },
    );
    const frames = [] as Array<{
      id: string;
      rgbaSha256: string;
      bytes: number;
      calls: number;
      receiptSha256: string;
    }>;
    const prepared = await prepareNative3DSceneV2(source, sourceSha256),
      variant = prepared.variants[prepared.baseSourceKey]!;
    const controller = Native3DLayerSchema.parse({
      id: "world",
      type: "native3d",
      asset: "mechanism",
      sourceStartFrame: 0,
      sourceFps: 30,
    });
    let checkedDigests = 0,
      checkedLandmarks = 0;
    function expectedBytes(values: readonly number[], width: 2 | 4) {
      const bytes = new Uint8Array(values.length * width),
        view = new DataView(bytes.buffer);
      values.forEach((value, index) => {
        if (width === 4) view.setFloat32(index * width, value, true);
        else view.setUint16(index * width, value, true);
      });
      return bytes;
    }
    for (const capture of result.captures) {
      const bend = capture.id.startsWith("bent-"),
        hidden = capture.id === "allowed-hidden",
        outside = capture.id === "allowed-outside";
      const frame = hidden || outside ? 2 : 0.5;
      const expected = sampleNativeFrameV2(
        prepared,
        {
          ...controller,
          ...(hidden ? { hiddenParts: ["root"] } : {}),
          ...(outside
            ? {
                camera: {
                  ...source.camera,
                  position: [100, 0, 15],
                  target: [100, 0, 0],
                },
              }
            : {}),
          ...(bend
            ? {
                rigControls: {
                  hinge: { type: "hinge" as const, value: 0.5 },
                  latch: {
                    type: "ratchet" as const,
                    position: { value: 0.5 },
                    latchKeys: [{ frame: 0, state: "engaged" as const }],
                  },
                },
              }
            : {}),
        },
        {
          scope: "used-stream-proof",
          scopeFrame: frame + 80,
          layerTime: frame,
          owningScopeFps: 30,
          width: 320,
          height: 180,
        },
      );
      assert.equal(capture.receipt.frameKeySha256, hash(expected.frameKey));
      assert.equal(capture.receipt.sourceFrame, expected.sourceFrame);
      for (const shape of source.teachingShapes) {
        const observed = capture.receipt.shapes[shape.id]!,
          state = expected.frame.shapeStates[shape.id]!;
        assert.deepEqual(
          observed.association,
          variant.shapeAssociations[shape.id],
        );
        assert.equal(observed.driverStateKey, state.stateKey);
        if (observed.status !== "drawn") continue;
        const definition = source.geometry.meshes.find(
          (mesh) => mesh.id === shape.mesh,
        )!;
        assert.equal(
          observed.positionSha256,
          hash(expectedBytes(state.positions, 4)),
        );
        assert.equal(
          observed.normalSha256,
          hash(expectedBytes(state.normals, 4)),
        );
        assert.equal(
          observed.indexSha256,
          hash(expectedBytes(definition.indices, 2)),
        );
        checkedDigests += 3;
        const matrix = expected.frame.parts[shape.ownerPart]!.worldMatrix;
        observed.ownerWorldMatrix.forEach((value, index) =>
          assert.ok(Math.abs(value - matrix[index]!) <= 1e-8),
        );
        for (const landmark of shape.landmarks) {
          const local = [0, 1, 2].map(
            (axis) =>
              landmark.vertexIndices.reduce(
                (sum, vertex) =>
                  sum + Math.fround(state.positions[vertex * 3 + axis]!),
                0,
              ) / landmark.vertexIndices.length,
          );
          assert.deepEqual(observed.landmarks[landmark.id]!.local, local);
          const world = [0, 1, 2].map(
            (axis) =>
              matrix[axis]! * local[0]! +
              matrix[axis + 4]! * local[1]! +
              matrix[axis + 8]! * local[2]! +
              matrix[axis + 12]!,
          );
          observed.landmarks[landmark.id]!.world.forEach((value, axis) =>
            assert.ok(Math.abs(value - world[axis]!) <= 1e-8),
          );
          checkedLandmarks++;
        }
      }
      const receipt = NativeObservedShapePassSchema.parse(capture.receipt);
      assert.equal(receipt.sourceSha256, sourceSha256);
      const receiptBytes = JSON.stringify(receipt, null, 2) + "\n",
        rgba = new Uint8Array(capture.rgba);
      await writeFile(
        join(directory, capture.id + ".receipt.json"),
        receiptBytes,
        { flag: "wx" },
      );
      await writeFile(join(directory, capture.id + ".rgba"), rgba, {
        flag: "wx",
      });
      await writeFile(
        join(directory, capture.id + ".png"),
        Buffer.from(capture.pngBase64, "base64"),
        { flag: "wx" },
      );
      frames.push({
        id: capture.id,
        rgbaSha256: hash(rgba),
        bytes: rgba.byteLength,
        calls: capture.calls,
        receiptSha256: hash(receiptBytes),
      });
    }
    const receipt = (id: string) =>
      result.captures.find((frame) => frame.id === id)!.receipt;
    const drawn = (id: string) => {
      const shape = receipt(id).shapes.pawl!;
      assert.equal(shape.status, "drawn");
      if (shape.status !== "drawn") throw Error("Expected drawn");
      return shape;
    };
    const a = drawn("rest-a"),
      b = drawn("bent-b");
    assert.equal(a.submissions.length, 2);
    assert.equal(b.submissions.length, 2);
    assert.notEqual(a.positionSha256, b.positionSha256);
    assert.notEqual(a.normalSha256, b.normalSha256);
    assert.equal(a.indexSha256, b.indexSha256);
    const negative = (id: string) =>
      result.negatives.find((failure) => failure.id === id)!;
    const stale = negative("cpu-b-gpu-a"),
      wrongNormal = negative("b-position-a-normal");
    assert.equal(stale.mismatch!.actualSha256, a.positionSha256);
    assert.equal(stale.mismatch!.expectedSha256, b.positionSha256);
    assert.equal(wrongNormal.mismatch!.actualSha256, a.normalSha256);
    assert.equal(wrongNormal.mismatch!.expectedSha256, b.normalSha256);
    for (const id of ["cpu-b-gpu-a", "b-position-a-normal", "changed-index"]) {
      assert.ok(negative(id).calls > 0);
      assert.notEqual(
        negative(id).mismatch!.actualSha256,
        negative(id).mismatch!.expectedSha256,
      );
    }
    for (const id of ["allowed-hidden", "allowed-outside"])
      for (const shape of Object.values(receipt(id).shapes)) {
        assert.equal(shape.status, "not-drawn");
        assert.equal(Object.hasOwn(shape, "landmarks"), false);
      }
    const pixels = (id: string) =>
      frames.find((frame) => frame.id === id)!.rgbaSha256;
    assert.equal(pixels("rest-a"), pixels("rest-a-reverse"));
    assert.equal(pixels("bent-b"), pixels("bent-b-repeat"));
    assert.notEqual(pixels("rest-a"), pixels("bent-b"));
    assert.equal(result.negatives.length, 11);
    assert.equal(result.captures.length, 6);
    assert.equal(result.ownerCount, 2);
    await writeFile(
      join(directory, "run.json"),
      JSON.stringify(
        {
          version: "native3d-used-stream-proof-1",
          status: "passed",
          sourceSha256,
          environment,
          producers,
          frames,
          negatives: result.negatives,
          independentNodeChecks: {
            byteDigests: checkedDigests,
            landmarks: checkedLandmarks,
            method:
              "fresh-pure-source-sampling-and-independent-packed-LE-checker",
          },
          scope: result.scope,
          limits:
            "Standalone actual indexed color submissions/used buffers, sealed groups/material inputs and GPU landmarks. No whole observed-frame2, composed export, imported resource, reusable family/pilot, shader-output or human acceptance.",
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
        frames: frames.length,
        negatives: result.negatives.length,
        scope: result.scope,
      }) + "\n",
    );
  } catch (error) {
    await writeFile(
      join(directory, "failure.json"),
      JSON.stringify(
        {
          status: "failed",
          sourceSha256,
          producers,
          error: error instanceof Error ? error.stack : String(error),
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    process.stdout.write(
      JSON.stringify({ directory, status: "failed" }) + "\n",
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
  await runNativeUsedStreamsProof();
