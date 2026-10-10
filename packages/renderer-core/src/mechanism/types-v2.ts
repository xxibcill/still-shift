import type {
  MechanismRigControlsV2,
  MechanismSceneV2,
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
