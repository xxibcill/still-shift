import type {
  NativeObservedOutputFrame,
  NativeObservedOutputFrameV2,
} from "@still-shift/scene-contract";
import type { NativeObservationPixel } from "./native-observation-sink.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import {
  NativeObservationSink,
  admitNativeObservationManifest,
  verifyNativeObservationClosure,
  type NativeObservationClosure,
  type NativeObservationExecutionBinding,
  type NativeObservationExpectedPass,
} from "./native-observation-sink.ts";
import {
  NativeObservationSinkV2,
  NativeObservationExecutionV2Schema,
  admitNativeObservationManifestV2,
  verifyNativeObservationClosureV2,
  type NativeObservationClosureV2,
  type NativeObservationExecutionBindingV2,
  type NativeObservationExpectedPassV2,
} from "./native-observation-v2.ts";
export type NativeObservationRequestOriginal = {
  execution: NativeObservationExecutionBinding;
  maximumPacketBytes: number;
  expectedPasses(frame: number): readonly NativeObservationExpectedPass[];
};
export type NativeObservationRequestV2 = {
  execution: NativeObservationExecutionBindingV2;
  maximumPacketBytes: number;
  expectedPasses(frame: number): readonly NativeObservationExpectedPassV2[];
};
export type NativeObservationRequestVersions =
  | NativeObservationRequestOriginal
  | NativeObservationRequestV2;
export type NativeObservationClosureVersions =
  | NativeObservationClosure
  | NativeObservationClosureV2;
export function isNativeObservationRequestV2(
  binding: NativeObservationRequestVersions,
): binding is NativeObservationRequestV2 {
  return binding.execution.version === "native-observation-execution-2";
}
export function admitNativeObservationRequestVersions(
  binding: NativeObservationRequestVersions,
  outputPath: string,
  preparedVersion: string | undefined,
) {
  const version = binding.execution.version;
  if (
    (version !== "native-observation-execution-1" &&
      version !== "native-observation-execution-2") ||
    isNativeObservationRequestV2(binding) !==
      (preparedVersion === "composition-prepared-native3d-2")
  )
    passageError(
      "comp-native3d-protocol",
      "Native execution and prepared source protocol differ",
      { path: "nativeObservations.execution" },
    );
  if (isNativeObservationRequestV2(binding)) {
    NativeObservationExecutionV2Schema.parse(binding.execution);
    admitNativeObservationManifestV2(binding.execution, outputPath);
  } else admitNativeObservationManifest(binding.execution, outputPath);
}
export function createNativeObservationSinkVersions(
  binding: NativeObservationRequestVersions,
  options: {
    outputPath: string;
    exportId: string;
    frameCount: number;
    signal?: AbortSignal | undefined;
    reserve(bytes: number): { release(): void };
  },
) {
  const { signal, ...common } = options;
  return isNativeObservationRequestV2(binding)
    ? new NativeObservationSinkV2({ ...common, ...binding, signal })
    : new NativeObservationSink({ ...common, ...binding });
}
type VerifyCommon = Omit<
  Parameters<typeof verifyNativeObservationClosure>[0],
  "closure" | "execution" | "expectedPasses" | "onFrame"
> & {
  onFrame?: (
    packet: NativeObservedOutputFrame | NativeObservedOutputFrameV2,
    pixel: NativeObservationPixel,
  ) => void | Promise<void>;
};
export async function verifyNativeObservationClosureVersions(
  options: VerifyCommon & {
    closure: NativeObservationClosureVersions;
    binding: NativeObservationRequestVersions;
  },
) {
  const { binding, closure, ...common } = options;
  if (isNativeObservationRequestV2(binding)) {
    if (closure.version !== "native-observation-closure-2")
      passageError(
        "comp-native3d-protocol",
        "Native execution/closure protocol differs",
        { path: "nativeObservations" },
      );
    return await verifyNativeObservationClosureV2({
      ...common,
      closure,
      execution: binding.execution,
      expectedPasses: binding.expectedPasses,
    });
  }
  if (closure.version !== "native-observation-closure-1")
    passageError(
      "comp-native3d-protocol",
      "Native execution/closure protocol differs",
      { path: "nativeObservations" },
    );
  return await verifyNativeObservationClosure({
    ...common,
    closure,
    execution: binding.execution,
    expectedPasses: binding.expectedPasses,
  });
}
