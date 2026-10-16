import { createHash } from "node:crypto";
import {
  AnimationEngineError,
  validateComposition,
} from "@still-shift/scene-contract";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import type { MemoryLease } from "../../renderer-core/src/managed-memory.ts";
import { nativeJsonTreeCapacity } from "./native-source-admission.ts";
import { readBoundedSourceBytes } from "./bounded-source-read.ts";

/** Root body/text/parser storage contends with retained native and result owners.
 * Validation diagnostics and other producer storage remain distinct work.
 */
export async function readCompositionDocument(
  path: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  let bytes: Buffer | undefined,
    body: MemoryLease | undefined,
    tree: MemoryLease | undefined,
    complete = false;
  const limit = () =>
    new AnimationEngineError(
      "SCENE_INVALID",
      "Composition source exceeds its available Node capacity",
    );
  let scanner: MemoryLease;
  try {
    scanner = owner.reserve(65536);
  } catch {
    throw limit();
  }
  try {
    try {
      bytes = await readBoundedSourceBytes(path, {
        maximumBytes: Math.max(
          0,
          Math.floor((owner.availableBytes - 128) / 3) - 1,
        ),
        signal,
        admit: (capacity) => {
          try {
            body = owner.reserve(capacity * 3 + 128);
          } catch {
            throw limit();
          }
        },
        reject: (reason) => {
          throw reason === "size"
            ? limit()
            : new AnimationEngineError(
                "INPUT_UNREADABLE",
                reason === "type"
                  ? "Composition source must be a regular file"
                  : "Composition source changed during bounded read",
              );
        },
      });
    } catch (error) {
      if (
        error instanceof AnimationEngineError ||
        (signal?.aborted && error === signal.reason)
      )
        throw error;
      throw new AnimationEngineError(
        "INPUT_UNREADABLE",
        `Cannot read composition ${path}`,
      );
    }
    const checksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      text = bytes.toString("utf8");
    try {
      tree = owner.reserve(
        nativeJsonTreeCapacity(
          text,
          Math.floor(owner.availableBytes / 8),
          "composition",
        ) * 8,
      );
    } catch {
      throw limit();
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new AnimationEngineError(
        "SCENE_INVALID",
        "Composition must be valid JSON",
      );
    }
    signal?.throwIfAborted();
    const result = validateComposition(value);
    if (!result.ok)
      throw new AnimationEngineError(
        "SCENE_INVALID",
        result.diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`)[0] ??
          "Invalid composition",
        { diagnosticsJson: JSON.stringify(result.diagnostics) },
      );
    tree.resize(tree.bytes / 2);
    complete = true;
    return { result, checksum };
  } finally {
    if (bytes?.buffer.byteLength)
      (
        bytes.buffer as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
      ).transfer(0);
    body?.release();
    scanner.release();
    if (!complete) tree?.release();
  }
}
