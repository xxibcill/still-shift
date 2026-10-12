import type {
  NativeFrameSnapshotV3,
  NativeObservedCamera,
} from "@still-shift/scene-contract";
import { multiplyMatrices } from "../mechanism/matrix.ts";
import type { MechanismMatrix } from "../mechanism/matrix.ts";
import { inverseMechanismMatrixV2 } from "../mechanism/matrix-v2.ts";
import { nativeExpectedObservedCameraV2 } from "./observed-precision-v2.ts";
import type { DeepReadonly } from "./types.ts";
export function nativeExpectedPbrMatrices(
  reference: DeepReadonly<NativeFrameSnapshotV3>,
  part: string,
  camera?: NativeObservedCamera,
) {
  const intended =
    camera ??
    nativeExpectedObservedCameraV2(
      reference.frame.camera,
      reference.viewport.width,
      reference.viewport.height,
    );
  const modelViewMatrix = multiplyMatrices(
      intended.viewMatrix,
      reference.frame.parts[part]!.worldMatrix,
    ),
    inverse = inverseMechanismMatrixV2(modelViewMatrix as MechanismMatrix);
  return {
    modelViewMatrix: modelViewMatrix.map(Math.fround),
    projectionMatrix: intended.projectionMatrix.map(Math.fround),
    normalMatrix: [
      inverse[0],
      inverse[4],
      inverse[8],
      inverse[1],
      inverse[5],
      inverse[9],
      inverse[2],
      inverse[6],
      inverse[10],
    ].map(Math.fround),
  };
}
