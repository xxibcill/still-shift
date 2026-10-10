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
  Native3DLayerSchema,
  NativeObservedOutputFrameV2Schema,
} from "@still-shift/scene-contract";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { sampleNativeFrameV2 } from "../../packages/renderer-core/src/native3d/evaluate-v2.ts";
import { assertNativeObservedFrameV2 } from "../../packages/renderer-core/src/native3d/observed-validation-v2.ts";
import {
  loadNativeAppearanceCodeIdentity,
  hashNativeAppearanceCodeIdentity,
  assertNativeAppearanceCodeIdentity,
} from "../../packages/animation-engine/src/native3d-appearance-identity.ts";
import type * as Proof from "../helpers/native3d-frame-observation-proof.ts";

const hash = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
export async function runNativeFrameObservationProofV2() {
  const root = resolve(import.meta.dirname, "../.."),
    directory = await mkdtemp(
      "/private/tmp/still-shift-ms2-frame-observation-",
    );
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
      requiredIntervals: [{ startFrame: 0, endFrameExclusive: 20 }],
      allowedOutsideProof: ["authored-hidden", "outside-frustum"],
    };
  const bytes = JSON.stringify(source, null, 2) + "\n",
    sourceSha256 = hash(bytes);
  await writeFile(join(directory, "source.json"), bytes, { flag: "wx" });
  const appearanceCodeIdentity = await loadNativeAppearanceCodeIdentity(),
    appearanceCodeSha256 = hashNativeAppearanceCodeIdentity(
      appearanceCodeIdentity,
    );
  await writeFile(
    join(directory, "appearance-code-identity.json"),
    JSON.stringify(appearanceCodeIdentity, null, 2) + "\n",
    { flag: "wx" },
  );
  const paths = [
    "tests/browser/native3d-frame-observation.ts",
    "tests/helpers/native3d-frame-observation-proof.ts",
    "packages/scene-contract/src/native3d/observation-v2.ts",
    "packages/scene-contract/src/native3d/shape-observation.ts",
    "packages/renderer-core/src/native3d/three-shape-observation.ts",
    "packages/renderer-core/src/native3d/three-frame-seal-v2.ts",
    "packages/renderer-core/src/native3d/used-landmarks.ts",
    "packages/renderer-core/src/native3d/observed-validation-v2.ts",
    "packages/renderer-core/src/native3d/observed-precision-v2.ts",
    "packages/renderer-core/src/native3d/used-indexed-streams.ts",
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
    if (req.url !== "/frame2-proof") {
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
    await page.goto(server.resolvedUrls!.local[0]! + "frame2-proof");
    const environment = await probeRenderEnvironment(page);
    assertPinnedRenderEnvironment(environment);
    const result = await page.evaluate(
      async (input) => {
        const path = "/tests/helpers/native3d-frame-observation-proof.ts";
        const proof = (await import(path)) as typeof Proof;
        return proof.nativeFrameObservationProofV2(
          input.source,
          input.sourceSha256,
          input.appearanceCodeSha256,
        );
      },
      { source, sourceSha256, appearanceCodeSha256 },
    );
    const prepared = await prepareNative3DSceneV2(source, sourceSha256),
      variant = prepared.variants[prepared.baseSourceKey]!,
      controller = Native3DLayerSchema.parse({
        id: "world",
        type: "native3d",
        asset: "mechanism",
        sourceStartFrame: 0,
        sourceFps: 30,
      });
    const frames: {
      id: string;
      rgbaSha256: string;
      receiptSha256: string;
      bytes: number;
      positionedAnchors: number;
      notDrawnAnchors: number;
    }[] = [];
    for (const capture of result.captures) {
      const bend = capture.id === "bent-b",
        hidden = capture.id === "allowed-hidden",
        outside = capture.id === "allowed-outside",
        frame = hidden || outside ? 21 : bend ? 17.25 : 0.5;
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
            : bend
              ? {
                  camera: {
                    ...source.camera,
                    position: [7, 6, 16],
                    target: [4, 1, 0],
                    fovDegrees: 44,
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
          scope: "actual-frame2",
          scopeFrame: frame + 80,
          layerTime: frame,
          owningScopeFps: 30,
          width: 320,
          height: 180,
        },
      );
      const receipt = await assertNativeObservedFrameV2(
        variant,
        expected,
        capture.receipt,
        appearanceCodeSha256,
      );
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
        receiptSha256: hash(receiptBytes),
        bytes: rgba.byteLength,
        positionedAnchors: Object.values(receipt.anchors).filter(
          (anchor) => anchor.status === "positioned",
        ).length,
        notDrawnAnchors: Object.values(receipt.anchors).filter(
          (anchor) => anchor.status === "not-drawn",
        ).length,
      });
    }
    const pixels = (id: string) =>
      frames.find((frame) => frame.id === id)!.rgbaSha256;
    assert.equal(pixels("rest-a"), pixels("sealed-a-with-later-cpu-b"));
    assert.equal(pixels("rest-a"), pixels("rest-a-before-stale"));
    assert.notEqual(pixels("rest-a"), pixels("bent-b"));
    assert.equal(frames.length, 6);
    assert.equal(result.negatives.length, 4);
    const packet = NativeObservedOutputFrameV2Schema.parse({
      version: "native3d-observed-output-frame-2",
      outputFrame: 0,
      executionSha256: appearanceCodeSha256,
      passes: result.captures.map((capture, sampleIndex) => ({
        sampleIndex,
        sampleFrame: sampleIndex / 2,
        observed: capture.receipt,
      })),
    });
    await writeFile(
      join(directory, "packet.contract-example.json"),
      JSON.stringify(packet, null, 2) + "\n",
      { flag: "wx" },
    );
    await assertNativeAppearanceCodeIdentity(appearanceCodeIdentity);
    await writeFile(
      join(directory, "run.json"),
      JSON.stringify(
        {
          version: "native3d-frame-observation-proof-2",
          status: "passed",
          sourceSha256,
          appearanceCodeSha256,
          environment,
          producers,
          frames,
          negatives: result.negatives,
          scope: result.scope,
          independentNodeChecks: {
            fullFrames: frames.length,
            positionedAnchors: frames.reduce(
              (sum, frame) => sum + frame.positionedAnchors,
              0,
            ),
            notDrawnAnchors: frames.reduce(
              (sum, frame) => sum + frame.notDrawnAnchors,
              0,
            ),
            matrices: "unchanged-1e-8",
            pixels: "unchanged-0.5px",
            landmarks: "exact-independent-packed-float32-means",
          },
          limits:
            "Standalone full observed-frame2 and output packet contract example only. Example execution/sample ordinals are not an authenticated composition export assignment. No asset/transport/runtime/export dispatch, reusable families, pilot or human acceptance.",
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
          appearanceCodeSha256,
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
  await runNativeFrameObservationProofV2();
