export { prepareMechanismScene } from "./prepare.ts";
export { evaluateMechanismFrame } from "./evaluate.ts";
export type { MechanismMatrix } from "./matrix.ts";
export * from "./types.ts";
export { canonicalMechanismJson } from "./canonical.ts";
export { MechanismFrameResultSchema } from "@still-shift/scene-contract";
export * from "./types-v2.ts";
export {
  prepareMechanismRigTracksV2,
  evaluateMechanismRigTracksV2,
} from "./rig-tracks-v2.ts";
export { prepareMechanismSceneV2 } from "./prepare-v2.ts";
export { evaluateMechanismFrameV2 } from "./evaluate-v2.ts";
export {
  prepareTeachingShape,
  evaluateTeachingShape,
  createMechanismTeachingMesh,
} from "./teaching-shapes.ts";
export type {
  PreparedTeachingShape,
  TeachingShapeInputs,
} from "./teaching-shapes.ts";
export {
  createMechanismTeachingTopology,
  mechanismTeachingTopologyDocument,
} from "./teaching-topology.ts";
export type {
  MechanismTeachingTopology,
  MechanismTeachingRecipe,
} from "./teaching-topology.ts";

export {
  solveMechanismStaticMomentBalance,
  evaluateMechanismStaticMomentFrame,
} from "./static-moment.ts";
