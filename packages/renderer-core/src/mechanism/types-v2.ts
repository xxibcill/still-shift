import type { MechanismMatrix } from "./matrix.ts";
import type { PreparedTeachingShape } from "./teaching-shapes.ts";
import type {
  MechanismRigControlsV2,
  MechanismSceneV2,
  MechanismKinematicSceneV2,
} from "@still-shift/scene-contract";
import { MechanismEvaluationError } from "./types.ts";
import type { DeepReadonly, MechanismEvaluationLocation } from "./types.ts";

export interface MechanismEvaluationLocationV2
  extends MechanismEvaluationLocation {
  readonly interval?: {
    readonly startFrame: number;
    readonly endFrameExclusive: number;
  };
}
export class MechanismEvaluationErrorV2 extends MechanismEvaluationError {
  declare readonly location: MechanismEvaluationLocationV2;
  constructor(message: string, location: MechanismEvaluationLocationV2) {
    super(message, location);
    this.name = "MechanismEvaluationErrorV2";
    this.location = location;
  }
}

export interface PreparedMechanismRigTracksV2 {
  readonly version: "prepared-mechanism-rig-tracks-2";
  readonly rigs: DeepReadonly<MechanismSceneV2["rigs"]>;
  readonly controls: DeepReadonly<MechanismRigControlsV2>;
}

export interface PreparedMechanismPoseV2 {
  readonly scene: DeepReadonly<MechanismKinematicSceneV2>;
  readonly orderedPartIds: readonly string[];
  readonly partsById: Readonly<
    Record<string, DeepReadonly<MechanismSceneV2["parts"][number]>>
  >;
  readonly physicalRigsByPart: Readonly<
    Record<
      string,
      DeepReadonly<
        Exclude<MechanismSceneV2["rigs"][number], { type: "spring-return" }>
      >
    >
  >;
  readonly baseLocalMatrices: Readonly<Record<string, MechanismMatrix>>;
  readonly teachingShapes: Readonly<Record<string, PreparedTeachingShape>>;
}

export interface PreparedMechanismSceneV2 extends PreparedMechanismPoseV2 {
  readonly version: "prepared-mechanism-scene-2";
  readonly scene: DeepReadonly<MechanismSceneV2>;
}
