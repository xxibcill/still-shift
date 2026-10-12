import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  access,
  open,
} from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { compileMechanismCueProject } from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { createCueProjectFixture } from "./mechanism-cue-project.ts";
import { prepareMechanismCueNativePlates } from "../../packages/animation-engine/src/mechanism/cue-native-plates.ts";
const sha = (b: Uint8Array) =>
  "sha256:" + createHash("sha256").update(b).digest("hex");
/** Real staged PNG/native journal evidence triggers cancellation of the owning capture. */
export async function nativePlateCancellationProof() {
  const directory = await mkdtemp(
      "/private/tmp/still-shift-ms2-native-plate-cancel-",
    ),
    fixture = await createCueProjectFixture(directory, "tape-hook");
  const compiled = join(directory, "compiled"),
    plates = join(directory, "plates");
  await compileMechanismCueProject(
    fixture.familyPath,
    fixture.cuePath,
    compiled,
  );
  const controller = new AbortController(),
    reason = Error(
      "Native plate capture canceled after actual staged PNG and native journal body",
    );
  let checking = false,
    stagedPng: { bytes: number; sha256: string } | undefined,
    packet: Record<string, unknown> | undefined,
    watchFailure: unknown;
  const processes = new Map<number, string>();
  const watch = async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      const listing = await runProcess("ps", ["-A", "-o", "pid=,ppid=,comm="], {
        maxBuffer: 256 * 1024,
      });
      const rows = listing.stdout.split("\n").flatMap((line) => {
        const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
        return m
          ? [{ pid: Number(m[1]), parent: Number(m[2]), role: m[3]! }]
          : [];
      });
      const owned = new Set([process.pid]);
      let changed = true;
      while (changed) {
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
          /(?:Chromium|chrome|ffmpeg|time)/i.test(row.role)
        )
          processes.set(row.pid, row.role);
      assert(
        processes.size <= 128,
        "Observed cancellation process bound exceeded",
      );
      let names: string[];
      try {
        names = await readdir(plates);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const name of names.filter(
        (name) =>
          name.startsWith(".native-frames.png.") && name.endsWith(".stage"),
      )) {
        const path = join(plates, name, "frame.000000.png");
        try {
          const b = await readFile(path);
          if (
            b.length > 26 &&
            b.length < 1024 * 1024 &&
            b
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
            b
              .subarray(b.length - 12)
              .equals(
                Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]),
              )
          )
            stagedPng = { bytes: b.length, sha256: sha(b) };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      for (const name of names.filter(
        (name) =>
          name.includes("native-observations.000.ndjson") &&
          name.endsWith(".tmp"),
      )) {
        const handle = await open(join(plates, name), "r");
        try {
          const b = Buffer.alloc(65536);
          const { bytesRead } = await handle.read(b, 0, b.length, 0);
          const line = b.subarray(0, bytesRead).toString("utf8").split("\n");
          if (line.length > 1)
            packet = JSON.parse(line[0]!) as Record<string, unknown>;
        } finally {
          await handle.close();
        }
      }
      if (stagedPng && packet) controller.abort(reason);
    } catch (error) {
      watchFailure = error;
      controller.abort(error);
    } finally {
      checking = false;
    }
  };
  const timer = setInterval(() => {
    void watch();
  }, 40);
  const deadline = setTimeout(
    () =>
      controller.abort(Error("Actual plate cancellation deadline exceeded")),
    90000,
  );
  let failure: unknown;
  try {
    await prepareMechanismCueNativePlates(
      fixture.familyPath,
      fixture.cuePath,
      compiled,
      plates,
      { signal: controller.signal },
    );
  } catch (error) {
    failure = error;
  } finally {
    clearInterval(timer);
    clearTimeout(deadline);
    while (checking) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const report: Record<string, unknown> = {
    version: "ms2-native-plate-cancellation-proof-1",
    status: "failed",
    directory,
    scope:
      "Actual staged PNG/native-journal capture cancellation, owned artifact cleanup and observed descendant exit; no published closure or cached reuse proof",
    stagedPng,
    packet,
    observedProcesses: [...processes].map(([pid, role]) => ({ pid, role })),
    error: String(failure),
    watchFailure: watchFailure ? String(watchFailure) : null,
  };
  try {
    assert.equal(watchFailure, undefined);
    assert.equal(failure, reason);
    assert(stagedPng && packet);
    const row = packet as {
      packet: {
        outputFrame: number;
        passes: {
          observed: {
            pass: { completed: boolean; calls: number; triangles: number };
            sourceVersion: string;
          };
        }[];
      };
      pixel: { byteLength: number; transport: string };
    };
    assert.equal(row.packet.outputFrame, 0);
    assert.equal(row.pixel.byteLength, 240 * 136 * 4);
    assert.equal(row.pixel.transport, "raw_rgba");
    assert.equal(row.packet.passes.length, 1);
    const observed = row.packet.passes[0]!.observed;
    assert.equal(observed.sourceVersion, "mechanism-scene-2");
    assert(
      observed.pass.completed &&
        observed.pass.calls > 0 &&
        observed.pass.triangles > 0,
    );
    assert([...processes.values()].some((role) => /ffmpeg/i.test(role)));
    assert(
      [...processes.values()].some((role) => /Chromium|chrome/i.test(role)),
    );
    await assert.rejects(() => access(plates));
    report.ownedCaptureDirectoryAbsent = true;
    const cleanupStarted = performance.now();
    let survivors: [number, string][];
    for (;;) {
      survivors = [...processes].filter(([pid]) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
          throw error;
        }
      });
      report.survivors = survivors;
      if (!survivors.length) break;
      assert(
        performance.now() - cleanupStarted < 2000,
        "Owned native capture descendants exceeded existing2s cleanup deadline",
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    report.cleanupWaitMs = performance.now() - cleanupStarted;
    report.status = "passed";
    report.survivors = survivors;
    report.ownedCaptureDirectoryAbsent = true;
  } finally {
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  return report;
}
