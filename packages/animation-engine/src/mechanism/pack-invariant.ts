import type { MechanismPackReference } from "@still-shift/scene-contract";
import {
  MechanismEvaluationErrorV2,
  type MechanismEvaluationLocationV2,
} from "../../../renderer-core/src/mechanism/types-v2.ts";

export type MechanismPackInvariantLocation = MechanismEvaluationLocationV2 & {
  pack: MechanismPackReference;
  rig?: string;
  parts?: readonly string[];
  relationship?: string;
};
export class MechanismPackInvariantError extends MechanismEvaluationErrorV2 {
  declare readonly location: MechanismPackInvariantLocation;
  constructor(message: string, location: MechanismPackInvariantLocation) {
    super(message, location);
    this.name = "MechanismPackInvariantError";
  }
}
