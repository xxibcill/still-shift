import type {
  Native3DSource,
  NativeSceneFrame,
  NativeScreenAnchor,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { nativeAnchorVisibilities } from "./physical-visibility.ts";
export { NATIVE_ANCHOR_ENDPOINT_EPSILON } from "./physical-visibility.ts";

/** Physical catalogue only: graphics do not participate in visibility. */
export function nativeScreenAnchors(
  source: DeepReadonly<Native3DSource>,
  frame: NativeSceneFrame,
): Record<string, NativeScreenAnchor> {
  const visibilities = nativeAnchorVisibilities(source.geometry, frame);
  return Object.fromEntries(
    Object.entries(frame.anchors).map(([id, anchor]) => {
      const result = visibilities[id]!;
      return [
        id,
        {
          ...anchor,
          visibility: result.visibility,
          visibilityMethod: "native-physical-mesh-segment" as const,
          ...(result.occluderMesh === undefined
            ? {}
            : { occluderMesh: result.occluderMesh }),
        },
      ];
    }),
  );
}
