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
import { decodeRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-import.ts";
import { prepareRigidGltfPbr } from "../../packages/animation-engine/src/mechanism/gltf-pbr.ts";
import {
  texturedGltfFixture,
  glbBytes,
} from "../helpers/rigid-gltf-fixture.ts";
import { rgbaPngFixture } from "../helpers/rgba-png-fixture.ts";
import type * as Proof from "../helpers/native-pbr-observation-proof.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";
import { loadNativePbrSourceResources } from "../../packages/animation-engine/src/mechanism/native-pbr-files.ts";
const hash = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-pbr-observation-");
const { document, binary } = texturedGltfFixture(),
  rgba = new Uint8Array([
    128, 64, 255, 0, 255, 128, 64, 64, 32, 64, 128, 128, 128, 128, 255, 255,
  ]),
  png = rgbaPngFixture(2, 2, rgba);
const source = {
  ...document,
  materials: document.materials.map((material) => ({
    ...material,
    pbrMetallicRoughness: {
      ...material.pbrMetallicRoughness,
      baseColorFactor: [0.2, 0.4, 0.6, 0.25],
    },
  })),
};
const bytes = glbBytes(source, binary),
  asset = decodeRigidGltf(bytes, {
    format: "glb",
    dependencies: new Map([["maps/surface.png", png]]),
  }),
  prepared = await prepareRigidGltfPbr(asset);
const first = prepared.geometry.meshes[0]!,
  geometry = {
    ...prepared.geometry,
    meshes: [
      {
        ...first,
        indices: [...first.indices, ...first.indices],
        groups: [
          { start: 0, count: 3, materialIndex: 0 },
          { start: 3, count: 3, materialIndex: 0 },
        ],
      },
      { ...first, id: first.id + ".copy" },
    ],
  };
const nativeSource = {
  ...nativePbrSceneFixture(),
  geometry,
  geometrySha256: gltfJsonHash(geometry),
  parts: [...prepared.parts].reverse(),
  resources: prepared.geometry.images.map((image) => ({
    image: image.id,
    path: "surface.rgba",
    bytes: image.width * image.height * 4,
    sha256: image.pixelSha256,
  })),
};
await writeFile(join(directory, "surface.rgba"), prepared.images[0]!.rgba, {
  flag: "wx",
});
const nativeSourceBytes = Buffer.from(JSON.stringify(nativeSource));
await writeFile(join(directory, "source3.json"), nativeSourceBytes, {
  flag: "wx",
});
const binaryResources = await loadNativePbrSourceResources(
  JSON.parse(
    (await readFile(join(directory, "source3.json"))).toString("utf8"),
  ),
  directory,
);
const input = {
  source: binaryResources.source,
  sourceSha256: hash(nativeSourceBytes),
  images: binaryResources.images.map((image) => ({
    image: image.image,
    rgba: Array.from(image.rgba),
  })),
};
await writeFile(join(directory, "source.glb"), bytes, { flag: "wx" });
await writeFile(join(directory, "surface.png"), png, { flag: "wx" });
await writeFile(join(directory, "prepared.json"), JSON.stringify(input), {
  flag: "wx",
});
const producerPaths = [
  "packages/scene-contract/src/native3d/pbr-geometry.ts",
  "packages/renderer-core/src/native3d/pbr-resources.ts",
  "packages/renderer-core/src/native3d/pbr-allocations.ts",
  "packages/renderer-core/src/native3d/pbr-gpu-draw.ts",
  "packages/renderer-core/src/native3d/pbr-gpu-texture.ts",
  "packages/animation-engine/src/mechanism/gltf-pbr.ts",
  "packages/animation-engine/src/mechanism/gltf-pixels.ts",
  "packages/animation-engine/src/mechanism/gltf-png.ts",
  "packages/scene-contract/src/native3d/scene-v3.ts",
  "packages/renderer-core/src/native3d/three-world.ts",
  "packages/renderer-core/src/native3d/prepare-v3.ts",
  "packages/renderer-core/src/mechanism/prepare-v2.ts",
  "packages/renderer-core/src/mechanism/evaluate-v2.ts",
  "packages/animation-engine/src/mechanism/native-pbr-files.ts",
  "tests/helpers/native-pbr-observation-proof.ts",
  "packages/scene-contract/src/native3d/observation-v3.ts",
  "packages/renderer-core/src/native3d/three-pbr-observation.ts",
  "packages/renderer-core/src/native3d/three-pbr-frame-state.ts",
  "packages/renderer-core/src/native3d/three-pbr-draws.ts",
  "packages/renderer-core/src/native3d/three-pbr-material.ts",
  "packages/renderer-core/src/native3d/pbr-frame-matrices.ts",
  "packages/renderer-core/src/native3d/observed-validation-v3.ts",
  "packages/renderer-core/src/native3d/pbr-gpu-reference.ts",
  "tests/helpers/native-pbr-scene-fixture.ts",
  "tests/browser/native-pbr-observation.ts",
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
  if (req.url !== "/pbr-proof") {
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
  await page.goto(server.resolvedUrls!.local[0] + "pbr-proof");
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const result = await page.evaluate(async (input) => {
    const path = "/tests/helpers/native-pbr-observation-proof.ts";
    const proof = (await import(path)) as typeof Proof;
    return proof.nativePbrObservationProof(input);
  }, input);
  const frames = [];
  for (const capture of result.captures) {
    const rgba = Uint8Array.from(capture.rgba);
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
      sourceFrame: capture.sourceFrame,
      receipt: capture.receipt,
      width: 320,
      height: 180,
      bytes: rgba.length,
      rgbaSha256: hash(rgba),
    });
  }
  assert.equal(frames.length, 8);
  assert.equal(frames[0]!.rgbaSha256, frames[4]!.rgbaSha256);
  assert.equal(frames[0]!.rgbaSha256, frames[7]!.rgbaSha256);
  assert.equal(frames[1]!.rgbaSha256, frames[3]!.rgbaSha256);
  assert.notEqual(frames[0]!.rgbaSha256, frames[2]!.rgbaSha256);
  assert.equal(result.faults.length, 21);
  assert.equal(Object.keys(frames[0]!.receipt.meshes).length, 2);
  assert.equal(
    Object.values(frames[0]!.receipt.meshes).reduce(
      (sum, mesh) =>
        sum + (mesh.status === "drawn" ? mesh.submissions.length : 0),
      0,
    ),
    3,
  );
  assert.equal(result.statistics.reservations, 0);
  assert.deepEqual(result.statistics.current, { pixels: 0, metadata: 0 });
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        version: "native-pbr-observation-proof-1",
        status: "passed",
        assetSha256: asset.assetSha256,
        geometrySha256: prepared.geometrySha256,
        sourceSha256: hash(bytes),
        nativeSourceSha256: input.sourceSha256,
        environment,
        producers,
        frames,
        faults: result.faults,
        cleanup: result.cleanup,
        statistics: result.statistics,
        scope: result.scope,
        sourceKey: result.sourceKey,
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
      faults: result.faults.length,
    }) + "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        version: "native-pbr-frame-observation-failure-3",
        producers,
        message: error instanceof Error ? error.stack : String(error),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stderr.write(JSON.stringify({ directory, status: "failed" }) + "\n");
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
