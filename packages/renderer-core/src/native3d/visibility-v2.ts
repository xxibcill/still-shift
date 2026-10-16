import type {
  MechanismFrameResultV2,
  Native3DSourceV2,
  MechanismSceneV3,
  NativeScreenAnchorV2,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { nativeAnchorVisibilities } from "./physical-visibility.ts";

/** Expected posed positions only; independent physical success requires used-GPU evidence. */
export function nativeScreenAnchorsV2(
  source: DeepReadonly<Native3DSourceV2 | MechanismSceneV3>,
  frame: MechanismFrameResultV2,
): Record<string, NativeScreenAnchorV2> {
  const visibilities = nativeAnchorVisibilities(
    source.geometry,
    frame,
    Object.fromEntries(
      Object.values(frame.shapeStates).map((shape) => [
        shape.mesh,
        shape.positions,
      ]),
    ),
  );
  return Object.fromEntries(
    Object.entries(frame.anchors).map(([id, anchor]) => [
      id,
      {
        ...anchor,
        ...visibilities[id]!,
        visibilityMethod: "native-expected-posed-mesh-segment-2" as const,
      },
    ]),
  );
}
