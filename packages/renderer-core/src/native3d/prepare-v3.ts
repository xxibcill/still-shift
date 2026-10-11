import {
  MechanismSceneV3Schema,
  MechanismHashSchema,
} from "@still-shift/scene-contract";
import { prepareMechanismPoseV2 } from "../mechanism/prepare-v2.ts";
import { hashNativeData } from "./canonical-hash.ts";
import { freezeNativeData } from "./prepare.ts";
import { preflightNativePbrResources } from "./pbr-allocations.ts";
import { passageError } from "../passage-diagnostics.ts";
import type { PreparedNative3DSceneV3 } from "./types-v3.ts";
export async function prepareNative3DSceneV3(
  input: unknown,
  sourceSha256: string,
): Promise<PreparedNative3DSceneV3> {
  MechanismHashSchema.parse(sourceSha256);
  const source = MechanismSceneV3Schema.parse(input),
    geometrySha256 = await hashNativeData(source.geometry);
  if (geometrySha256 !== source.geometrySha256)
    passageError(
      "comp-native3d-checksum",
      "PBR source geometry differs from its declared identity",
      { path: "geometrySha256" },
    );
  const allocation = preflightNativePbrResources(source.geometry).receipt,
    effectiveSceneSha256 = await hashNativeData(source);
  return freezeNativeData({
    version: "prepared-native3d-scene-3" as const,
    source,
    sourceSha256,
    geometrySha256,
    effectiveSceneSha256,
    sourceKey: `native3d-source-3:${sourceSha256.slice(7)}:${effectiveSceneSha256.slice(7)}`,
    allocation,
    evaluation: prepareMechanismPoseV2(source),
  });
}
