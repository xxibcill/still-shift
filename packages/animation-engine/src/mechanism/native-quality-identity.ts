import {
  AnimationEngineError,
  type Composition,
  type MechanismEpisode,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../../renderer-core/src/mechanism/canonical.ts";
import type { NativePreparedMechanismEpisode } from "./native-lifecycle.ts";
import { mechanismOverlayQualityPolicy } from "./overlays.ts";

/** Native episode QA preserves its authored declarations; current label copy is resolved separately. */
export function assertNativeMechanismQualityPolicy(
  episode: MechanismEpisode,
  composition: Composition,
) {
  const authored = mechanismOverlayQualityPolicy(episode);
  delete authored.physicalProofHolds;
  const saved = composition.metadata?.readingPolicy;
  if (
    !saved ||
    canonicalMechanismJson(saved) !== canonicalMechanismJson(authored)
  )
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Saved native episode must preserve its authored QA policy and declarations",
      {
        diagnosticCode: "comp-native3d-quality-policy",
        stage: "mechanism-native-lifecycle",
        path: "metadata.readingPolicy",
      },
    );
}

type CheckIdentity = Pick<
  NativePreparedMechanismEpisode,
  | "projectHash"
  | "compositionSourceSha256"
  | "compositionSha256"
  | "preparedNativeSha256"
  | "appearanceCodeSha256"
  | "appearanceCodeIdentity"
  | "episodeSha256"
  | "geometrySha256"
  | "rigSha256"
  | "routeSelection"
  | "backend"
  | "profile"
>;
function identity(receipt: CheckIdentity) {
  return {
    projectHash: receipt.projectHash,
    compositionSourceSha256: receipt.compositionSourceSha256,
    compositionSha256: receipt.compositionSha256,
    preparedNativeSha256: receipt.preparedNativeSha256,
    appearanceCodeSha256: receipt.appearanceCodeSha256,
    appearanceCodeIdentity: receipt.appearanceCodeIdentity,
    episodeSha256: receipt.episodeSha256,
    geometrySha256: receipt.geometrySha256,
    rigSha256: receipt.rigSha256,
    routeSelection: receipt.routeSelection,
    backend: receipt.backend,
    profile: receipt.profile,
  };
}
/** A concurrent valid save/refresh must not make an older execution report current. */
export function assertNativePreparedCheckIdentity(
  initial: CheckIdentity,
  current: CheckIdentity,
) {
  if (
    canonicalMechanismJson(identity(initial)) !==
    canonicalMechanismJson(identity(current))
  )
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Native preparation changed during final checking; verify the current saved execution",
      {
        diagnosticCode: "comp-native3d-stale-check",
        stage: "mechanism-native-check",
        path: "prepared.receipt.json",
      },
    );
}
