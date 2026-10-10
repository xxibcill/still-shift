import {
  NATIVE3D_OBSERVATION_LIMITS,
  NativeObservedOutputFrameSchema,
  type NativeObservedSample,
} from "@still-shift/scene-contract";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  serializeRenderMetadata,
  type ManagedMetadataText,
} from "../../renderer-core/src/managed-metadata.ts";

/** Keep all packet representations owned until the server acknowledges them. */
export async function uploadNativeObservationPacket(
  input: {
    outputFrame: number;
    executionSha256: string;
    passes: readonly NativeObservedSample[];
    maximumPacketBytes: number;
  },
  send: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
): Promise<void> {
  if (
    !Number.isSafeInteger(input.maximumPacketBytes) ||
    input.maximumPacketBytes < 1 ||
    input.maximumPacketBytes > NATIVE3D_OBSERVATION_LIMITS.packetBytes
  )
    throw Error("Invalid native observation packet capacity");
  const packet = allocateRenderMetadata(
    input.maximumPacketBytes * 4 + 262144,
    () =>
      NativeObservedOutputFrameSchema.parse({
        version: "native3d-observed-output-frame-1",
        outputFrame: input.outputFrame,
        executionSha256: input.executionSha256,
        passes: input.passes,
      }),
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
