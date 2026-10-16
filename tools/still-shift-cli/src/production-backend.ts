import { resolve } from "node:path";
import { z } from "zod";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  createMechanismProductionNativeExecutor,
  createBlenderProductionExecutor,
  MechanismProductionQueueVersionsSchema,
  MECHANISM_PRODUCTION_QUEUE_LIMITS,
} from "@still-shift/animation-engine";
import { readProductionJSON } from "../../../packages/animation-engine/src/mechanism/production-queue-files.ts";
import { requireArgument } from "./named-options.ts";

export const ProductionBackendSchema = z.enum([
  "three-native",
  "blender-native",
]);
export function validateProductionBackendFlags(
  flags: Map<string, string>,
): void {
  const selected = flags.get("backend");
  if (selected !== undefined) ProductionBackendSchema.parse(selected);
  const executable = flags.get("blender-executable");
  if (
    executable !== undefined &&
    (!executable || executable.length > 2048 || executable.includes("\0"))
  )
    throw Error("Blender executable must be a bounded host path");
  if (selected === "three-native" && executable !== undefined)
    throw Error("Blender executable requires the blender-native backend");
  if (selected === "blender-native" && executable === undefined)
    throw Error("Blender backend requires --blender-executable");
}
/** Manifest versions choose execution; an explicit backend can assert that identity, never reclassify it. */
export async function createProductionCliExecutor(
  flags: Map<string, string>,
  owner: CompositionNodeMemory,
  inspectManifest: boolean,
  signal?: AbortSignal,
) {
  validateProductionBackendFlags(flags);
  let detected: "three-native" | "blender-native" | undefined;
  if (inspectManifest) {
    const loaded = await readProductionJSON(
      resolve(requireArgument(flags, "manifest")),
      MechanismProductionQueueVersionsSchema,
      owner,
      MECHANISM_PRODUCTION_QUEUE_LIMITS.manifestBytes,
      signal,
    );
    try {
      detected =
        loaded.value.schemaVersion === "mechanism-production-queue-2"
          ? "blender-native"
          : "three-native";
    } finally {
      loaded.release();
    }
  }
  const requested = flags.get("backend");
  if (
    requested !== undefined &&
    detected !== undefined &&
    requested !== detected
  )
    throw Error("Requested backend differs from the pinned manifest version");
  const selected = requested ?? detected ?? "three-native";
  signal?.throwIfAborted();
  if (selected === "blender-native")
    return createBlenderProductionExecutor({
      blenderExecutable: resolve(requireArgument(flags, "blender-executable")),
    });
  if (flags.has("blender-executable"))
    throw Error("Blender executable requires the blender-native backend");
  return createMechanismProductionNativeExecutor();
}
