import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";
import type { Browser, Request } from "playwright";
import { loadComposition } from "@still-shift/animation-engine";
import {
  AnimationEngineError,
  CompositionSchema,
  NativeObservedOutputFrameSchema,
  type NativeObservedOutputFrame,
} from "@still-shift/scene-contract";
import {
  exportScene,
  type ExportRequest,
} from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { createNativeObservationRequest } from "../../packages/animation-engine/src/native-observation.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { createMechanismCommandReceipt } from "../../packages/animation-engine/src/mechanism/protocol.ts";
import { nativeSolidFixture } from "./native3d-fixture.ts";

const hash = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
type ObservedProcess = { pid: number; role: string };
const bounds = {
  width: 32,
  height: 32,
  authoredFrames: 4,
  renderedFrames: 1,
  workers: 1,
  packetBytes: 1048576,
  pixelBytes: 4096,
  processes: 128,
  overallTimeoutMs: 90000,
  collectorTimeoutMs: 2000,
  cleanupTimeoutMs: 2000,
  portTimeoutMs: 500,
} as const;

function absent(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    throw error;
  }
}
function failureFacts(error: unknown) {
  return error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof AnimationEngineError
          ? { context: error.context }
          : {}),
      }
    : { message: String(error) };
}
function connectionRefused(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "ECONNREFUSED") return true;
  if ("cause" in error && connectionRefused(error.cause)) return true;
  return (
    "errors" in error &&
    Array.isArray(error.errors) &&
    error.errors.some(connectionRefused)
  );
}
/** A real native worker and body fail before publication; no synthetic sink packet or GPU handle. */
export async function runNativeExportCancellationProof() {
  const root = resolve(import.meta.dirname, "../..");
  const directory = await mkdtemp(
    "/private/tmp/still-shift-native-export-cancel-",
  );
  const outputDirectory = join(directory, "output");
  await mkdir(outputDirectory);
  const outputPath = join(outputDirectory, "cancelled.mp4");
  const source = nativeSolidFixture();
  const sourceBytes = JSON.stringify(source, null, 2) + "\n";
  const sourcePath = join(directory, "solid.json");
  const compositionPath = join(directory, "composition.json");
  await writeFile(sourcePath, sourceBytes, { flag: "wx" });
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "native-cancellation",
    width: bounds.width,
    height: bounds.height,
    fps: 30,
    frameCount: bounds.authoredFrames,
    background: "#182030",
    assets: [
      {
        id: "solid",
        type: "native3d",
        format: "solid-scene-1",
        path: sourcePath,
        sha256: hash(sourceBytes),
      },
    ],
    layers: [
      {
        id: "world",
        type: "native3d",
        asset: "solid",
        sourceStartFrame: 0,
        sourceFps: 30,
      },
    ],
  });
  await writeFile(
    compositionPath,
    JSON.stringify(composition, null, 2) + "\n",
    { flag: "wx" },
  );
  const controller = new AbortController();
  const reason = Error(
    "Actual native export cancelled after its first complete pixel body",
  );
  const timeoutReason = Error(
    "Native cancellation proof exceeded its bounded frame-start deadline",
  );
  const deadline = setTimeout(
    () => controller.abort(timeoutReason),
    bounds.overallTimeoutMs,
  );
  deadline.unref();
  let browser: Browser | undefined;
  let origin: string | undefined;
  let packet: NativeObservedOutputFrame | undefined;
  let packetBytes: Buffer | undefined;
  let pixels: Buffer | undefined;
  let packetStatus: number | undefined;
  let eventFailure: unknown;
  let verifyFrames = 0;
  let resultCalls = 0;
  let cancellationAt = 0;
  const processes: ObservedProcess[] = [];
  const report: Record<string, unknown> = {
    version: "native-export-cancellation-proof-1",
    status: "running",
    directory,
    startedAt: new Date().toISOString(),
    bounds,
    method:
      "Actual indexed generic solid; authenticated native observation POST and complete frame body; AbortController in public verifyFrame hook",
    receiptScope:
      "Fixture evidence derived from the actual generic export rejection; no native product cancellation DTO is claimed",
    closureScope:
      "Incomplete native export has no published evidence closure; retained packet is an actual observation, not complete output acceptance",
    managedAllocationAndRss:
      "unassessed; process exit and owned artifact cleanup are checked",
    humanVisualListeningAcceptance: "pending",
  };
  const retain = async () =>
    writeFile(
      join(directory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  const receive = (request: Request) => {
    try {
      const path = new URL(request.url()).pathname;
      if (path !== "/_export/native-observation" && path !== "/_export/frame")
        return;
      assert.equal(
        request.headers()["x-frame-index"],
        "0",
        "Only the first real frame may upload",
      );
      const body = request.postDataBuffer();
      assert(body, "Actual upload body must be retained");
      if (path === "/_export/native-observation") {
        assert.equal(
          packetBytes,
          undefined,
          "Only one observation packet may upload",
        );
        assert(body.length > 0 && body.length <= bounds.packetBytes);
        packetBytes = Buffer.from(body);
        packet = NativeObservedOutputFrameSchema.parse(
          JSON.parse(body.toString("utf8")),
        );
      } else {
        assert.equal(
          pixels,
          undefined,
          "Only one complete pixel body may upload",
        );
        assert.equal(body.length, bounds.pixelBytes);
        pixels = Buffer.from(body);
      }
    } catch (error) {
      eventFailure = error;
      controller.abort(error);
    }
  };
  try {
    const loaded = await loadComposition(compositionPath, "webgl2", {
      cacheDirectory: join(directory, "cache"),
      signal: controller.signal,
    });
    const nativeObservation = await createNativeObservationRequest(
      loaded,
      undefined,
      {
        signal: controller.signal,
      },
    );
    assert(
      nativeObservation,
      "Generic solid must request actual native observations",
    );
    await writeFile(
      join(directory, "execution.json"),
      JSON.stringify(nativeObservation.execution, null, 2) + "\n",
      { flag: "wx" },
    );
    report.identity = {
      compositionSourceSha256: loaded.sourceChecksum,
      sourceSha256: hash(sourceBytes),
      geometrySha256: source.geometrySha256,
      appearanceCodeSha256: loaded.nativeAppearanceCodeSha256,
      executionSha256: hash(
        canonicalMechanismJson(nativeObservation.execution),
      ),
      helperSha256: hash(await readFile(import.meta.filename)),
    };
    const request: ExportRequest = {
      runtime: { projectRoot: root },
      scene: loaded.scene,
      sourcePath: loaded.sourcePath,
      depthPath: null,
      assetPaths: loaded.assetPaths,
      outputPath,
      nativeObservation,
      expectedSourceChecksum: loaded.sourceChecksum,
      transport: "raw_rgba",
      workers: 1,
      cacheStatic: false,
      signal: controller.signal,
      resultManifestContents: () => {
        resultCalls++;
        throw Error(
          "An aborted native export must not construct its successful result manifest",
        );
      },
      verifyWorker: async (page, worker) => {
        assert.equal(worker, 0);
        assert.equal(
          browser,
          undefined,
          "Only one actual worker may be launched",
        );
        browser = page.context().browser()!;
        assert(browser);
        origin = new URL(page.url()).origin;
        assert.equal(new URL(origin).hostname, "127.0.0.1");
        page.on("request", receive);
        page.on("response", (response) => {
          if (
            new URL(response.url()).pathname === "/_export/native-observation"
          )
            packetStatus = response.status();
        });
        const session = await browser.newBrowserCDPSession();
        try {
          const actual = (await session.send("SystemInfo.getProcessInfo")) as {
            processInfo: { id: number; type: string }[];
          };
          assert(
            actual.processInfo.length > 0 &&
              actual.processInfo.length <= bounds.processes,
          );
          assert(actual.processInfo.some((value) => value.type === "renderer"));
          assert(
            actual.processInfo.some(
              (value) => value.type.toLowerCase() === "gpu",
            ),
          );
          for (const value of actual.processInfo) {
            assert(Number.isSafeInteger(value.id) && value.id > 0);
            assert(
              !absent(value.id),
              "Actual browser process must be alive before cancellation",
            );
            processes.push({ pid: value.id, role: "chromium-" + value.type });
          }
        } finally {
          await session.detach();
        }
        // Explicit workers use the public runtime's POSIX-time wrapper plus its FFmpeg child.
        // Both are selected from actual OS parentage and this export's unique output locator.
        const snapshot = await runProcess("ps", ["-axo", "pid=,ppid=,args="], {
          maxBuffer: 1048576,
        });
        const rows = snapshot.stdout.split("\n").flatMap((line) => {
          const value = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
          return value
            ? [
                {
                  pid: Number(value[1]),
                  parent: Number(value[2]),
                  args: value[3]!,
                },
              ]
            : [];
        });
        const wrappers = rows.filter(
          (value) =>
            value.parent === process.pid &&
            /^(?:[^\s]*[/\\])?time(?:\s|$)/.test(value.args) &&
            value.args.includes(outputDirectory),
        );
        assert.equal(
          wrappers.length,
          1,
          "One live timing wrapper must belong to this export",
        );
        const encoders = rows.filter(
          (value) =>
            value.parent === wrappers[0]!.pid &&
            /^(?:[^\s]*[/\\])?ffmpeg(?:\s|$)/.test(value.args) &&
            value.args.includes(outputDirectory),
        );
        assert.equal(
          encoders.length,
          1,
          "One live FFmpeg child must belong to the owned wrapper",
        );
        for (const [role, value] of [
          ["ffmpeg-wrapper", wrappers[0]!],
          ["ffmpeg-encoder", encoders[0]!],
        ] as const) {
          assert(
            !absent(value.pid),
            "Actual encoder and wrapper must be alive before abort",
          );
          processes.push({ pid: value.pid, role });
        }
        report.processesBeforeAbort = processes;
      },
      verifyFrame: async (frame, worker) => {
        verifyFrames++;
        assert.equal(frame, 0);
        assert.equal(worker, 0);
        const collectorStarted = performance.now();
        for (;;) {
          if (eventFailure) throw eventFailure;
          controller.signal.throwIfAborted();
          if (packet && packetBytes && pixels && packetStatus !== undefined)
            break;
          if (performance.now() - collectorStarted >= bounds.collectorTimeoutMs)
            throw new AnimationEngineError(
              "RENDER_FAILED",
              "Actual native upload events did not reach the verifier before its bounded deadline",
              {
                stage: "native-export-cancellation-proof",
                diagnosticCode: "comp-native3d-protocol",
                path: "nativeObservations.frames[0]",
                frame: 0,
                timeoutMs: bounds.collectorTimeoutMs,
                observedPacket: Boolean(packet),
                observedPacketBytes: packetBytes?.length ?? 0,
                observedPixelBytes: pixels?.length ?? 0,
                observedPacketHttpStatus: packetStatus ?? "absent",
              },
            );
          await pause(10);
        }
        report.collectorWaitMs = performance.now() - collectorStarted;
        assert(
          packet && packetBytes && pixels,
          "Real native packet and complete body must precede abort",
        );
        await writeFile(
          join(directory, "observed-frame-000000.json"),
          packetBytes,
          { flag: "wx" },
        );
        await writeFile(join(directory, "uploaded-frame-000000.rgba"), pixels, {
          flag: "wx",
        });
        assert.equal(
          packetStatus,
          204,
          "Actual native packet must be accepted before pixel upload",
        );
        assert.equal(packet.outputFrame, 0);
        assert.equal(packet.passes.length, 1);
        const observed = packet.passes[0]!.observed;
        assert.equal(observed.controller, "world");
        assert.equal(observed.sourceFrame, 0);
        assert.equal(observed.sourceSha256, hash(sourceBytes));
        assert.equal(observed.geometrySha256, source.geometrySha256);
        assert.equal(
          observed.appearanceCodeSha256,
          loaded.nativeAppearanceCodeSha256,
        );
        assert(
          observed.pass.completed &&
            observed.pass.calls > 0 &&
            observed.pass.triangles > 0,
        );
        assert(
          new Set(pixels).size > 1,
          "Real solid frame must contain actual nonconstant RGBA",
        );
        report.actualFrame = {
          outputFrame: 0,
          worker,
          packetHttpStatus: packetStatus,
          packetSha256: hash(packetBytes),
          packetBytes: packetBytes.length,
          pixelSha256: hash(pixels),
          pixelBytes: pixels.length,
          passCount: packet.passes.length,
          passCalls: observed.pass.calls,
          triangles: observed.pass.triangles,
          pixelBody: "complete-before-sink-commit",
        };
        cancellationAt = performance.now();
        controller.abort(reason);
        controller.signal.throwIfAborted();
      },
    };
    let rejection: unknown;
    try {
      await exportScene(request);
      throw Error(
        "Actual aborted native export unexpectedly returned a successful result",
      );
    } catch (error) {
      rejection = error;
    }
    report.rejection = failureFacts(rejection);
    report.abortToSettledMs = cancellationAt
      ? performance.now() - cancellationAt
      : null;
    assert.equal(
      rejection,
      reason,
      "Cleanup must preserve the exact actual abort reason",
    );
    assert.equal(controller.signal.reason, reason);
    assert.equal(verifyFrames, 1);
    assert.equal(resultCalls, 0);
    const ownedBrowser = browser as Browser | undefined;
    assert(
      ownedBrowser,
      "The actual export must have launched its owned browser",
    );
    assert.equal(
      ownedBrowser.isConnected(),
      false,
      "Owned pinned browser must close before export rejection settles",
    );
    assert(origin);
    assert.deepEqual(
      await readdir(outputDirectory),
      [],
      "No final or temporary native output may survive",
    );
    const cleanupStarted = performance.now();
    for (;;) {
      const survivors = processes.filter((value) => !absent(value.pid));
      report.survivingProcesses = survivors;
      if (survivors.length === 0) break;
      assert(
        performance.now() - cleanupStarted < bounds.cleanupTimeoutMs,
        "An owned actual Chromium/FFmpeg process survived export cleanup",
      );
      await pause(25);
    }
    report.processesAfterAbort = processes.map((value) => ({
      ...value,
      exited: absent(value.pid),
    }));
    try {
      await fetch(origin, {
        signal: AbortSignal.timeout(bounds.portTimeoutMs),
      });
      throw Error(
        "Owned export HTTP server remained reachable after cancellation",
      );
    } catch (error) {
      report.portAfterAbort = {
        origin,
        refused: connectionRefused(error),
        failure: failureFacts(error),
      };
      assert(
        connectionRefused(error),
        "Actual export port must refuse connections after cleanup",
      );
    }
    assert.equal(hash(await readFile(sourcePath)), hash(sourceBytes));
    assert.equal(hash(await readFile(compositionPath)), loaded.sourceChecksum);
    const receipt = await createMechanismCommandReceipt(
      {
        command: "render",
        status: "cancelled",
        summary: {
          proof: "fixture-native-export-cancellation",
          receiptScope: "fixture-evidence",
          frameCount: bounds.authoredFrames,
          actualObservedFrames: 1,
          finalPublished: false,
          nativeClosurePublished: false,
          reason: reason.message,
          originalAbortReasonPreserved: true,
        },
        items: [
          {
            kind: "actual-native-frame-before-abort",
            frame: 0,
            packetSha256: hash(packetBytes!),
            pixelSha256: hash(pixels!),
          },
        ],
        nextAction:
          "Read retained actual packet, pixel body and cleanup report; cancellation is not final output acceptance",
      },
      { reportPath: join(directory, "cancelled-full-report.json") },
    );
    await writeFile(
      join(directory, "cancelled-receipt.json"),
      JSON.stringify(receipt, null, 2) + "\n",
      { flag: "wx" },
    );
    assert.equal(receipt.status, "cancelled");
    report.cancelledReceipt = {
      path: "cancelled-receipt.json",
      sha256: hash(await readFile(join(directory, "cancelled-receipt.json"))),
    };
    report.status = "passed";
    report.outputAfterCleanup = await readdir(outputDirectory);
    report.successfulResultManifestCalls = resultCalls;
    report.actualVerifiedFrameBodies = verifyFrames;
  } catch (error) {
    report.status = "failed";
    report.failure = failureFacts(error);
    if (eventFailure) report.collectorFailure = failureFacts(eventFailure);
    if (packetBytes)
      await writeFile(
        join(directory, "failed-observation-packet.json"),
        packetBytes,
      );
    if (pixels)
      await writeFile(join(directory, "failed-uploaded-pixels.rgba"), pixels);
    throw error;
  } finally {
    clearTimeout(deadline);
    report.finishedAt = new Date().toISOString();
    await retain();
  }
  return { directory, report };
}
