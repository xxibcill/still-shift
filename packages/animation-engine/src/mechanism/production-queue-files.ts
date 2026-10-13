import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { z } from "zod";
import { AnimationEngineError } from "@still-shift/scene-contract";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { publishArtifacts } from "@still-shift/execution-runtime/publication";
import {
  compositionNodeJsonSize,
  serializeCompositionNodeJson,
} from "@still-shift/execution-runtime/export";
import { readBoundedSourceBytes } from "../bounded-source-read.ts";
import {
  NativeSourceAdmission,
  nativeJsonTreeCapacity,
} from "../native-source-admission.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import type { MechanismProductionQueueProductAny as MechanismProductionQueueProduct } from "./production-queue-contract.ts";

export function productionFailure(
  code: string,
  message: string,
  path: string,
): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-production-queue",
    diagnosticCode: code,
    path,
    nextAction:
      "Inspect the retained queue journal and dependency pins; repair the located input or resume the unchanged queue.",
  });
}
export async function readProductionJSON<T>(
  path: string,
  schema: z.ZodType<T>,
  owner: CompositionNodeMemory,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<{ value: T; sha256: string; release(): void }> {
  const child = new CompositionNodeMemory(owner),
    admission = new NativeSourceAdmission(child);
  const stage = admission.begin(path);
  let bytes: Buffer | undefined;
  let returned = false;
  const release = () => {
    stage.dispose();
    admission.dispose();
    child.dispose();
  };
  try {
    bytes = await readBoundedSourceBytes(path, {
      maximumBytes,
      signal,
      admit: (size) => stage.admitBody(size),
      reject: (reason) =>
        productionFailure(
          "production-json-admission",
          "Queue JSON admission failed: " + reason,
          path,
        ),
    });
    const sha256 = "sha256:" + createHash("sha256").update(bytes).digest("hex");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    stage.admitTree(text);
    const value = schema.parse(JSON.parse(text) as unknown);
    stage.complete();
    returned = true;
    return { value, sha256, release };
  } finally {
    if (bytes?.buffer.byteLength)
      (
        bytes.buffer as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
      ).transfer(0);
    stage.dispose();
    if (!returned) release();
  }
}
export async function writeProductionJSON(
  path: string,
  value: unknown,
  owner: CompositionNodeMemory,
  maximumBytes: number,
  immutable = false,
): Promise<void> {
  const size = compositionNodeJsonSize(value, 2, "\n", owner.availableBytes);
  if (size.encodedBytes > maximumBytes)
    productionFailure(
      "production-json-size",
      "Queue JSON exceeds its published byte limit",
      path,
    );
  const body = serializeCompositionNodeJson(owner, value, 2, "\n");
  const staged = join(dirname(path), "." + randomUUID() + ".json.tmp");
  try {
    // Four retained capacities are admitted by the controller before journal mutation.
    nativeJsonTreeCapacity(body.text, 16 * 1024 * 1024, path);
    await mkdir(dirname(path), { recursive: true });
    const file = await open(staged, "wx");
    try {
      await file.writeFile(body.text);
      await file.sync();
    } finally {
      await file.close();
    }
    if (immutable) await publishArtifacts([{ staged, destination: path }]);
    else await rename(staged, path); // Single locked checkpoint replacement is crash atomic.
  } finally {
    body.lease.release();
    await rm(staged, { force: true });
  }
}
export async function productionOwnedPath(
  root: string,
  path: string,
): Promise<string> {
  const resolved = await realpath(resolve(root, path));
  const local = relative(root, resolved);
  if (isAbsolute(local) || local === ".." || local.startsWith("../"))
    productionFailure(
      "production-artifact-ownership",
      "Produced artifact escapes the queue output directory",
      path,
    );
  return resolved;
}
export async function verifyProductionArtifacts(
  root: string,
  product: MechanismProductionQueueProduct,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
): Promise<void> {
  if (
    new Set(product.artifacts.map((f) => f.path)).size !==
    product.artifacts.length
  )
    productionFailure(
      "production-artifact-duplicate",
      "Product contains duplicate artifact locators",
      product.requestHash,
    );
  for (const artifact of product.artifacts) {
    const path = await productionOwnedPath(root, artifact.path);
    const actual = await cuePlateFile(path, owner, {
      signal,
      sha256: artifact.sha256,
    });
    if (actual.bytes !== artifact.bytes)
      productionFailure(
        "production-artifact-size",
        "Produced artifact byte count changed",
        artifact.path,
      );
  }
  for (const evidence of [
    ...product.report.qa.flatMap((review) => review.evidence),
    ...(product.report.authoring.measurementEvidence
      ? [product.report.authoring.measurementEvidence]
      : []),
  ])
    if (
      !product.artifacts.some(
        (artifact) =>
          artifact.path === evidence.path &&
          artifact.sha256 === evidence.sha256,
      )
    )
      productionFailure(
        "production-review-evidence",
        "Review/token evidence must name a verified owned product artifact",
        evidence.path,
      );
  if (
    !product.artifacts.some(
      (f) => f.sha256 === product.report.binding.outputSha256,
    )
  )
    productionFailure(
      "production-output-binding",
      "The report output must name a verified produced artifact",
      product.requestHash,
    );
}
export async function productionFile(
  root: string,
  path: string,
  owner: CompositionNodeMemory,
): Promise<{ path: string; bytes: number; sha256: string }> {
  const actual = await cuePlateFile(
    await productionOwnedPath(root, path),
    owner,
  );
  return { ...actual, path: relative(root, actual.path).split("\\").join("/") };
}
