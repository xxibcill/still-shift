import type {
  PreparedNative3DSceneV3,
  PreparedNative3DVariantV3,
} from "./types-v3.ts";
import type {
  Native3DSourceKey,
  Native3DSourceV2,
  NativeFrameSnapshotV2,
  NativeShapeAssociation,
} from "@still-shift/scene-contract";
import type { PreparedMechanismSceneV2 } from "../mechanism/types-v2.ts";
import type {
  DeepReadonly,
  PreparedNative3DScene,
  PreparedNative3DVariant,
} from "./types.ts";

export interface PreparedNative3DVariantV2 {
  readonly version: "prepared-native3d-variant-2";
  readonly sourceKey: Native3DSourceKey;
  readonly sourceSha256: string;
  readonly originalGeometrySha256: string;
  readonly effectiveSceneSha256: string;
  readonly geometrySha256: string;
  readonly meshDataSha256: string;
  readonly source: DeepReadonly<Native3DSourceV2>;
  readonly evaluation: PreparedMechanismSceneV2;
  readonly shapeAssociations: Readonly<
    Record<string, DeepReadonly<NativeShapeAssociation>>
  >;
}
export interface PreparedNative3DSceneV2 {
  readonly version: "prepared-native3d-scene-2";
  readonly sourceSha256: string;
  readonly source: DeepReadonly<Native3DSourceV2>;
  readonly baseSourceKey: Native3DSourceKey;
  readonly variants: Readonly<
    Record<Native3DSourceKey, PreparedNative3DVariantV2>
  >;
  readonly variantKeysByOverrides: Readonly<Record<string, Native3DSourceKey>>;
}
export type Native3DVariantReferenceV2 = Pick<
  NativeFrameSnapshotV2,
  | "asset"
  | "sourceKey"
  | "sourceSha256"
  | "effectiveSceneSha256"
  | "geometrySha256"
  | "controller"
  | "scope"
>;

export type PreparedNative3DSceneVersions =
  | PreparedNative3DScene
  | PreparedNative3DSceneV2
  | PreparedNative3DSceneV3;
export type PreparedNative3DVariantVersions =
  | PreparedNative3DVariant
  | PreparedNative3DVariantV2
  | PreparedNative3DVariantV3;
