import type {
  Native3DSource,
  Native3DSourceKey,
  Native3DSourceOverrides,
  NativeFrameSnapshot,
  NativeScreenAnchor,
  SolidScene,
} from "@still-shift/scene-contract";
import type {
  DeepReadonly,
  PreparedMechanismScene,
} from "../mechanism/types.ts";
import type { MechanismMatrix } from "../mechanism/matrix.ts";

export type { DeepReadonly } from "../mechanism/types.ts";
export type PreparedSolidScene = {
  readonly version: "prepared-solid-scene-1";
  readonly scene: DeepReadonly<SolidScene>;
  readonly orderedPartIds: readonly string[];
  readonly baseLocalMatrices: Readonly<Record<string, MechanismMatrix>>;
};
export type Native3DPreparationOptions = {
  readonly variants?: readonly Native3DSourceOverrides[];
};
export type PreparedNative3DVariant = {
  readonly version: "prepared-native3d-variant-1";
  readonly sourceKey: Native3DSourceKey;
  readonly sourceSha256: string;
  readonly originalGeometrySha256: string;
  readonly effectiveSceneSha256: string;
  readonly geometrySha256: string;
  readonly meshDataSha256: string;
  readonly source: DeepReadonly<Native3DSource>;
  readonly evaluation: PreparedMechanismScene | PreparedSolidScene;
};
export type PreparedNative3DScene = {
  readonly version: "prepared-native3d-scene-1";
  readonly sourceSha256: string;
  readonly source: DeepReadonly<Native3DSource>;
  readonly baseSourceKey: Native3DSourceKey;
  readonly variants: Readonly<
    Record<Native3DSourceKey, PreparedNative3DVariant>
  >;
  readonly variantKeysByOverrides: Readonly<Record<string, Native3DSourceKey>>;
};
export type Native3DVariantReference = Pick<
  NativeFrameSnapshot,
  | "asset"
  | "sourceKey"
  | "sourceSha256"
  | "effectiveSceneSha256"
  | "geometrySha256"
  | "controller"
  | "scope"
>;
export type NativeScopeSample = {
  scope: string;
  scopeFrame: number;
  owningScopeFps: number;
  layerTime: number;
  width: number;
  height: number;
};
export type NativeScreenBindingResult = {
  pixel: [number, number] | null;
  shown: boolean;
  indicator: boolean;
  visibility: NativeScreenAnchor["visibility"];
};
