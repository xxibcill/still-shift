import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import type * as Proof from "../helpers/native-pbr-composition-proof.ts";
import { loadComposition } from "../../packages/animation-engine/src/composition-render.ts";
import { createNativeObservationRequestVersions } from "../../packages/animation-engine/src/native-observation.ts";
import { isNativeObservationRequestV3 } from "../../packages/execution-runtime/src/native-observation-dispatch.ts";
import { nativePbrJournalProof } from "../helpers/native-pbr-journal-proof.ts";
import { createNativePbrCompositionFixture } from "../helpers/native-pbr-composition-fixture.ts";

const hash = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const root = resolve(import.meta.dirname, "../..");
const { directory } = await createNativePbrCompositionFixture();
const loaded = await loadComposition(
  join(directory, "composition.json"),
  "webgl2",
);
assert.equal(
  loaded.preparedNative3D?.version,
  "composition-prepared-native3d-3",
);
assert.ok(!JSON.stringify(loaded.preparedNative3D).includes('"rgba"'));
const request3 = await createNativeObservationRequestVersions(loaded);
assert.ok(request3 && isNativeObservationRequestV3(request3));
assert.equal(request3.execution.version, "native-observation-execution-3");
assert.equal(request3?.expectedPasses(0)[0]?.version, "native3d-frame-3");
const requests: { id: string; fault: string | null; bytes: number }[] = [];
const server = await createServer({
  root,
  appType: "custom",
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
  if (req.url !== "/pbr-composition-proof") {
    next();
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><html><body></body></html>");
});

server.middlewares.use(async (req, res, next) => {
  const url = new URL(req.url!, "http://localhost");
  if (!url.pathname.startsWith("/pbr-asset/")) return next();
  const id = url.pathname.slice("/pbr-asset/".length),
    fault = url.searchParams.get("fault"),
    path = Object.hasOwn(loaded.assetPaths, id)
      ? loaded.assetPaths[id]
      : undefined;
  if (!path || fault === "missing") {
    res.statusCode = 404;
    res.end();
    return;
  }
  let bytes = await readFile(path);
  const expected = bytes.length;
  if (fault === "checksum") {
    bytes = Buffer.from(bytes);
    bytes[0] = bytes[0]! ^ 255;
  }
  if (fault === "oversize") bytes = Buffer.concat([bytes, Buffer.from([1])]);
  if (fault === "short") bytes = bytes.subarray(0, bytes.length - 1);
  // Chunked framing allows an actual body-length disagreement even though the declared length is correct.
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-PBR-Declared-Bytes", expected);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", fault === "length" ? expected + 1 : expected);
  if (fault === "oversize" || fault === "short") {
    res.setHeader("Transfer-Encoding", "chunked");
    res.removeHeader("Content-Length");
  }
  requests.push({ id, fault, bytes: bytes.length });
  res.end(bytes);
});
let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
try {
  await server.listen();
  browser = await launchRenderBrowser();
  const page = await browser.newPage();
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0] + "pbr-composition-proof");
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const serialized = await page.evaluate(
    async (serialized) => {
      const proofPath = "/tests/helpers/native-pbr-composition-proof.ts";
      const proof = (await import(proofPath)) as typeof Proof;
      const input = JSON.parse(serialized) as Parameters<
        typeof proof.nativePbrCompositionProof
      >;
      return JSON.stringify(await proof.nativePbrCompositionProof(...input));
    },
    JSON.stringify([
      loaded.composition,
      loaded.preparedNative3D,
      loaded.nativeAppearanceCodeIdentity,
    ]),
  );
  const result = JSON.parse(serialized) as Awaited<
    ReturnType<typeof Proof.nativePbrCompositionProof>
  >;
  const captures = [];
  for (const [index, capture] of result.captures.entries()) {
    const pixels = Buffer.from(capture.rgba),
      frame = capture.frames[0]!;
    assert.equal(frame.version, "native3d-frame-3");
    assert.equal(pixels.length, 320 * 180 * 4);
    assert.ok(pixels.some((value, index) => index % 4 === 3 && value === 255));
    assert.ok(
      Math.abs(
        frame.frame.anchors["lever.tip"]!.world[0] -
          (capture.frame === 0 ? 5 : capture.frame === 10 ? 3 : 5 - Math.SQRT2),
      ) < 1e-12,
    );
    const png = join(directory, `capture-${index}.png`);
    await writeFile(png, Buffer.from(capture.pngBase64, "base64"));
    captures.push({
      ...capture,
      rgba: undefined,
      pngBase64: undefined,
      png,
      pixelSha256: hash(pixels),
    });
  }
  assert.notEqual(captures[0]!.pixelSha256, captures[1]!.pixelSha256);
  assert.notEqual(captures[1]!.pixelSha256, captures[2]!.pixelSha256);
  for (const [first, repeated] of [
    [0, 3],
    [2, 4],
    [1, 5],
  ])
    assert.equal(
      captures[first!]!.pixelSha256,
      captures[repeated!]!.pixelSha256,
    );
  const worldArtwork = [];
  for (const artwork of result.worldArtwork) {
    const pixels = Buffer.from(artwork.rgba),
      png = join(directory, `artwork-${artwork.id}.png`);
    await writeFile(png, Buffer.from(artwork.pngBase64, "base64"));
    assert.equal(artwork.packet.passes.length, 1);
    const receipt = artwork.packet.passes[0]!.observed;
    assert.equal(receipt.version, "native3d-observed-frame-3");
    if (receipt.version !== "native3d-observed-frame-3")
      throw Error("Artwork fixture protocol");
    assert.ok(!Object.hasOwn(receipt.meshes, "yellow-marker"));
    worldArtwork.push({
      ...artwork,
      rgba: undefined,
      pngBase64: undefined,
      png,
      pixelSha256: hash(pixels),
    });
  }
  assert.equal(worldArtwork.length, 2);
  assert.notEqual(worldArtwork[0]!.pixelSha256, worldArtwork[1]!.pixelSha256);
  const stylePixelSha256 = hash(Buffer.from(result.style.rgba));
  assert.notEqual(stylePixelSha256, captures[0]!.pixelSha256);
  const stylePng = join(directory, "style.png");
  await writeFile(stylePng, Buffer.from(result.style.pngBase64, "base64"));
  assert.equal(result.negatives.length, 9);
  assert.ok(
    result.negatives
      .find((item) => item.id === "binary-oversize")!
      .message.includes("exceeds its exact body size"),
  );
  assert.ok(
    result.negatives
      .find((item) => item.id === "binary-short")!
      .message.includes("differs from its exact body size"),
  );
  for (const negative of result.negatives.filter((item) =>
    item.id.startsWith("binary-"),
  ))
    assert.deepEqual(negative.current, { pixels: 0, metadata: 0 });
  assert.ok(
    result.negatives
      .find((item) => item.id === "binary-checksum")!
      .message.includes("checksum"),
  );
  for (const capture of result.captures) {
    assert.equal(capture.packet.version, "native3d-observed-output-frame-3");
    assert.equal(capture.packet.passes.length, 1);
    assert.equal(
      capture.packet.passes[0]!.observed.version,
      "native3d-observed-frame-3",
    );
  }
  for (const id of [
    "source3-read-before-completion",
    "source3-busy-frame",
    "source3-sync-frame",
  ])
    assert.ok(result.negatives.some((negative) => negative.id === id));
  const journal3 = await nativePbrJournalProof(
    loaded,
    result.captures[0]!.packet,
    Buffer.from(result.captures[0]!.rgba),
    directory,
  );
  const record = {
    version: "native-pbr-composition-proof-1",
    status: "passed",
    scope:
      "actual production composition preview with separate HTTP binaries and explicit output3 collection/pixel parity; normal source3 export has separate evidence",
    environment,
    inputs: {
      composition: loaded.composition,
      transport: loaded.preparedNative3D,
      nativeAppearanceCodeIdentity: loaded.nativeAppearanceCodeIdentity,
    },
    requests,
    captures,
    worldArtwork,
    journal3,
    style: {
      frame: result.style.frame,
      pixelSha256: stylePixelSha256,
      png: stylePng,
    },
    negatives: result.negatives,
    memory: result.memory,
    cleanup: result.cleanup,
    source3ExportAdmission:
      "explicit execution3 request admitted; normal export separately verified",
  };
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(record, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      directory,
      captures: captures.length,
      binaryFaults: 5,
      protocolFaults: result.negatives.filter(
        (negative) => !negative.id.startsWith("binary-"),
      ).length,
      worldArtworkCases: worldArtwork.length,
      stylePixelSha256,
      memory: result.memory,
      cleanup: result.cleanup,
    }),
  );
} catch (error) {
  await writeFile(
    join(directory, "failed.json"),
    JSON.stringify(
      {
        message: String(error),
        requests,
        assetPaths: loaded.assetPaths,
        transport: loaded.preparedNative3D,
      },
      null,
      2,
    ),
  );
  console.error(JSON.stringify({ directory, requests }));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
