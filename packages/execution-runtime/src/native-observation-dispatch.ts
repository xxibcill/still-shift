import type {
  NativeObservedOutputFrame,
  NativeObservedOutputFrameV2,
  NativeObservedOutputFrameV3,
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
import {
  NativeObservationSinkV3,
  NativeObservationExecutionV3Schema,
  admitNativeObservationManifestV3,
  verifyNativeObservationClosureV3,
  type NativeObservationExecutionBindingV3,
  type NativeObservationExpectedPassV3,
  type NativeObservationClosureV3,
} from "./native-observation-v3.ts";
export type NativeObservationRequestV3 = {
  execution: NativeObservationExecutionBindingV3;
  maximumPacketBytes: number;
  expectedPasses(frame: number): readonly NativeObservationExpectedPassV3[];
};
export function isNativeObservationRequestV3(
  binding: NativeObservationRequestVersions,
): binding is NativeObservationRequestV3 {
  return binding.execution.version === "native-observation-execution-3";
}
export function nativeObservationPacketVersion(
  binding: NativeObservationRequestVersions,
) {
  return isNativeObservationRequestV3(binding)
    ? ("native3d-observed-output-frame-3" as const)
    : isNativeObservationRequestV2(binding)
      ? ("native3d-observed-output-frame-2" as const)
      : undefined;
}
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
  | NativeObservationRequestV2
  | NativeObservationRequestV3;
export type NativeObservationClosureVersions =
  | NativeObservationClosure
  | NativeObservationClosureV2
  | NativeObservationClosureV3;
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
      version !== "native-observation-execution-2" &&
      version !== "native-observation-execution-3") ||
    isNativeObservationRequestV3(binding) !==
      (preparedVersion === "composition-prepared-native3d-3") ||
    isNativeObservationRequestV2(binding) !==
      (preparedVersion === "composition-prepared-native3d-2")
  )
    passageError(
      "comp-native3d-protocol",
      "Native execution and prepared source protocol differ",
      { path: "nativeObservations.execution" },
    );
  if (isNativeObservationRequestV3(binding)) {
    NativeObservationExecutionV3Schema.parse(binding.execution);
    admitNativeObservationManifestV3(binding.execution, outputPath);
  } else if (isNativeObservationRequestV2(binding)) {
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
  return isNativeObservationRequestV3(binding)
    ? new NativeObservationSinkV3({ ...common, ...binding, signal })
    : isNativeObservationRequestV2(binding)
      ? new NativeObservationSinkV2({ ...common, ...binding, signal })
      : new NativeObservationSink({ ...common, ...binding });
}
type VerifyCommon = Omit<
  Parameters<typeof verifyNativeObservationClosure>[0],
  "closure" | "execution" | "expectedPasses" | "onFrame"
> & {
  onFrame?: (
    packet:
      | NativeObservedOutputFrame
      | NativeObservedOutputFrameV2
      | NativeObservedOutputFrameV3,
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
  if (isNativeObservationRequestV3(binding)) {
    if (closure.version !== "native-observation-closure-3")
      passageError(
        "comp-native3d-protocol",
        "Native execution/closure protocol differs",
        { path: "nativeObservations" },
      );
    return await verifyNativeObservationClosureV3({
      ...common,
      closure,
      execution: binding.execution,
      expectedPasses: binding.expectedPasses,
    });
  }
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
