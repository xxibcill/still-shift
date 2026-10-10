import {
  NativeObservedOutputFrameSchema,
  type NativeObservedOutputFrame,
} from "@still-shift/scene-contract";
import {
  NativeObservationSinkCore,
  admitNativeObservationManifestCore,
  validateNativeObservationPacket,
  verifyNativeObservationClosureCore,
  type NativeObservationExecutionBinding,
  type NativeObservationExpectedPass,
  type NativeObservationClosure,
  type NativeObservationProtocol,
  type NativeObservationSinkCoreOptions,
  type NativeObservationVerificationOptions,
} from "./native-observation-journal.ts";
export {
  nativeObservationOwner,
  validateNativeObservationPacket,
  admitNativeObservationCapacity,
  type NativeObservationExecutionBinding,
  type NativeObservationExpectedPass,
  type NativeObservationClosure,
  type NativeObservationArtifact,
  type NativeObservationPixel,
} from "./native-observation-journal.ts";

const originalProtocol: NativeObservationProtocol<
  NativeObservedOutputFrame,
  NativeObservationExpectedPass,
  NativeObservationClosure
> = {
  packetSchema: NativeObservedOutputFrameSchema,
  rowVersion: "native3d-observation-row-1",
  manifestVersion: "native-observation-manifest-1",
  closureVersion: "native-observation-closure-1",
  validatePacket: validateNativeObservationPacket,
  createClosure: (value) => ({
    version: "native-observation-closure-1",
    ...value,
  }),
};
export function admitNativeObservationManifest(
  execution: NativeObservationExecutionBinding,
  outputPath: string,
) {
  admitNativeObservationManifestCore(
    execution,
    outputPath,
    originalProtocol.manifestVersion,
  );
}
type OriginalOptions = Omit<
  NativeObservationSinkCoreOptions<
    NativeObservedOutputFrame,
    NativeObservationExpectedPass,
    NativeObservationClosure
  >,
  "protocol" | "execution"
> & { execution: NativeObservationExecutionBinding };
/** Original synchronous packet API and strict version1 serialization. */
export class NativeObservationSink extends NativeObservationSinkCore<
  NativeObservedOutputFrame,
  NativeObservationExpectedPass,
  NativeObservationClosure
> {
  constructor(options: OriginalOptions) {
    super({ ...options, protocol: originalProtocol });
  }
  acceptPacket(worker: number, bytes: Uint8Array): void {
    this.acceptPacketSync(worker, bytes);
  }
}
type OriginalVerification = Omit<
  NativeObservationVerificationOptions<
    NativeObservedOutputFrame,
    NativeObservationExpectedPass,
    NativeObservationClosure
  >,
  "execution"
> & { execution: NativeObservationExecutionBinding };
export function verifyNativeObservationClosure(options: OriginalVerification) {
  return verifyNativeObservationClosureCore(options, originalProtocol);
}
