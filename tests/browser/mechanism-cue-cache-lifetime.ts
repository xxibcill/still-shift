import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Server, type IncomingMessage } from "node:http";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  access,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compileMechanismCueProject,
  prepareMechanismCueNativePlates,
  checkMechanismCueNativePlates,
  renderMechanismCuePlateProject,
  checkMechanismCuePlateOutput,
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
} from "@still-shift/animation-engine";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { AnimationEngineError } from "@still-shift/scene-contract";
import { createVisibleCueProject } from "../helpers/mechanism-visible-cues.ts";
import { parallelOutputProof } from "../helpers/composition-parallel-proof.ts";

const directory = await mkdtemp(
    "/private/tmp/still-shift-ms2-cue-cache-lifetime-",
  ),
  fixture = await createVisibleCueProject(
    join(directory, "project"),
    "tape-hook",
  ),
  plates = join(directory, "plates"),
  owner = new CompositionNodeMemory(),
  foreign = owner.reserve(1024);
let compiledDirectory = join(directory, "compiled");
const checksum = (body: Uint8Array) =>
  "sha256:" + createHash("sha256").update(body).digest("hex");
const bounds = {
  frameBytes: 240 * 136 * 4,
  processes: 128,
  processListingBytes: 256 * 1024,
  deadlineMs: 90000,
  cleanupMs: 2000,
  remainingBudgetBytes: 65535,
} as const;
const report: Record<string, unknown> = {
  version: "ms2-cue-cache-lifetime-proof-1",
  status: "running",
  directory,
  bounds,
  scope:
    "Actual cached API calls, complete real worker HTTP upload observations, in-flight source edits/cancellation, owned artifacts/process exits and declared shared Node capacity/lease retirement. No synthetic frame, response, timer-triggered control, whole physical RSS threshold or driver-internal lifetime claim.",
};
const retain = () =>
  writeFile(
    join(directory, "run.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
function failureFacts(error: unknown) {
  return error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        ...(error instanceof AnimationEngineError
          ? { context: error.context }
          : {}),
      }
    : { message: String(error) };
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}
async function exportCaches() {
  return new Set(
    (await readdir(tmpdir())).filter((name) =>
      name.startsWith("still-shift-export-vite-"),
    ),
  );
}
function unchangedOwner() {
  assert.equal(owner.statistics.current.metadata, 1024);
  assert.equal(owner.statistics.reservations, 1);
  assert.equal(foreign.active, true);
}
/** Observes real HTTP request events; the original emitter and handlers always run. */
async function exercise(
  name: string,
  action: () => void | Promise<void>,
  expectCancel = false,
  expectSuccess = false,
) {
  const output = join(directory, name),
    controller = new AbortController(),
    reason = Error(
      "Cancel actual cached export after its first complete worker frame: " +
        name,
    ),
    priorCaches = await exportCaches(),
    observedProcesses = new Map<number, string>();
  let refreshing: Promise<void> | undefined,
    observationFailure: unknown,
    actionPromise: Promise<void> | undefined,
    actionAt: number | undefined,
    firstFrame:
      | {
          frame: number;
          worker: number;
          bytes: number;
          sha256: string;
          path: string;
          atMs: number;
        }
      | undefined,
    nativeRequests = 0,
    completedUploads = 0,
    parentPeakRssBytes = process.memoryUsage().rss,
    sampledTreePeakRssBytes = 0;
  const interruptedUploads: {
    frame: number;
    receivedBytes: number;
    expectedBytes: number;
  }[] = [];
  const started = performance.now();
  const refresh = () =>
    (refreshing ??= (async () => {
      const listing = await runProcess(
        "ps",
        ["-A", "-o", "pid=,ppid=,rss=,comm="],
        { maxBuffer: bounds.processListingBytes },
      );
      const rows = listing.stdout.split("\n").flatMap((line) => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
        return match
          ? [
              {
                pid: Number(match[1]),
                parent: Number(match[2]),
                rss: Number(match[3]) * 1024,
                role: match[4]!.split("/").at(-1)!,
              },
            ]
          : [];
      });
      const owned = new Set([process.pid]);
      for (let changed = true; changed; ) {
        changed = false;
        for (const row of rows)
          if (owned.has(row.parent) && !owned.has(row.pid)) {
            owned.add(row.pid);
            changed = true;
          }
      }
      for (const row of rows)
        if (
          owned.has(row.pid) &&
          /Chromium|chrome|ffmpeg|ffprobe|time/i.test(row.role)
        )
          observedProcesses.set(row.pid, row.role);
      assert(observedProcesses.size <= bounds.processes);
      sampledTreePeakRssBytes = Math.max(
        sampledTreePeakRssBytes,
        rows
          .filter((row) => owned.has(row.pid))
          .reduce((sum, row) => sum + row.rss, 0),
      );
      parentPeakRssBytes = Math.max(
        parentPeakRssBytes,
        process.memoryUsage().rss,
      );
    })().finally(() => {
      refreshing = undefined;
    }));
  const failObservation = (error: unknown) => {
    observationFailure ??= error;
    controller.abort(error);
  };
  const originalEmit = Server.prototype.emit;
  Server.prototype.emit = function (
    this: Server,
    event: string | symbol,
    ...args: unknown[]
  ) {
    if (event === "request") {
      const request = args[0] as IncomingMessage;
      const path = request.url?.split("?")[0];
      if (request.method === "POST" && path === "/_export/native-observation")
        nativeRequests++;
      if (request.method === "POST" && path === "/_export/frame") {
        const frame = Number(request.headers["x-frame-index"]),
          worker = Number(request.headers["x-export-worker"]);
        // One bounded first body is retained; later uploads are counted without copying.
        const body =
          !firstFrame && frame === 0
            ? Buffer.alloc(bounds.frameBytes)
            : undefined;
        let received = 0;
        const receiveData = (chunk: Buffer) => {
          try {
            assert.equal(worker, 0);
            assert(Number.isSafeInteger(frame) && frame >= 0 && frame < 60);
            assert(received + chunk.length <= bounds.frameBytes);
            body?.set(chunk, received);
            received += chunk.length;
          } catch (error) {
            failObservation(error);
          }
        };
        const receiveEnd = () => {
          try {
            if (
              received !== bounds.frameBytes &&
              expectCancel &&
              controller.signal.aborted &&
              firstFrame &&
              frame > firstFrame.frame
            ) {
              interruptedUploads.push({
                frame,
                receivedBytes: received,
                expectedBytes: bounds.frameBytes,
              });
              return;
            }
            assert.equal(received, bounds.frameBytes);
            completedUploads++;
            if (!body || firstFrame) return;
            const bodyPath = join(directory, name + "-first-frame.rgba");
            firstFrame = {
              frame,
              worker,
              bytes: body.length,
              sha256: checksum(body),
              path: bodyPath,
              atMs: performance.now() - started,
            };
            actionPromise = (async () => {
              await writeFile(bodyPath, body, { flag: "wx" });
              await refresh();
              const live = [...observedProcesses].filter(([pid]) => alive(pid));
              assert(
                live.some(([, role]) => /Chromium|chrome/i.test(role)),
                "Real render browser must be live at the control",
              );
              assert(
                live.some(([, role]) => /ffmpeg/i.test(role)),
                "Real frame encoder must be live at the control",
              );
              (report.liveProcessesAtControls as Record<string, unknown>)[
                name
              ] = live.map(([pid, role]) => ({ pid, role }));
              actionAt = performance.now() - started;
              if (expectCancel) controller.abort(reason);
              else await action();
            })().catch(failObservation);
          } catch (error) {
            failObservation(error);
          }
        };
        const originalRequestEmit = request.emit;
        // Observe the existing reader's emitted chunks without adding a stream reader.
        request.emit = function (
          this: IncomingMessage,
          kind: string | symbol,
          ...values: unknown[]
        ) {
          if (kind === "data") receiveData(values[0] as Buffer);
          else if (kind === "end") receiveEnd();
          return Reflect.apply(originalRequestEmit, this, [kind, ...values]);
        } as typeof originalRequestEmit;
      }
    }
    return Reflect.apply(originalEmit, this, [event, ...args]);
  } as typeof originalEmit;
  const monitor = setInterval(() => {
      void refresh().catch(failObservation);
    }, 40),
    deadline = setTimeout(
      () =>
        controller.abort(Error("Cached lifetime control deadline exceeded")),
      bounds.deadlineMs,
    );
  let result:
      | Awaited<ReturnType<typeof renderMechanismCuePlateProject>>
      | undefined,
    failure: unknown;
  try {
    result = await renderMechanismCuePlateProject(
      fixture.familyPath,
      fixture.cuePath,
      compiledDirectory,
      plates,
      output,
      { signal: controller.signal, nodeMemory: owner },
    );
  } catch (error) {
    failure = error;
  } finally {
    Server.prototype.emit = originalEmit;
    clearInterval(monitor);
    clearTimeout(deadline);
    await actionPromise;
    await refreshing;
  }
  const row: Record<string, unknown> = {
    name,
    status: "failed",
    firstFrame,
    completedUploads,
    interruptedUploads,
    nativeObservationRequests: nativeRequests,
    actionAtMs: actionAt,
    observedProcesses: [...observedProcesses].map(([pid, role]) => ({
      pid,
      role,
    })),
    failure: failureFacts(failure),
    preservedAbortReason: expectCancel ? failure === reason : null,
    sharedNode: owner.statistics,
    sampledPhysicalRss: {
      parentPeakRssBytes,
      sampledTreePeakRssBytes,
      scope:
        "Sampled real process RSS, including test observer; no application allowance threshold or driver-internal allocation claim",
    },
  };
  const rows = report.cases as Record<string, unknown>[];
  rows.push(row);
  await retain();
  assert.equal(observationFailure, undefined);
  assert(firstFrame && actionAt !== undefined);
  assert.equal(firstFrame.frame, 0);
  assert.equal(firstFrame.worker, 0);
  assert.equal(nativeRequests, 0);
  if (expectSuccess) {
    assert.equal(failure, undefined);
    assert(result);
    assert.equal(result.freshNativeSubmissionCalls, 0);
    assert.equal(result.originalNativeFrames, 60);
    assert.equal(completedUploads, 60);
    row.result = result;
  } else {
    assert(
      failure,
      "In-flight source change/cancel must reject rather than publish",
    );
    if (expectCancel) assert.equal(failure, reason);
    else {
      assert(failure instanceof Error);
      const expected =
        name === "cue-label-edit"
          ? /current family\/cue revision/
          : name === "consumed-original-plate-edit"
            ? /Original sequence frame differs from its manifest/
            : /Audio bytes differ from their authored identity/;
      assert.match(failure.message, expected);
    }
    await assert.rejects(access(output));
    row.ownedOutputDirectoryAbsent = true;
  }
  unchangedOwner();
  const cleanupAt = performance.now();
  let survivors: [number, string][];
  for (;;) {
    survivors = [...observedProcesses].filter(([pid]) => alive(pid));
    if (!survivors.length) break;
    assert(
      performance.now() - cleanupAt < bounds.cleanupMs,
      "Observed cached export descendants exceed existing2s cleanup policy",
    );
    await new Promise((done) => setTimeout(done, 25));
  }
  row.cleanupWaitMs = performance.now() - cleanupAt;
  row.survivors = survivors;
  assert.deepEqual(
    [...(await exportCaches())].filter((name) => !priorCaches.has(name)),
    [],
  );
  row.newExportViteCachesAbsent = true;
  row.status = "passed";
  await retain();
  return row;
}
report.cases = [];
report.liveProcessesAtControls = {};
report.mutations = [];
process.stdout.write(JSON.stringify({ status: "running", directory }) + "\n");
try {
  await compileMechanismCueProject(
    fixture.familyPath,
    fixture.cuePath,
    compiledDirectory,
  );
  const capture = await prepareMechanismCueNativePlates(
    fixture.familyPath,
    fixture.cuePath,
    compiledDirectory,
    plates,
    { nodeMemory: owner },
  );
  unchangedOwner();
  report.capture = capture;
  const originals = new Map<string, Buffer>();
  async function collect(path: string) {
    for (const row of await readdir(path, { withFileTypes: true })) {
      const current = join(path, row.name);
      if (row.isDirectory()) await collect(current);
      else {
        assert(row.isFile());
        originals.set(current, await readFile(current));
      }
    }
  }
  await collect(plates);
  report.originalPlateFiles = [...originals].map(([path, body]) => ({
    path,
    bytes: body.length,
    sha256: checksum(body),
  }));
  await exercise("cue-label-edit", async () => {
    const current = await readMechanismCueAuthoring(
        fixture.instance,
        fixture.cuePath,
      ),
      mark = current.document.cues.find((cue) => cue.id === "contact")!
        .annotations![0]!,
      { id, ...annotation } = mark;
    const priorBody = await readFile(fixture.cuePath);
    await patchMechanismCueAuthoring(fixture.instance, fixture.cuePath, {
      schemaVersion: "mechanism-cue-patch-1",
      baseRevision: current.document.revision,
      baseHash: current.projectHash,
      operations: [
        {
          cue: "contact",
          annotation: id,
          property: "annotation",
          value: { ...annotation, text: "Here" },
        },
      ],
    });
    const changedBody = await readFile(fixture.cuePath);
    assert.notEqual(checksum(changedBody), checksum(priorBody));
    (report.mutations as unknown[]).push({
      kind: "cue-label-edit",
      path: fixture.cuePath,
      beforeSha256: checksum(priorBody),
      afterSha256: checksum(changedBody),
      revision: current.document.revision + 1,
    });
  });
  compiledDirectory = join(directory, "current-compiled");
  await compileMechanismCueProject(
    fixture.familyPath,
    fixture.cuePath,
    compiledDirectory,
  );
  const audioPath = join(directory, "project", "narration.wav"),
    audio = await readFile(audioPath);
  try {
    await exercise("current-audio-edit", async () => {
      const body = Buffer.from(audio);
      body[44] = body[44]! ^ 1;
      await writeFile(audioPath, body);
      const changed = await readFile(audioPath);
      assert.notEqual(checksum(changed), checksum(audio));
      (report.mutations as unknown[]).push({
        kind: "current-audio-edit",
        path: audioPath,
        beforeSha256: checksum(audio),
        afterSha256: checksum(changed),
        bytes: changed.length,
      });
    });
  } finally {
    await writeFile(audioPath, audio);
  }
  const platePath = join(plates, "native-000000.png"),
    plate = originals.get(platePath)!;
  try {
    await exercise("consumed-original-plate-edit", async () => {
      const body = Buffer.from(plate);
      body[64] = body[64]! ^ 1;
      await writeFile(platePath, body);
      const changed = await readFile(platePath);
      assert.notEqual(checksum(changed), checksum(plate));
      (report.mutations as unknown[]).push({
        kind: "consumed-original-plate-edit",
        path: platePath,
        beforeSha256: checksum(plate),
        afterSha256: checksum(changed),
        bytes: changed.length,
      });
    });
  } finally {
    await writeFile(platePath, plate);
  }
  await exercise("cancel-first", () => {}, true);
  await exercise("cancel-repeat", () => {}, true);
  const recovery = await exercise("recovery", () => {}, false, true),
    rendered = recovery.result as Awaited<
      ReturnType<typeof renderMechanismCuePlateProject>
    >;
  const checked = await checkMechanismCuePlateOutput(
    fixture.familyPath,
    fixture.cuePath,
    compiledDirectory,
    plates,
    rendered.outputPath,
    { nodeMemory: owner },
  );
  unchangedOwner();
  report.currentOutputCheck = checked;
  const native = await checkMechanismCueNativePlates(
    fixture.familyPath,
    fixture.cuePath,
    compiledDirectory,
    plates,
    { nodeMemory: owner },
  );
  unchangedOwner();
  report.currentOriginalPlateCheck = native;
  const protectedOutput = join(directory, "caller-output");
  await mkdir(protectedOutput);
  const sentinelPath = join(protectedOutput, "keep.txt"),
    sentinel = Buffer.from("Caller-owned output must survive EEXIST\n");
  await writeFile(sentinelPath, sentinel);
  await assert.rejects(
    renderMechanismCuePlateProject(
      fixture.familyPath,
      fixture.cuePath,
      compiledDirectory,
      plates,
      protectedOutput,
      { nodeMemory: owner },
    ),
    /exists|EEXIST/,
  );
  assert.deepEqual(await readFile(sentinelPath), sentinel);
  unchangedOwner();
  report.callerOwnedOutputPreserved = {
    path: sentinelPath,
    bytes: sentinel.length,
    sha256: checksum(sentinel),
  };
  const proofs = await parallelOutputProof(
    rendered.outputPath,
    rendered.metrics,
  );
  report.recoveryOutputProof = proofs;
  const pressure = owner.reserve(
      owner.availableBytes - bounds.remainingBudgetBytes,
    ),
    budgetRows: unknown[] = [];
  try {
    for (const [name, operation] of [
      [
        "capture",
        () =>
          prepareMechanismCueNativePlates(
            fixture.familyPath,
            fixture.cuePath,
            compiledDirectory,
            join(directory, "quota-capture"),
            { nodeMemory: owner },
          ),
      ],
      [
        "original-check",
        () =>
          checkMechanismCueNativePlates(
            fixture.familyPath,
            fixture.cuePath,
            compiledDirectory,
            plates,
            { nodeMemory: owner },
          ),
      ],
      [
        "cached-render",
        () =>
          renderMechanismCuePlateProject(
            fixture.familyPath,
            fixture.cuePath,
            compiledDirectory,
            plates,
            join(directory, "quota-output"),
            { nodeMemory: owner },
          ),
      ],
      [
        "cached-output-check",
        () =>
          checkMechanismCuePlateOutput(
            fixture.familyPath,
            fixture.cuePath,
            compiledDirectory,
            plates,
            rendered.outputPath,
            { nodeMemory: owner },
          ),
      ],
    ] as const) {
      let failure: unknown;
      try {
        await operation();
      } catch (error) {
        failure = error;
      }
      assert(
        (failure instanceof AnimationEngineError &&
          failure.code === "SCENE_INVALID" &&
          failure.message ===
            "Composition source exceeds its available Node capacity") ||
          (failure instanceof Error &&
            /quota|allowance/i.test(failure.message)),
      );
      assert.equal(owner.availableBytes, bounds.remainingBudgetBytes);
      assert.equal(pressure.active, true);
      assert.equal(foreign.active, true);
      budgetRows.push({
        name,
        failure: failureFacts(failure),
        remainingBudgetBytes: owner.availableBytes,
      });
    }
  } finally {
    pressure.release();
  }
  await assert.rejects(access(join(directory, "quota-capture")));
  await assert.rejects(access(join(directory, "quota-output")));
  unchangedOwner();
  report.sharedQuotaRejections = budgetRows;
  for (const [path, body] of originals)
    assert.deepEqual(await readFile(path), body);
  report.allOriginalPlateBytesUnchanged = true;
  const cases = report.cases as { firstFrame: { sha256: string } }[];
  assert(
    cases.every((row) => row.firstFrame.sha256 === cases[0]!.firstFrame.sha256),
  );
  report.allActualFirstWorkerFramesIdentical = true;
  report.finalSharedNodeBeforeDisposal = owner.statistics;
  owner.dispose();
  assert.equal(owner.statistics.reservations, 0);
  assert.equal(owner.statistics.current.metadata, 0);
  assert.equal(foreign.active, false);
  report.finalSharedNodeAfterDisposal = owner.statistics;
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = failureFacts(error);
  throw error;
} finally {
  owner.dispose();
  await retain();
}
process.stdout.write(JSON.stringify({ status: "passed", directory }) + "\n");
