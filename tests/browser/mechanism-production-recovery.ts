import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rename,
  cp,
  stat,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { createCueProjectFixture } from "../helpers/mechanism-cue-project.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
import {
  MechanismProductionQueueStateSchema,
  MechanismProductionQueueSchema,
  readMechanismFamilyAuthoring,
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
  inspectMechanismProductionNativeItem,
  type MechanismProductionQueueProduct,
} from "@still-shift/animation-engine";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { runProcess } from "@still-shift/execution-runtime/subprocess";

let root = await mkdtemp("/private/tmp/still-shift-ms3-native-recovery-");
const originalRoot = root,
  stages: unknown[] = [];
const activeChildren = new Set<ChildProcess>();
const cli = join(process.cwd(), "tools/still-shift-cli/src/cli.ts");
const load = async <T = unknown>(path: string) =>
  JSON.parse(await readFile(path, "utf8")) as T;
const save = async (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n");
const hash = async (path: string) => {
  const bytes = await readFile(path);
  return {
    path,
    bytes: bytes.length,
    sha256: "sha256:" + createHash("sha256").update(bytes).digest("hex"),
  };
};
const manifest = () => join(root, "queue.json"),
  output = () => join(root, "output");
const state = async () =>
  MechanismProductionQueueStateSchema.parse(
    await load(join(output(), "queue-state.json")),
  );
const record = async (name: string, details: unknown) => {
  const path = join(root, `stage-${stages.length}-${name}.json`);
  await save(path, details);
  stages.push({ name, file: await hash(path) });
  await save(join(root, "progress.json"), {
    status: "running",
    originalRoot,
    root,
    stages,
  });
};
async function command(name: string, args: string[]) {
  const result = await runProcess(
    process.execPath,
    ["--import", "tsx", cli, "production", name, ...args],
    { maxBuffer: 65536 },
  );
  // runProcess rejects nonzero exits; nonzero commands use the bounded child helper below.
  assert(Buffer.byteLength(result.stdout) <= 32768);
  const receipt = MechanismCommandReceiptSchema.parse(
    JSON.parse(result.stdout),
  );
  await record(`cli-${name}`, { args, receipt });
  return receipt;
}
function startRun(report: string) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      cli,
      "production",
      "run",
      "--manifest",
      manifest(),
      "--output-dir",
      output(),
      "--report",
      report,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  activeChildren.add(child);
  let stdout = "",
    stderr = "",
    overflow = false;
  child.stdout.on("data", (b) => {
    const next = stdout + String(b);
    if (Buffer.byteLength(next) > 65536) {
      overflow = true;
      child.kill("SIGKILL");
    } else stdout = next;
  });
  child.stderr.on("data", (b) => {
    const next = stderr + String(b);
    if (Buffer.byteLength(next) > 65536) {
      overflow = true;
      child.kill("SIGKILL");
    } else stderr = next;
  });
  const ended = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      activeChildren.delete(child);
      if (overflow)
        reject(Error("Owned native worker output exceeded65536 bytes"));
      else resolve({ code, signal, stdout, stderr });
    });
  });
  return { child, ended };
}
async function stopOwnedChildren() {
  for (const child of activeChildren) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    child.kill("SIGTERM");
    const closed = new Promise<void>((resolve) =>
      child.once("close", () => resolve()),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      closed,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 10000);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      } else child.kill("SIGKILL");
      await closed;
    }
  }
}
async function waitUntil(
  check: () => Promise<boolean>,
  child: ReturnType<typeof startRun>["child"],
) {
  const started = Date.now();
  while (Date.now() - started < 180000) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw Error("Native worker exited before the observed injection point");
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error(
    "Native injection point was not observed within its fixed budget",
  );
}
async function run(name: string, expected = 0) {
  const result = await startRun(join(root, name + "-state.json")).ended;
  assert.equal(result.code, expected);
  assert.equal(result.signal, null);
  assert(Buffer.byteLength(result.stdout) <= 32768);
  const receipt = MechanismCommandReceiptSchema.parse(
    JSON.parse(result.stdout),
  );
  await record(name, { result, receipt, state: await state() });
  return state();
}
async function retry(ids: string[]) {
  const current = MechanismProductionQueueSchema.parse(await load(manifest()));
  const request = join(root, `retry-${current.revision}.json`);
  await save(request, {
    schemaVersion: "mechanism-production-retry-1",
    baseRevision: current.revision,
    baseHash: mechanismPackHash(current),
    episodes: ids,
  });
  return command("retry", [
    "--manifest",
    manifest(),
    "--output-dir",
    output(),
    "--request",
    request,
    "--report",
    join(root, `retry-${current.revision}-result.json`),
  ]);
}
async function captionRevision() {
  const queue = MechanismProductionQueueSchema.parse(await load(manifest())),
    before = await state();
  const project = queue.items[0]!,
    familyPath = join(root, project.familyPath),
    cuePath = join(root, project.cuePath);
  const family = await readMechanismFamilyAuthoring(familyPath),
    cue = await readMechanismCueAuthoring(family.instance, cuePath);
  await patchMechanismCueAuthoring(family.instance, cuePath, {
    schemaVersion: "mechanism-cue-patch-1",
    baseRevision: cue.document.revision,
    baseHash: cue.projectHash,
    operations: [
      {
        cue: cue.document.cues[0]!.id,
        property: "caption",
        value:
          (cue.document.cues[0]!.text.startsWith("X") ? "Y" : "X") +
          cue.document.cues[0]!.text.slice(1),
      },
    ],
  });
  queue.revision++;
  queue.baseHash = before.manifestHash;
  delete queue.retryFailedIds;
  queue.items[0] = await inspectMechanismProductionNativeItem(
    { id: project.id, question: project.question, familyPath, cuePath },
    root,
  );
  await save(manifest(), queue);
}
console.log(JSON.stringify({ status: "running", root }));
try {
  const projects = [];
  for (const [i, family] of (
    ["tape-hook", "cable-tie", "clothespeg"] as const
  ).entries()) {
    const project = await createCueProjectFixture(
      join(root, "inputs", family),
      family,
    );
    projects.push({
      id: "S" + (i + 1),
      question: `Engineering recovery question for ${family}`,
      familyPath: relative(root, project.familyPath),
      cuePath: relative(root, project.cuePath),
    });
  }
  await save(join(root, "projects.json"), {
    schemaVersion: "mechanism-production-projects-1",
    id: "engineering-native-recovery",
    projects,
  });
  await command("queue", [
    "--projects",
    join(root, "projects.json"),
    "--manifest",
    manifest(),
  ]);
  const killed = startRun(join(root, "killed-state.json"));
  let observedImage: string | undefined;
  await waitUntil(async () => {
    try {
      for (const directory of await readdir(join(output(), "native-cache")))
        for (const file of await readdir(
          join(output(), "native-cache", directory),
        ))
          if (/^native-\d{6}\.png$/.test(file)) {
            observedImage = join(output(), "native-cache", directory, file);
            return true;
          }
    } catch (error) {
      if (
        !["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
    return false;
  }, killed.child);
  const beforeKill = await state();
  assert.equal(beforeKill.rows[0]!.status, "running");
  assert.equal(beforeKill.rows[0]!.product, null);
  const partial = await hash(observedImage!);
  assert(partial.bytes > 0);
  assert(
    (await readFile(observedImage!))
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  if (process.platform !== "win32" && killed.child.pid)
    process.kill(-killed.child.pid, "SIGKILL");
  else killed.child.kill("SIGKILL");
  const killedResult = await killed.ended;
  assert.equal(killedResult.signal, "SIGKILL");
  await record("actual-sigkill-native-output", {
    pid: killed.child.pid,
    partial,
    beforeKill,
    killedResult,
  });
  const cold = await run("resume-after-sigkill");
  assert(cold.rows.every((row) => row.status === "passed"));
  assert.deepEqual(
    cold.rows[0]!.attempts.map((a) => a.status),
    ["interrupted", "passed"],
  );
  await captionRevision();
  const cancel = startRun(join(root, "cancel-state.json"));
  await waitUntil(async () => {
    try {
      const s = await state();
      return (
        s.rows[0]!.status === "running" &&
        s.rows[0]!.attempts.at(-1)!.stage === "render-cached"
      );
    } catch {
      return false;
    }
  }, cancel.child);
  cancel.child.kill("SIGTERM");
  const cancelled = await cancel.ended;
  assert.equal(cancelled.code, 130);
  assert.equal(cancelled.signal, null);
  const cancelledState = await state();
  assert.equal(cancelledState.rows[0]!.status, "cancelled");
  await record("actual-sigterm-cached-export", { cancelled, cancelledState });
  const caption = await run("resume-after-sigterm");
  assert(caption.rows.every((row) => row.status === "passed"));
  for (const row of caption.rows.slice(1))
    assert.deepEqual(
      row,
      cold.rows.find((x) => x.id === row.id),
    );
  const tapeScene = join(root, "inputs/tape-hook/scene.json"),
    audio = join(root, "inputs/cable-tie/narration.wav"),
    original = await readFile(tapeScene);
  await writeFile(tapeScene, "corrupt-owned-scene");
  await rename(audio, audio + ".withheld");
  const failures = await run("corrupt-scene-missing-audio", 1);
  assert.deepEqual(
    failures.rows.map((row) => row.status),
    ["failed", "failed", "passed"],
  );
  assert.deepEqual(failures.rows[2], caption.rows[2]);
  await writeFile(tapeScene, original);
  await rename(audio + ".withheld", audio);
  await retry(["S1", "S2"]);
  const repaired = await run("targeted-input-recovery");
  assert(repaired.rows.every((row) => row.status === "passed"));
  assert.deepEqual(repaired.rows[2], caption.rows[2]);
  await captionRevision();
  const current = await state(),
    attempt = current.rows[0]!.attempts.length + 1,
    rendered = join(output(), "items", "S1", String(attempt), "rendered"),
    collision = join(rendered, "output.mp4");
  const exportWorker = startRun(
    join(root, "owned-export-publication-failure-state.json"),
  );
  let temporaryExport: { path: string; bytesAtObservation: number } | undefined;
  await waitUntil(async () => {
    try {
      for (const name of await readdir(rendered)) {
        if (!/^\.output\.mp4\.[0-9a-f-]+\.tmp\.mp4$/.test(name)) continue;
        const path = join(rendered, name),
          info = await stat(path);
        if (info.isFile() && info.size > 0) {
          temporaryExport = { path, bytesAtObservation: info.size };
          return true;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return false;
  }, exportWorker.child);
  await mkdir(collision);
  await record("owned-export-collision-injected", {
    pid: exportWorker.child.pid,
    attempt,
    collision,
    temporaryExport,
  });
  const failedExportResult = await exportWorker.ended;
  assert.equal(failedExportResult.code, 1);
  assert.equal(failedExportResult.signal, null);
  const failedExport = await state();
  assert.equal(failedExport.rows[0]!.status, "failed");
  assert(failedExport.rows[0]!.attempts.at(-1)!.diagnostic);
  assert.deepEqual(failedExport.rows.slice(1), repaired.rows.slice(1));
  await record("owned-export-publication-failure", {
    failedExportResult,
    failedExport,
    qualification:
      "Collision was injected after a nonempty owned temporary MP4 was observed; the renderer may remove its owned failed directory during cleanup.",
  });
  try {
    await rename(collision, collision + ".injected-rejected");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await retry(["S1"]);
  const exportRepaired = await run("targeted-export-recovery");
  assert(exportRepaired.rows.every((row) => row.status === "passed"));

  const relocated = await mkdtemp(
    "/private/tmp/still-shift-ms3-native-relocated-",
  );
  await cp(root, relocated, { recursive: true });
  await rename(root, root + ".retired");
  root = relocated;
  await command("report", [
    "--manifest",
    manifest(),
    "--output-dir",
    output(),
    "--report",
    join(root, "relocated-before.json"),
  ]);
  const before = await load<{
    episodes: {
      validation: { status: string };
      disposition: { reviewedReady: boolean };
    }[];
  }>(join(root, "relocated-before.json"));
  assert(
    before.episodes.every(
      (e) => e.validation.status === "stale" && !e.disposition.reviewedReady,
    ),
  );
  const recovered = await run("actual-relocation-recovery");
  assert(recovered.rows.every((row) => row.status === "passed"));
  await command("report", [
    "--manifest",
    manifest(),
    "--output-dir",
    output(),
    "--report",
    join(root, "final-current-report.json"),
  ]);
  const finalReport = await load<{
    episodes: {
      validation: { status: string };
      disposition: { reviewedReady: boolean };
    }[];
    cohort: {
      failures: {
        failedAttempts: number;
        cancelled: number;
        interrupted: number;
      };
      firstPassTechnical: {
        completed: number;
        passed: number;
        rate: number | null;
        unverified: number;
        targetSatisfied: boolean | null;
      };
      reviewedReady: number;
    };
  }>(join(root, "final-current-report.json"));
  assert(
    finalReport.episodes.every(
      (e) => e.validation.status === "verified" && !e.disposition.reviewedReady,
    ),
  );
  assert.equal(finalReport.cohort.failures.failedAttempts, 3);
  assert.equal(finalReport.cohort.failures.cancelled, 1);
  assert.equal(finalReport.cohort.failures.interrupted, 1);
  // Relocation recovery cannot preserve clean first-pass credit.
  assert.deepEqual(finalReport.cohort.firstPassTechnical, {
    completed: 3,
    passed: 0,
    rate: 0,
    unverified: 0,
    targetSatisfied: false,
  });
  assert.equal(finalReport.cohort.reviewedReady, 0);
  const products = await readdir(join(output(), "products"));
  assert.equal(products.length, 10);
  let native = 0;
  for (const name of products) {
    const p = await load<MechanismProductionQueueProduct>(
      join(output(), "products", name),
    );
    native += p.work.freshNativeSubmissions;
  }
  await save(join(root, "run.json"), {
    status: "passed",
    root,
    originalRoot,
    retiredRoot: originalRoot + ".retired",
    stages,
    products: products.length,
    freshNativeSubmissions: native,
    qualification:
      "Actual CLI/OS lifecycle and technical fault evidence with synthetic engineering PCM. Independent decode/image/history audit and all whole reviews/pilot acceptance remain separate.",
  });
  console.log(
    JSON.stringify({
      status: "passed",
      root,
      products: products.length,
      native,
    }),
  );
} catch (error) {
  await save(join(root, "failure.json"), {
    status: "failed",
    root,
    originalRoot,
    error: String(error),
    stack: error instanceof Error ? error.stack : null,
    stages,
  });
  throw error;
} finally {
  await stopOwnedChildren();
}
