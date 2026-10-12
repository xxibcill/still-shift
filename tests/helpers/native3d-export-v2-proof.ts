import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { loadComposition } from "@still-shift/animation-engine";
import {
  exportScene,
  isNativeObservationRequestV2,
  verifyNativeObservationClosureV2,
  type ExportRequest,
} from "@still-shift/execution-runtime/export";
import {
  NativeObservedOutputFrameV2Schema,
  type NativeObservedOutputFrameV2,
} from "@still-shift/scene-contract";
import { createNativeObservationRequestVersions } from "../../packages/animation-engine/src/native-observation.ts";
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
/** Actual browser HTTP bodies, independent retained-row replay and final output checks; generic fixture only. */
export async function proveNativeExportV2HTTP(root: string, directory: string) {
  const compositionPath = join(directory, "composition.json");
  const runs = [];
  for (const fault of [
    null,
    "packet-downgrade",
    "frame2-key",
    "sample-clock",
    "missing-pass",
    "wrong-worker",
    "wrong-credential",
    "foreign-origin",
  ] as const) {
    const loaded = await loadComposition(compositionPath, "webgl2");
    const binding = await createNativeObservationRequestVersions(loaded);
    assert.ok(binding && isNativeObservationRequestV2(binding));
    const frames = new Map<number, Buffer>(),
      packets = new Map<number, Buffer>();
    const outputPath = join(directory, (fault ?? "instrumented") + ".mp4");
    let injected = false;
    const request: ExportRequest = {
      runtime: { projectRoot: root },
      scene: loaded.scene,
      sourcePath: loaded.sourcePath,
      depthPath: null,
      assetPaths: loaded.assetPaths,
      outputPath,
      transport: "raw_rgba",
      encoder: "libx264",
      nativeObservation: binding,
      expectedSourceChecksum: loaded.sourceChecksum,
      verifyWorker: async (page, worker) => {
        assert.equal(worker, 0);
        await page.route("**/_export/frame", async (route) => {
          const req = route.request(),
            frame = Number(req.headers()["x-frame-index"]),
            bytes = req.postDataBuffer();
          assert.ok(bytes);
          assert.equal(
            bytes.length,
            loaded.composition.width * loaded.composition.height * 4,
          );
          assert.ok(!frames.has(frame));
          frames.set(frame, Buffer.from(bytes));
          await route.continue();
        });
        await page.route("**/_export/native-observation", async (route) => {
          const req = route.request(),
            frame = Number(req.headers()["x-frame-index"]),
            bytes = req.postDataBuffer();
          assert.ok(bytes);
          assert.ok(bytes.length <= binding.maximumPacketBytes);
          assert.ok(!packets.has(frame));
          packets.set(frame, Buffer.from(bytes));
          if (!fault || injected) {
            await route.continue();
            return;
          }
          if (
            fault === "wrong-worker" ||
            fault === "wrong-credential" ||
            fault === "foreign-origin"
          ) {
            injected = true;
            const headers = { ...req.headers() };
            if (fault === "wrong-worker") headers["x-export-worker"] = "1";
            else if (fault === "wrong-credential")
              headers["x-export-credential"] = "wrong-owner";
            else headers.origin = "http://foreign.invalid";
            if (fault === "foreign-origin") {
              // Chromium overwrites a continued request's Origin. Route fetch sends
              // the forged header to the same authenticated Node endpoint explicitly.
              try {
                const response = await route.fetch({ headers });
                assert.equal(
                  response.status(),
                  403,
                  "Foreign origin must be rejected by the actual server",
                );
                await route.fulfill({ response });
              } catch (error) {
                await route.abort("failed");
                throw error;
              }
            } else await route.continue({ headers });
            return;
          }
          const packet = NativeObservedOutputFrameV2Schema.parse(
            JSON.parse(bytes.toString()),
          );
          const sample = packet.passes.find(
            (pass) => pass.observed.version === "native3d-observed-frame-2",
          );
          assert.ok(sample);
          injected = true;
          if (fault === "packet-downgrade") {
            const body = JSON.stringify({
              ...packet,
              version: "native3d-observed-output-frame-1",
            });
            await route.continue({ postData: body });
            return;
          }
          if (fault === "frame2-key") {
            assert.equal(sample.observed.version, "native3d-observed-frame-2");
            if (sample.observed.version !== "native3d-observed-frame-2")
              throw Error("Missing actual frame2");
            sample.observed.frameKeySha256 = hash("forged-frame-key");
          } else if (fault === "sample-clock") sample.sampleFrame += 0.01;
          else packet.passes.pop();
          await route.continue({ postData: JSON.stringify(packet) });
        });
      },
    };
    let error: string | undefined;
    try {
      const metrics = await exportScene(request);
      assert.equal(fault, null, "A forged packet must never publish");
      const closure = metrics.nativeObservations;
      assert.equal(closure?.version, "native-observation-closure-2");
      if (!closure || closure.version !== "native-observation-closure-2")
        throw Error("Missing closure2");
      assert.equal(frames.size, 6);
      assert.equal(packets.size, 6);
      const output = {
        sha256: hash(await readFile(outputPath)),
        frameCount: 6,
        width: loaded.composition.width,
        height: loaded.composition.height,
        transport: "raw_rgba" as const,
      };
      assert.equal(closure.outputSha256, output.sha256);
      const verified = await verifyNativeObservationClosureV2({
        closure,
        execution: binding.execution,
        expectedPasses: binding.expectedPasses,
        output,
        async onFrame(packet, pixel) {
          assert.equal(pixel.transport, "raw_rgba");
          assert.equal(
            pixel.byteLength,
            frames.get(packet.outputFrame)!.length,
          );
          assert.equal(
            pixel.transportBytesSha256,
            hash(frames.get(packet.outputFrame)!),
          );
          assert.deepEqual(
            packet,
            JSON.parse(
              packets.get(packet.outputFrame)!.toString(),
            ) as NativeObservedOutputFrameV2,
          );
          await writeFile(
            join(directory, `http-frame-${packet.outputFrame}.rgba`),
            frames.get(packet.outputFrame)!,
            { flag: "wx" },
          );
          await writeFile(
            join(directory, `http-frame-${packet.outputFrame}.json`),
            packets.get(packet.outputFrame)!,
            { flag: "wx" },
          );
        },
      });
      assert.equal(verified.outputFrames, 6);
      assert.equal(verified.passCount, 36);
      runs.push({
        id: "actual-http-and-independent-replay",
        status: "passed",
        metrics,
        verified,
        actualPixelBodies: frames.size,
        actualObservationBodies: packets.size,
      });
    } catch (caught) {
      if (!fault) throw caught;
      error = String(caught);
    }
    if (fault) {
      assert.ok(
        injected && error,
        "Fault must reach authenticated server and fail",
      );
      assert.equal(
        frames.size,
        0,
        `No pixel request may follow a rejected first observation: ${fault}`,
      );
      await assert.rejects(access(outputPath));
      await assert.rejects(access(outputPath + ".native-observations.json"));
      runs.push({
        id: fault,
        status: "passed-rejection",
        error,
        actualObservationBodies: packets.size,
        actualPixelBodies: frames.size,
        outputPublished: false,
      });
    }
  }
  return runs;
}
