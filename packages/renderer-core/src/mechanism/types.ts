import type {
  MechanismCameraInput,
  MechanismCameraKeysInput,
  MechanismControlsInput,
  MechanismScene,
} from "@still-shift/scene-contract";
import type { MechanismMatrix } from "./matrix.ts";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
    : T;
export interface PreparedMechanismScene {
  readonly version: "prepared-mechanism-scene-1";
  readonly scene: DeepReadonly<MechanismScene>;
  readonly orderedPartIds: readonly string[];
  readonly baseLocalMatrices: Readonly<Record<string, MechanismMatrix>>;
}
export interface MechanismFrameRequest {
  readonly frame: number;
  readonly width: number;
  readonly height: number;
  readonly camera?: MechanismCameraInput;
  readonly cameraKeys?: MechanismCameraKeysInput;
  readonly controls?: MechanismControlsInput;
  readonly hiddenParts?: readonly string[];
  readonly seed?: number;
}
export type {
  MechanismPartFrame,
  MechanismRigFrame,
  MechanismAssertion,
  MechanismFrameResult,
} from "@still-shift/scene-contract";
export type { MechanismFrameResult as EvaluatedMechanismFrame } from "@still-shift/scene-contract";
export interface MechanismEvaluationLocation {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly frame?: number;
}
export class MechanismEvaluationError extends Error {
  readonly location: MechanismEvaluationLocation;
  constructor(message: string, location: MechanismEvaluationLocation) {
    super(message);
    this.name = "MechanismEvaluationError";
    this.location = location;
  }
}
