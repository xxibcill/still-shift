import {
  NATIVE3D_OBSERVATION_LIMITS,
  NativeObservedOutputFrameSchema,
  NativeObservedOutputFrameV2Schema,
  NativeObservedOutputFrameV3Schema,
  type NativeObservedSampleV3,
  type NativeObservedSample,
} from "@still-shift/scene-contract";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  serializeRenderMetadata,
  type ManagedMetadataText,
} from "../../renderer-core/src/managed-metadata.ts";

type UploadInput = {
  outputFrame: number;
  executionSha256: string;
  passes: readonly NativeObservedSampleV3[];
  maximumPacketBytes: number;
};
type PacketVersion =
  | "native3d-observed-output-frame-1"
  | "native3d-observed-output-frame-2"
  | "native3d-observed-output-frame-3";
/** Original typed facade and strict serializer stay unchanged. */
export async function uploadNativeObservationPacket(
  input: Omit<UploadInput, "passes"> & {
    passes: readonly NativeObservedSample[];
  },
  send: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
): Promise<void> {
  return await uploadNativeObservationPacketVersions(
    input,
    "native3d-observed-output-frame-1",
    send,
  );
}
/** Keep every representation owned until the selected protocol's server acknowledgement. */
export async function uploadNativeObservationPacketVersions(
  input: UploadInput,
  version: PacketVersion,
  send: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
): Promise<void> {
  if (
    version !== "native3d-observed-output-frame-1" &&
    version !== "native3d-observed-output-frame-2" &&
    version !== "native3d-observed-output-frame-3"
  )
    throw Error("Unsupported native observation upload protocol");
  if (
    !Number.isSafeInteger(input.maximumPacketBytes) ||
    input.maximumPacketBytes < 1 ||
    input.maximumPacketBytes > NATIVE3D_OBSERVATION_LIMITS.packetBytes
  )
    throw Error("Invalid native observation packet capacity");
  const modern = version !== "native3d-observed-output-frame-1";
  const packet = allocateRenderMetadata(
    input.maximumPacketBytes * (modern ? 8 : 4) + (modern ? 524288 : 262144),
    () => {
      const value = {
        version,
        outputFrame: input.outputFrame,
        executionSha256: input.executionSha256,
        passes: input.passes,
      };
      return version === "native3d-observed-output-frame-3"
        ? NativeObservedOutputFrameV3Schema.parse(value)
        : modern
          ? NativeObservedOutputFrameV2Schema.parse(value)
          : NativeObservedOutputFrameSchema.parse(value);
    },
  );
  let text: ManagedMetadataText | undefined;
  let encoded: { bytes: Uint8Array<ArrayBuffer> } | undefined;
  try {
    text = serializeRenderMetadata(packet);
    const value = text.value!;
    encoded = allocateRenderMetadata(value.length * 3 + 256, () => ({
      bytes: new TextEncoder().encode(value),
    }));
    if (encoded.bytes.byteLength > input.maximumPacketBytes)
      throw Error("Native observation exceeds its admitted packet capacity");
    await send(encoded.bytes);
  } finally {
    if (encoded) releaseRenderMetadata(encoded);
    text?.release();
    releaseRenderMetadata(packet);
  }
}
