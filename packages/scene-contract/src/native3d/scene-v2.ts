import { z } from "zod";
import { MechanismSceneV2Schema } from "../mechanism/scene-v2.ts";
import { MechanismSceneV3Schema } from "./scene-v3.ts";
import { Native3DSourceSchema } from "./scene.ts";

export const Native3DSourceV2Schema = MechanismSceneV2Schema;
/** Explicit version dispatch boundary; the original v1 parser stays strict. */
export const Native3DSourceVersionsSchema = z.union([
  Native3DSourceSchema,
  Native3DSourceV2Schema,
  MechanismSceneV3Schema,
]);
export type Native3DSourceV2 = z.infer<typeof Native3DSourceV2Schema>;
export type Native3DSourceVersions = z.infer<
  typeof Native3DSourceVersionsSchema
>;
