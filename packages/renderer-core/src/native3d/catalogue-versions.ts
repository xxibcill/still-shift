import { resolveNative3DVariantV3 } from "./prepare-v3.ts";
import type { NativeFrameSnapshotVersions } from "@still-shift/scene-contract";
import { passageError } from "../passage-diagnostics.ts";
import { freezeNativeData, resolveNative3DVariant } from "./prepare.ts";
import { resolveNative3DVariantV2 } from "./prepare-v2.ts";
import type { DeepReadonly, PreparedNative3DScene } from "./types.ts";
import type {
  PreparedNative3DSceneVersions,
  PreparedNative3DVariantVersions,
} from "./types-v2.ts";

/** Exact version pairing. A source2 reference never selects the original solid evaluator. */
export function resolveNative3DVariantVersions(
  catalogue:
    | Readonly<Record<string, PreparedNative3DSceneVersions>>
    | undefined,
  reference: DeepReadonly<NativeFrameSnapshotVersions>,
): PreparedNative3DVariantVersions {
  const location = {
    node: reference.controller,
    path: `${reference.scope}/${reference.controller}.asset`,
  };
  if (
    reference.version === "native3d-frame-1" &&
    (!catalogue || !Object.hasOwn(catalogue, reference.asset))
  )
    return resolveNative3DVariant(catalogue ? {} : undefined, reference);
  if (!catalogue || !Object.hasOwn(catalogue, reference.asset))
    passageError(
      "comp-native3d-not-ready",
      "Assigned native asset is not prepared",
      location,
    );
  const prepared = catalogue[reference.asset]!;
  if (reference.version === "native3d-frame-3") {
    if (prepared.version !== "prepared-native3d-scene-3")
      passageError(
        "comp-native3d-source",
        "Native frame/source protocols differ",
        location,
      );
    return resolveNative3DVariantV3({ [reference.asset]: prepared }, reference);
  }
  if (reference.version === "native3d-frame-2") {
    if (prepared.version !== "prepared-native3d-scene-2")
      passageError(
        "comp-native3d-source",
        "Native frame/source protocols differ",
        location,
      );
    return resolveNative3DVariantV2({ [reference.asset]: prepared }, reference);
  }
  if (prepared.version !== "prepared-native3d-scene-1")
    passageError(
      "comp-native3d-source",
      "Native frame/source protocols differ",
      location,
    );
  return resolveNative3DVariant({ [reference.asset]: prepared }, reference);
}

/** Existing E01 and observation1 adapters retain their explicitly original source protocol. */
export function requireLegacyNative3DCatalogue(
  catalogue:
    | Readonly<Record<string, PreparedNative3DSceneVersions>>
    | undefined,
): Readonly<Record<string, PreparedNative3DScene>> | undefined {
  if (!catalogue) return undefined;
  const result: Record<string, PreparedNative3DScene> = Object.create(null);
  for (const [id, source] of Object.entries(catalogue)) {
    if (source.version !== "prepared-native3d-scene-1")
      passageError(
        "comp-native3d-protocol",
        "This adapter requires the original native source protocol",
        { path: `assets.${id}` },
      );
    result[id] = source;
  }
  return freezeNativeData(result);
}
