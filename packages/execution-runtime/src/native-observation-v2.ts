import { createHash } from "node:crypto";
import { z } from "zod";
import {
  NativeObservedOutputFrameV2Schema,
  Native3DSourceKeySchema,
  NativeShapeAssociationSchema,
  NativeAppearanceCodeIdentitySchema,
  MechanismHashSchema,
  MechanismIdSchema,
  type NativeObservedOutputFrameV2,
  type NativeFrameSnapshotV2,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../renderer-core/src/mechanism/canonical.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { assertNativeObservedFrameV2 } from "../../renderer-core/src/native3d/observed-validation-v2.ts";
import type {
  PreparedNative3DVariant,
  DeepReadonly,
} from "../../renderer-core/src/native3d/types.ts";
import type { PreparedNative3DVariantV2 } from "../../renderer-core/src/native3d/types-v2.ts";
import {
  NativeObservationSinkCore,
  admitNativeObservationManifestCore,
  validateNativeObservationPacket,
  verifyNativeObservationClosureCore,
  type NativeObservationClosure,
  type NativeObservationExpectedPass,
  type NativeObservationProtocol,
  type NativeObservationSinkCoreOptions,
  type NativeObservationVerificationOptions,
} from "./native-observation-journal.ts";

const sourceIdentity = {
  asset: MechanismIdSchema,
  sourceKey: Native3DSourceKeySchema,
  sourceSha256: MechanismHashSchema,
  originalGeometrySha256: MechanismHashSchema,
  effectiveSceneSha256: MechanismHashSchema,
  geometrySha256: MechanismHashSchema,
  meshDataSha256: MechanismHashSchema,
};
const source = z.discriminatedUnion("sourceVersion", [
  z
    .object({ ...sourceIdentity, sourceVersion: z.literal("solid-scene-1") })
    .strict(),
  z
    .object({
      ...sourceIdentity,
      sourceVersion: z.literal("mechanism-scene-1"),
    })
    .strict(),
  z
    .object({
      ...sourceIdentity,
      sourceVersion: z.literal("mechanism-scene-2"),
      shapeAssociations: z.array(NativeShapeAssociationSchema).max(4),
    })
    .strict(),
]);
/** Serialized identities only; expected poses and prepared geometry stay on the trusted Node side. */
export const NativeObservationExecutionV2Schema = z
  .object({
    version: z.literal("native-observation-execution-2"),
    compositionSourceSha256: MechanismHashSchema,
    compositionSha256: MechanismHashSchema,
    preparedNativeSha256: MechanismHashSchema,
    appearanceCodeSha256: MechanismHashSchema,
    appearanceCodeIdentity: NativeAppearanceCodeIdentitySchema,
    backend: z.literal("webgl2"),
    profile: z.literal("native-three-aces-hdr-msaa4-1"),
    sources: z.array(source).min(1).max(64),
    mechanism: z
      .object({
        episodeSha256: MechanismHashSchema,
        geometrySha256: MechanismHashSchema,
        rigSha256: MechanismHashSchema,
        routeSelection: z
          .object({
            sourceRoute: z.enum(["bridge", "native3d"]).nullable(),
            effectiveRoute: z.enum(["bridge", "native3d"]),
            selectionOrigin: z.enum(["source", "cli-override", "default"]),
          })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((execution, context) => {
    if (
      !execution.sources.some(
        (source) => source.sourceVersion === "mechanism-scene-2",
      )
    )
      context.addIssue({
        code: "custom",
        message: "Execution2 requires a declared source2",
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
export type NativeObservationExecutionBindingV2 = z.infer<
  typeof NativeObservationExecutionV2Schema
>;
export type NativeObservationExpectedPassV2 =
  | {
      version: "native3d-frame-1";
      asset: string;
      legacy: NativeObservationExpectedPass;
      variant: PreparedNative3DVariant;
    }
  | {
      version: "native3d-frame-2";
      sampleFrame: number;
      appearanceCodeSha256: string;
      reference: DeepReadonly<NativeFrameSnapshotV2>;
      variant: PreparedNative3DVariantV2;
    };
export type NativeObservationClosureV2 = Omit<
  NativeObservationClosure,
  "version"
> & { version: "native-observation-closure-2" };

function fail(message: string, frame: number): never {
  return passageError("comp-native3d-protocol", message, {
    frame,
    path: `nativeObservations.frames[${frame}]`,
  });
}
function assertExecutionPass(
  assigned: NativeObservationExpectedPassV2,
  execution: Pick<
    NativeObservationExecutionBindingV2,
    "sources" | "appearanceCodeSha256"
  >,
  outputFrame: number,
) {
  const variant = assigned.variant;
  const asset =
    assigned.version === "native3d-frame-2"
      ? assigned.reference.asset
      : assigned.asset;
  const declared = execution.sources.find(
    (entry) => entry.asset === asset && entry.sourceKey === variant.sourceKey,
  );
  const reference =
    assigned.version === "native3d-frame-2"
      ? assigned.reference
      : assigned.legacy;
  const appearance =
    assigned.version === "native3d-frame-2"
      ? assigned.appearanceCodeSha256
      : assigned.legacy.appearanceCodeSha256;
  if (
    !declared ||
    declared.sourceVersion !== variant.source.schemaVersion ||
    appearance !== execution.appearanceCodeSha256 ||
    (assigned.version === "native3d-frame-2" &&
      assigned.reference.sourceKey !== variant.sourceKey) ||
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
      outputFrame,
    );
  if (assigned.version === "native3d-frame-2") {
    if (
      declared.sourceVersion !== "mechanism-scene-2" ||
      variant.version !== "prepared-native3d-variant-2"
    )
      fail("Expected source/frame protocol differs", outputFrame);
    const order = (a: { shape: string }, b: { shape: string }) =>
      a.shape < b.shape ? -1 : a.shape > b.shape ? 1 : 0;
    if (
      canonicalMechanismJson([...declared.shapeAssociations].sort(order)) !==
      canonicalMechanismJson(
        Object.values(variant.shapeAssociations).sort(order),
      )
    )
      fail(
        "Expected teaching-shape associations differ from the execution",
        outputFrame,
      );
  } else if (
    declared.sourceVersion === "mechanism-scene-2" ||
    variant.version !== "prepared-native3d-variant-1"
  )
    fail("Expected source/frame protocol differs", outputFrame);
}
/** Independently replay numeric poses/packed streams before a packet can authorize pixels. */
export async function validateNativeObservationPacketV2(
  packet: NativeObservedOutputFrameV2,
  executionSha256: string,
  expected: readonly NativeObservationExpectedPassV2[],
  reserve: (bytes: number) => { release(): void },
  execution: Pick<
    NativeObservationExecutionBindingV2,
    "sources" | "appearanceCodeSha256"
  >,
  signal?: AbortSignal | undefined,
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
  for (const [index, sample] of packet.passes.entries()) {
    signal?.throwIfAborted();
    const assigned = expected[index]!;
    assertExecutionPass(assigned, execution, packet.outputFrame);
    if (sample.sampleIndex !== index)
      fail("Observation sample invocation order differs", packet.outputFrame);
    if (assigned.version === "native3d-frame-1") {
      if (sample.observed.version !== "native3d-observed-frame-1")
        fail("Observation source/frame protocol differs", packet.outputFrame);
      // Original frame1 comparison only. No source2 is adapted to a frame1 observation.
      validateNativeObservationPacket(
        {
          version: "native3d-observed-output-frame-1",
          outputFrame: packet.outputFrame,
          executionSha256,
          passes: [{ ...sample, sampleIndex: 0, observed: sample.observed }],
        },
        executionSha256,
        [assigned.legacy],
      );
      continue;
    }
    if (
      sample.observed.version !== "native3d-observed-frame-2" ||
      sample.sampleFrame !== assigned.sampleFrame
    )
      fail(
        "Observation source/frame protocol or sample clock differs",
        packet.outputFrame,
      );
    const source = assigned.variant.source;
    // Expected references are borrowed from the producer. This lease owns checker scratch.
    const lease = reserve(
      524288 +
        assigned.reference.frameKey.length * 4 +
        source.parts.length * 2048 +
        source.geometry.meshes.reduce(
          (bytes, mesh) =>
            bytes + mesh.positions.length * 64 + mesh.indices.length * 256,
          0,
        ),
    );
    try {
      await assertNativeObservedFrameV2(
        assigned.variant,
        assigned.reference,
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
function protocolV2(
  execution: NativeObservationExecutionBindingV2,
  signal?: AbortSignal | undefined,
): NativeObservationProtocol<
  NativeObservedOutputFrameV2,
  NativeObservationExpectedPassV2,
  NativeObservationClosureV2
> {
  return {
    packetSchema: NativeObservedOutputFrameV2Schema,
    assertActive: () => signal?.throwIfAborted(),
    packetAllocationBytes: (encodedBytes) => encodedBytes * 8 + 524288,
    rowVersion: "native3d-observation-row-2",
    manifestVersion: "native-observation-manifest-2",
    closureVersion: "native-observation-closure-2",
    validatePacket: (packet, executionSha256, expected, reserve) =>
      validateNativeObservationPacketV2(
        packet,
        executionSha256,
        expected,
        reserve,
        execution,
        signal,
      ),
    createClosure: (value) => ({
      version: "native-observation-closure-2",
      ...value,
    }),
  };
}
type Options = Omit<
  NativeObservationSinkCoreOptions<
    NativeObservedOutputFrameV2,
    NativeObservationExpectedPassV2,
    NativeObservationClosureV2
  >,
  "protocol" | "execution"
> & {
  execution: NativeObservationExecutionBindingV2;
  signal?: AbortSignal | undefined;
};
/** Shared durable journal, strict protocol2 parser and awaited independent admission. */
export class NativeObservationSinkV2 extends NativeObservationSinkCore<
  NativeObservedOutputFrameV2,
  NativeObservationExpectedPassV2,
  NativeObservationClosureV2
> {
  constructor(options: Options) {
    const execution = NativeObservationExecutionV2Schema.parse(
      options.execution,
    );
    super({
      ...options,
      execution,
      protocol: protocolV2(execution, options.signal),
    });
  }
  async acceptPacket(worker: number, bytes: Uint8Array): Promise<void> {
    await this.acceptPacketAsync(worker, bytes);
  }
}
type Verification = Omit<
  NativeObservationVerificationOptions<
    NativeObservedOutputFrameV2,
    NativeObservationExpectedPassV2,
    NativeObservationClosureV2
  >,
  "execution"
> & { execution: NativeObservationExecutionBindingV2 };
export function verifyNativeObservationClosureV2(options: Verification) {
  const execution = NativeObservationExecutionV2Schema.parse(options.execution);
  return verifyNativeObservationClosureCore(
    { ...options, execution },
    protocolV2(execution, options.signal),
  );
}

export function admitNativeObservationManifestV2(
  execution: NativeObservationExecutionBindingV2,
  outputPath: string,
) {
  admitNativeObservationManifestCore(
    NativeObservationExecutionV2Schema.parse(execution),
    outputPath,
    "native-observation-manifest-2",
  );
}
