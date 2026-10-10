import { z } from "zod";
import { SolidGeometrySchema } from "./geometry.ts";
import {
  MechanismSceneSchema,
  MechanismPartSchema,
  MechanismAnchorSchema,
  MechanismCameraSchema,
  MechanismRenderProfileSchema,
  MechanismLightSchema,
} from "../mechanism/scene.ts";
import {
  checkUniqueIds,
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
  mechanismIssue,
} from "../mechanism/primitives.ts";

export const SolidSceneSchema = z
  .object({
    schemaVersion: z.literal("solid-scene-1"),
    id: MechanismIdSchema,
    geometrySha256: MechanismHashSchema,
    coordinateSystem: z.literal("right-handed-y-up"),
    units: z
      .object({
        kind: z.enum(["illustrative", "meter", "millimeter"]),
        scaleToMeters: z.number().finite().positive().max(1000),
      })
      .strict(),
    seed: z.number().int().min(0).max(2_147_483_647).default(0),
    geometry: SolidGeometrySchema,
    parts: z.array(MechanismPartSchema).min(1).max(MECHANISM_LIMITS.parts),
    anchors: z
      .array(MechanismAnchorSchema)
      .max(MECHANISM_LIMITS.anchors)
      .default([]),
    camera: MechanismCameraSchema,
    profile: MechanismRenderProfileSchema,
    lights: z.array(MechanismLightSchema).max(8).default([]),
  })
  .strict()
  .superRefine((scene, context) => {
    for (const field of ["parts", "anchors", "lights"] as const)
      checkUniqueIds(scene[field], context, [field]);
    if (
      scene.lights.filter((light) => light.castShadow).length >
      MECHANISM_LIMITS.shadowLights
    )
      mechanismIssue(
        context,
        "comp-native3d-limit",
        "At most two shadow lights are supported",
        ["lights"],
      );
    const parts = new Map(scene.parts.map((part) => [part.id, part]));
    scene.parts.forEach((part, index) => {
      const seen = new Set([part.id]);
      let parent = part.parent;
      while (parent !== undefined) {
        if (seen.has(parent)) {
          mechanismIssue(
            context,
            "comp-native3d-cycle",
            `Cyclic parent chain at ${parent}`,
            ["parts", index, "parent"],
          );
          break;
        }
        seen.add(parent);
        const ancestor = parts.get(parent);
        if (!ancestor) {
          mechanismIssue(
            context,
            "comp-native3d-source",
            `Unknown parent ${parent}`,
            ["parts", index, "parent"],
          );
          break;
        }
        parent = ancestor.parent;
      }
    });
    scene.geometry.meshes.forEach((mesh, index) => {
      if (!parts.has(mesh.partId))
        mechanismIssue(
          context,
          "comp-native3d-source",
          `Unknown part ${mesh.partId}`,
          ["geometry", "meshes", index, "partId"],
        );
    });
    scene.anchors.forEach((anchor, index) => {
      if (!parts.has(anchor.part))
        mechanismIssue(
          context,
          "comp-native3d-source",
          `Unknown part ${anchor.part}`,
          ["anchors", index, "part"],
        );
    });
  });
export const Native3DSourceSchema = z.union([
  MechanismSceneSchema,
  SolidSceneSchema,
]);
export type SolidScene = z.infer<typeof SolidSceneSchema>;
export type SolidSceneInput = z.input<typeof SolidSceneSchema>;
export type Native3DSource = z.infer<typeof Native3DSourceSchema>;
