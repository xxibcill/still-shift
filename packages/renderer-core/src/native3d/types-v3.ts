import type { preflightNativePbrResources } from "./pbr-allocations.ts";
import type { MechanismSceneV3 } from "@still-shift/scene-contract";
import type { PreparedMechanismPoseV2 } from "../mechanism/types-v2.ts";
import type { DeepReadonly } from "./types.ts";
export interface Native3DPreparedFieldsV3 {
  readonly source: DeepReadonly<MechanismSceneV3>;
  readonly sourceSha256: string;
  readonly geometrySha256: string;
  readonly effectiveSceneSha256: string;
  readonly sourceKey: string;
  readonly allocation: ReturnType<
    typeof preflightNativePbrResources
  >["receipt"];
  readonly evaluation: PreparedMechanismPoseV2;
}

export interface PreparedNative3DVariantV3 extends Native3DPreparedFieldsV3 {
  readonly version: "prepared-native3d-variant-3";
  readonly originalGeometrySha256: string;
  readonly meshDataSha256: string;
}
export interface PreparedNative3DSceneV3 extends Native3DPreparedFieldsV3 {
  readonly version: "prepared-native3d-scene-3";
  readonly baseSourceKey: string;
  readonly variants: Readonly<Record<string, PreparedNative3DVariantV3>>;
  readonly variantKeysByOverrides: Readonly<Record<string, string>>;
}
