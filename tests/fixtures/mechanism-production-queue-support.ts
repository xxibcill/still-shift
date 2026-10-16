import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type {
  MechanismProductionQueue,
  MechanismProductionQueueProduct,
  MechanismProductionExecutor,
  MechanismProductionExecutionContext,
  MechanismProductionQueueItem,
} from "../../packages/animation-engine/src/mechanism/production-queue.ts";
import { createUnreviewedMechanismQA } from "../../packages/animation-engine/src/mechanism/production-report.ts";
export const hash = (value: string | Buffer) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
export const code = hash("fixture-code"),
  profile = hash("fixture-profile");
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "still-shift-production-queue-"));
  await writeFile(join(root, "family.json"), "{}");
  await writeFile(join(root, "cues.json"), "{}");
  const inputs = ["family.json", "cues.json"].map((path) => ({
    path,
    bytes: 2,
    sha256: hash("{}"),
  }));
  const manifest: MechanismProductionQueue = {
    schemaVersion: "mechanism-production-queue-1",
    id: "test",
    revision: 0,
    baseHash: null,
    codeSha256: code,
    profileSha256: profile,
    maximumAttempts: 3,
    items: ["E01", "E02"].map((id, i) => ({
      id,
      question: i
        ? "How do rivets retain the declared hook?"
        : "How does the floating hook establish zero?",
      family: "tape-hook",
      designVariant: "floating-hook",
      familyPath: "family.json",
      cuePath: "cues.json",
      clock: { outputFrames: 2, sourceSamples: 3200 },
      inputs,
    })),
  };
  const path = join(root, "queue.json"),
    output = join(root, "output");
  await writeFile(path, JSON.stringify(manifest));
  return { root, manifest, path, output };
}
export async function product(
  item: MechanismProductionQueueItem,
  ctx: MechanismProductionExecutionContext,
): Promise<MechanismProductionQueueProduct> {
  const bytes = Buffer.from(
    "queue-fixture-artifact-" +
      item.id +
      "-" +
      relative(ctx.outputRoot, ctx.attemptDirectory),
  );
  const path = join(ctx.attemptDirectory, "artifact.txt");
  await writeFile(path, bytes);
  const binding = {
    inputSha256: ctx.requestHash,
    outputSha256: hash(bytes),
    codeSha256: code,
    profileSha256: profile,
  };
  const qa = createUnreviewedMechanismQA(binding);
  qa[0] = {
    ...qa[0]!,
    status: "passed",
    method: "unit-fixture-byte-verification",
    evaluatedInterval: { unit: "output-frame", start: 0, endExclusive: 2 },
    evidence: [{ path: relative(ctx.outputRoot, path), sha256: hash(bytes) }],
    reviewer: { kind: "automated", id: "unit-fixture-only" },
    explanation: "Queue fixture; no video or production QA claim.",
  };
  return {
    schemaVersion: "mechanism-production-queue-product-1",
    requestHash: ctx.requestHash,
    report: {
      schemaVersion: "mechanism-production-episode-report-1",
      id: item.id,
      question: item.question,
      family: item.family,
      designVariant: item.designVariant,
      binding,
      clock: item.clock,
      attempts: [],
      qa,
      unresolvedMechanicalFailures: 0,
      durations: {
        setupSeconds: null,
        routineSeconds: null,
        renderSeconds: null,
      },
      authoring: {
        setupTokens: null,
        routineTokens: null,
        baselineRoutineTokens: null,
        comparable: false,
        measurementEvidence: null,
      },
    },
    artifacts: [
      {
        path: relative(ctx.outputRoot, path),
        bytes: bytes.length,
        sha256: hash(bytes),
      },
    ],
    work: { freshNativeSubmissions: 0, reusedNativePlates: false },
  };
}
export function executor(run = product): MechanismProductionExecutor {
  return {
    codeSha256: code,
    profileSha256: profile,
    execute: run,
    verify: async () => {},
  };
}
