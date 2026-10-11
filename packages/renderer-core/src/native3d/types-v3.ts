import type { preflightNativePbrResources } from "./pbr-allocations.ts";
import type { MechanismSceneV3 } from "@still-shift/scene-contract";
import type { PreparedMechanismPoseV2 } from "../mechanism/types-v2.ts";
import type { DeepReadonly } from "./types.ts";
export interface PreparedNative3DSceneV3 {
  readonly version: "prepared-native3d-scene-3";
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
