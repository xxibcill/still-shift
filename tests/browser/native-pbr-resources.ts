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
import type * as Proof from "../helpers/native-pbr-proof.ts";
const hash = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const root = resolve(import.meta.dirname, "../.."),
  directory = await mkdtemp("/private/tmp/still-shift-ms2-pbr-resources-");
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
const input = {
  geometry: prepared.geometry,
  parts: prepared.parts,
  images: prepared.images.map((image) => ({
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
  "packages/renderer-core/src/native3d/pbr-gpu-reference.ts",
  "packages/animation-engine/src/mechanism/gltf-pbr.ts",
  "packages/animation-engine/src/mechanism/gltf-pixels.ts",
  "packages/animation-engine/src/mechanism/gltf-png.ts",
  "tests/helpers/native-pbr-proof.ts",
  "tests/browser/native-pbr-resources.ts",
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
    const path = "/tests/helpers/native-pbr-proof.ts";
    const proof = (await import(path)) as typeof Proof;
    return proof.nativePbrProof(input);
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
      bytes: rgba.length,
      rgbaSha256: hash(rgba),
      draws: capture.draws,
    });
  }
  assert.equal(frames.length, 3);
  assert.equal(frames[0]!.rgbaSha256, frames[1]!.rgbaSha256);
  assert.equal(frames[0]!.rgbaSha256, frames[2]!.rgbaSha256);
  assert.equal(result.faults.length, 10);
  assert.match(
    result.faults.find((fault) => fault.id === "mip")!.message,
    /mip 1 pixels differ/,
  );
  for (const id of ["mip-base", "mip-max", "mip-lod"])
    assert.match(
      result.faults.find((fault) => fault.id === id)!.message,
      /mip selection/,
    );
  assert.match(
    result.faults.find((fault) => fault.id === "sampler")!.message,
    /foreign sampler/,
  );
  assert.equal(result.verificationScratchMemory.reservations, 0);
  assert.deepEqual(result.verificationScratchMemory.current, {
    pixels: 0,
    metadata: 0,
  });
  assert.equal(result.stateRestorations, 13);
  assert.equal(result.verificationBudgetFault!.newTextureAllocations, 0);
  assert.deepEqual(result.verificationBudgetFault!.memory.current, {
    pixels: 0,
    metadata: 0,
  });
  const mipCases = [];
  for (const [minFilter, width, height, magFilter, wrapS, wrapT] of [
    [9985, 300, 257, 9729, 10497, 10497],
    [9986, 7, 5, 9728, 33648, 33071],
    [9987, 1, 9, 9729, 10497, 33648],
    [9728, 7, 5, 9728, 33071, 33648],
    [9729, 1, 1, 9729, 33648, 10497],
  ] as const) {
    const pixels = Uint8Array.from(
      { length: width * height * 4 },
      (_, index) => (index * 37 + Math.floor(index / 4) * 13) % 256,
    );
    const caseDocument = structuredClone(source);
    Object.assign(caseDocument.samplers[0]!, {
      minFilter,
      magFilter,
      wrapS,
      wrapT,
    });
    const caseBytes = glbBytes(caseDocument, binary),
      casePng = rgbaPngFixture(width, height, pixels),
      caseAsset = decodeRigidGltf(caseBytes, {
        format: "glb",
        dependencies: new Map([["maps/surface.png", casePng]]),
      }),
      casePrepared = await prepareRigidGltfPbr(caseAsset);
    const caseInput = {
      geometry: casePrepared.geometry,
      parts: casePrepared.parts,
      images: casePrepared.images.map((image) => ({
        image: image.image,
        rgba: Array.from(image.rgba),
      })),
      runFaults: false,
    };
    const value = await page.evaluate(async (input) => {
      const path = "/tests/helpers/native-pbr-proof.ts",
        proof = (await import(path)) as typeof Proof;
      return proof.nativePbrProof(input);
    }, caseInput);
    assert.equal(value.captures.length, 3);
    assert.equal(value.faults.length, 0);
    assert.equal(value.verificationScratchMemory.reservations, 0);
    assert.deepEqual(value.verificationScratchMemory.current, {
      pixels: 0,
      metadata: 0,
    });
    assert.equal(value.stateRestorations, 3);
    const expectedLevels: { level: number; width: number; height: number }[] = [
      { level: 0, width, height },
    ];
    while (
      minFilter >= 9984 &&
      (expectedLevels.at(-1)!.width > 1 || expectedLevels.at(-1)!.height > 1)
    ) {
      const previous = expectedLevels.at(-1)!;
      expectedLevels.push({
        level: expectedLevels.length,
        width: Math.max(1, Math.floor(previous.width / 2)),
        height: Math.max(1, Math.floor(previous.height / 2)),
      });
    }
    const hashes = value.captures.map((capture) =>
      hash(Uint8Array.from(capture.rgba)),
    );
    assert.equal(hashes[0], hashes[1]);
    assert.equal(hashes[0], hashes[2]);
    for (const frame of value.captures)
      for (const draw of frame.draws)
        for (const texture of draw.textures) {
          assert.equal(draw.version, "native-pbr-gpu-draw-2");
          assert.deepEqual(
            texture.levels.map(({ level, width, height }) => ({
              level,
              width,
              height,
            })),
            expectedLevels,
          );
          assert.equal(
            texture.samples,
            expectedLevels.reduce(
              (sum, mip) => sum + mip.width * mip.height * 4,
              0,
            ),
          );
          assert.ok(texture.levels.every((mip) => mip.maxError <= 0.0001));
          assert.ok(
            texture.levels.every(
              (mip) =>
                mip.storage ===
                (texture.colorSpace === "srgb" ? "srgb8-alpha8" : "rgba8"),
            ),
          );
        }
    await writeFile(join(directory, `case-${minFilter}.glb`), caseBytes, {
      flag: "wx",
    });
    await writeFile(join(directory, `case-${minFilter}.png`), casePng, {
      flag: "wx",
    });
    mipCases.push({
      minFilter,
      width,
      height,
      sampler: caseDocument.samplers[0],
      inputSha256: hash(caseBytes),
      geometrySha256: casePrepared.geometrySha256,
      levels: expectedLevels,
      pixelHashes: hashes,
      draws: value.captures.map((capture) => capture.draws),
      verificationScratchMemory: value.verificationScratchMemory,
      stateRestorations: value.stateRestorations,
    });
  }
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        version: "native-pbr-resources-proof-1",
        status: "passed",
        assetSha256: asset.assetSha256,
        geometrySha256: prepared.geometrySha256,
        sourceSha256: hash(bytes),
        environment,
        producers,
        frames,
        faults: result.faults,
        mipCases,
        verificationScratchMemory: result.verificationScratchMemory,
        stateRestorations: result.stateRestorations,
        verificationBudgetFault: result.verificationBudgetFault,
        allocation: result.allocation,
        scope: result.scope,
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
      additionalMipCases: mipCases.length,
      minFilters: [9984, ...mipCases.map((entry) => entry.minFilter)],
    }) + "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        version: "native-pbr-resources-failure-1",
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
