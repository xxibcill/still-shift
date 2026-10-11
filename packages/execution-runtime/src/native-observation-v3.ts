import { createHash } from "node:crypto";
import { z } from "zod";
import {
  NativeObservedOutputFrameV3Schema,
  Native3DSourceKeyV3Schema,
  MechanismHashSchema,
  MechanismIdSchema,
  type NativeObservedOutputFrameV3,
  type NativeFrameSnapshotV3,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../renderer-core/src/mechanism/canonical.ts";
import { assertNativeObservedFrameV3 } from "../../renderer-core/src/native3d/observed-validation-v3.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import type { PreparedNative3DVariantV3 } from "../../renderer-core/src/native3d/types-v3.ts";
import type { DeepReadonly } from "../../renderer-core/src/native3d/types.ts";
import {
  NativeObservationExecutionV2Schema,
  validateNativeObservationPacketV2,
  type NativeObservationExpectedPassV2,
} from "./native-observation-v2.ts";
import {
  NativeObservationSinkCore,
  admitNativeObservationManifestCore,
  verifyNativeObservationClosureCore,
  type NativeObservationClosure,
  type NativeObservationProtocol,
  type NativeObservationSinkCoreOptions,
  type NativeObservationVerificationOptions,
} from "./native-observation-journal.ts";

const previous = NativeObservationExecutionV2Schema;
const pbrSource = z
  .object({
    asset: MechanismIdSchema,
    sourceVersion: z.literal("mechanism-scene-3"),
    sourceKey: Native3DSourceKeyV3Schema,
    sourceSha256: MechanismHashSchema,
    originalGeometrySha256: MechanismHashSchema,
    effectiveSceneSha256: MechanismHashSchema,
    geometrySha256: MechanismHashSchema,
    meshDataSha256: MechanismHashSchema,
  })
  .strict();
/** Explicit execution3; geometry identity binds materials and decoded pixel manifests. */
export const NativeObservationExecutionV3Schema = z
  .object({
    ...previous.shape,
    version: z.literal("native-observation-execution-3"),
    sources: z
      .array(z.union([previous.shape.sources.element, pbrSource]))
      .min(1)
      .max(64),
  })
  .strict()
  .superRefine((execution, context) => {
    if (
      !execution.sources.some(
        (source) => source.sourceVersion === "mechanism-scene-3",
      )
    )
      context.addIssue({
        code: "custom",
        message: "Execution3 requires a declared source3",
      });
    const keys = new Set<string>();
    for (const [index, source] of execution.sources.entries()) {
      const key = `${source.asset}\0${source.sourceKey}`;
      if (keys.has(key))
        context.addIssue({
          code: "custom",
          message: "Duplicate native source variant",
          path: ["sources", index],
        });
      keys.add(key);
      if (source.sourceVersion === "mechanism-scene-2") {
        const ids = new Set<string>(),
          meshes = new Set<string>();
        for (const [at, association] of source.shapeAssociations.entries()) {
          if (ids.has(association.shape) || meshes.has(association.mesh))
            context.addIssue({
              code: "custom",
              message: "Duplicate shape/mesh association",
              path: ["sources", index, "shapeAssociations", at],
            });
          ids.add(association.shape);
          meshes.add(association.mesh);
        }
      }
    }
    const appearance = `sha256:${createHash("sha256").update(canonicalMechanismJson(execution.appearanceCodeIdentity)).digest("hex")}`;
    if (execution.appearanceCodeSha256 !== appearance)
      context.addIssue({
        code: "custom",
        message: "Appearance identity hash differs",
        path: ["appearanceCodeSha256"],
      });
  });
export type NativeObservationExecutionBindingV3 = z.infer<
  typeof NativeObservationExecutionV3Schema
>;
export type NativeObservationExpectedPassV3 =
  | NativeObservationExpectedPassV2
  | {
      version: "native3d-frame-3";
      sampleFrame: number;
      appearanceCodeSha256: string;
      reference: DeepReadonly<NativeFrameSnapshotV3>;
      variant: PreparedNative3DVariantV3;
    };
export type NativeObservationClosureV3 = Omit<
  NativeObservationClosure,
  "version"
> & { version: "native-observation-closure-3" };
function fail(message: string, frame: number): never {
  return passageError("comp-native3d-protocol", message, {
    frame,
    path: `nativeObservations.frames[${frame}]`,
  });
}
async function validatePacket(
  packet: NativeObservedOutputFrameV3,
  executionSha256: string,
  expected: readonly NativeObservationExpectedPassV3[],
  reserve: (bytes: number) => { release(): void },
  execution: NativeObservationExecutionBindingV3,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (
    packet.executionSha256 !== executionSha256 ||
    packet.passes.length !== expected.length
  )
    fail(
      "Observation execution or contributing-pass coverage differs",
      packet.outputFrame,
    );
  // Original frame1/frame2 checks keep their declared source versions and identities.
  const legacyExecution = {
    appearanceCodeSha256: execution.appearanceCodeSha256,
    sources: execution.sources.filter(
      (source) => source.sourceVersion !== "mechanism-scene-3",
    ),
  };
  for (const [index, sample] of packet.passes.entries()) {
    signal?.throwIfAborted();
    const assigned = expected[index]!;
    if (sample.sampleIndex !== index)
      fail("Observation sample invocation order differs", packet.outputFrame);
    if (assigned.version !== "native3d-frame-3") {
      if (sample.observed.version === "native3d-observed-frame-3")
        fail("Observation source/frame protocol differs", packet.outputFrame);
      await validateNativeObservationPacketV2(
        {
          version: "native3d-observed-output-frame-2",
          outputFrame: packet.outputFrame,
          executionSha256,
          passes: [{ ...sample, sampleIndex: 0, observed: sample.observed }],
        },
        executionSha256,
        [assigned],
        reserve,
        legacyExecution,
        signal,
      );
      continue;
    }
    const variant = assigned.variant,
      reference = assigned.reference;
    const declared = execution.sources.find(
      (source) =>
        source.asset === reference.asset &&
        source.sourceKey === variant.sourceKey,
    );
    if (
      !declared ||
      declared.sourceVersion !== "mechanism-scene-3" ||
      variant.version !== "prepared-native3d-variant-3" ||
      assigned.appearanceCodeSha256 !== execution.appearanceCodeSha256 ||
      reference.sourceKey !== variant.sourceKey ||
      declared.sourceSha256 !== variant.sourceSha256 ||
      declared.originalGeometrySha256 !== variant.originalGeometrySha256 ||
      declared.effectiveSceneSha256 !== variant.effectiveSceneSha256 ||
      declared.geometrySha256 !== variant.geometrySha256 ||
      declared.meshDataSha256 !== variant.meshDataSha256 ||
      reference.sourceSha256 !== variant.sourceSha256 ||
      reference.effectiveSceneSha256 !== variant.effectiveSceneSha256 ||
      reference.geometrySha256 !== variant.geometrySha256
    )
      fail(
        "Expected pass differs from its declared execution source or appearance",
        packet.outputFrame,
      );
    if (
      sample.observed.version !== "native3d-observed-frame-3" ||
      sample.sampleFrame !== assigned.sampleFrame
    )
      fail(
        "Observation source/frame protocol or sample clock differs",
        packet.outputFrame,
      );
    const lease = reserve(
      Buffer.byteLength(JSON.stringify(sample.observed)) * 8 +
        262144 +
        reference.frameKey.length * 4 +
        variant.source.geometry.meshes.reduce(
          (sum, mesh) =>
            sum + (mesh.positions.length / 3) * 256 + mesh.indices.length * 256,
          0,
        ),
    );
    try {
      await assertNativeObservedFrameV3(
        variant,
        reference,
        sample.observed,
        assigned.appearanceCodeSha256,
        signal,
      );
    } finally {
      lease.release();
    }
  }
  signal?.throwIfAborted();
}
function protocol(
  execution: NativeObservationExecutionBindingV3,
  signal?: AbortSignal,
): NativeObservationProtocol<
  NativeObservedOutputFrameV3,
  NativeObservationExpectedPassV3,
  NativeObservationClosureV3
> {
  return {
    packetSchema: NativeObservedOutputFrameV3Schema,
    assertActive: () => signal?.throwIfAborted(),
    packetAllocationBytes: (bytes) => bytes * 8 + 524288,
    rowVersion: "native3d-observation-row-3",
    manifestVersion: "native-observation-manifest-3",
    closureVersion: "native-observation-closure-3",
    validatePacket: (packet, sha, expected, reserve) =>
      validatePacket(packet, sha, expected, reserve, execution, signal),
    createClosure: (value) => ({
      version: "native-observation-closure-3",
      ...value,
    }),
  };
}
type Options = Omit<
  NativeObservationSinkCoreOptions<
    NativeObservedOutputFrameV3,
    NativeObservationExpectedPassV3,
    NativeObservationClosureV3
  >,
  "protocol" | "execution"
> & {
  execution: NativeObservationExecutionBindingV3;
  signal?: AbortSignal | undefined;
};
/** Awaited independent source3 admission over the existing durable journal core. */
export class NativeObservationSinkV3 extends NativeObservationSinkCore<
  NativeObservedOutputFrameV3,
  NativeObservationExpectedPassV3,
  NativeObservationClosureV3
> {
  constructor(options: Options) {
    const execution = NativeObservationExecutionV3Schema.parse(
      options.execution,
    );
    super({
      ...options,
      execution,
      protocol: protocol(execution, options.signal),
    });
  }
  async acceptPacket(worker: number, bytes: Uint8Array): Promise<void> {
    await this.acceptPacketAsync(worker, bytes);
  }
}
type Verification = Omit<
  NativeObservationVerificationOptions<
    NativeObservedOutputFrameV3,
    NativeObservationExpectedPassV3,
    NativeObservationClosureV3
  >,
  "execution"
> & { execution: NativeObservationExecutionBindingV3 };
export function verifyNativeObservationClosureV3(options: Verification) {
  const execution = NativeObservationExecutionV3Schema.parse(options.execution);
  return verifyNativeObservationClosureCore(
    { ...options, execution },
    protocol(execution, options.signal),
  );
}
export function admitNativeObservationManifestV3(
  execution: NativeObservationExecutionBindingV3,
  outputPath: string,
) {
  admitNativeObservationManifestCore(
    NativeObservationExecutionV3Schema.parse(execution),
    outputPath,
    "native-observation-manifest-3",
  );
}
