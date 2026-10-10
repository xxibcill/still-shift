import { z } from "zod";
import {
  MechanismIdSchema,
  MechanismHashSchema,
  MechanismVectorSchema,
  MECHANISM_LIMITS,
  checkUniqueIds,
  mechanismIssue,
} from "./primitives.ts";
import { MechanismPartSchema } from "./scene.ts";
import { MechanismRigV2Schema } from "./rigs.ts";
import { MechanismAnchorV2Schema } from "./scene-v2.ts";
export const MECHANISM_PACK_LIMITS = {
  documentBytes: 32768,
  parameters: 16,
  targets: 16,
  variants: 8,
  details: 8,
} as const;
const bounds = z
  .object({ min: MechanismVectorSchema, max: MechanismVectorSchema })
  .strict()
  .superRefine((value, context) => {
    for (let axis = 0; axis < 3; axis++)
      if (value.min[axis]! > value.max[axis]!)
        mechanismIssue(
          context,
          "mechanism-pack-bounds",
          "Bounds must be ordered",
          ["max", axis],
        );
  });
const parameter = z
  .object({
    id: MechanismIdSchema,
    description: z.string().min(1).max(512),
    unit: z.enum(["illustrative-unit", "radian", "ratio"]),
    minimum: z.number().finite(),
    maximum: z.number().finite(),
    default: z.number().finite(),
  })
  .strict()
  .superRefine((p, context) => {
    if (
      p.maximum <= p.minimum ||
      p.default < p.minimum ||
      p.default > p.maximum
    )
      mechanismIssue(
        context,
        "mechanism-pack-parameter",
        "Parameter range must be ordered and contain its default",
        ["default"],
      );
  });
const target = z
  .object({
    id: MechanismIdSchema,
    intent: z.enum([
      "recognition",
      "contact-approach",
      "macro",
      "aligned-comparison",
      "controlled-orbit",
      "return",
    ]),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("part"), id: MechanismIdSchema }).strict(),
      z.object({ kind: z.literal("anchor"), id: MechanismIdSchema }).strict(),
    ]),
  })
  .strict();
/** Metadata only. Mesh arrays and texture payloads have no supported field. */
export const MechanismPackDocumentSchema = z
  .object({
    schemaVersion: z.literal("mechanism-pack-1"),
    id: MechanismIdSchema,
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .max(64),
    family: z.enum(["tape-hook", "cable-tie", "clothespeg"]),
    status: z.enum(["candidate", "verified"]),
    generator: z
      .object({ id: MechanismIdSchema, version: z.literal("1") })
      .strict(),
    factualVariant: z
      .object({
        id: MechanismIdSchema,
        description: z.string().min(1).max(2048),
        dimensionBasis: z.enum(["illustrative", "measured"]),
        sources: z
          .array(
            z
              .object({
                url: z.string().url().max(2048),
                claim: z.string().min(1).max(512),
              })
              .strict(),
          )
          .min(1)
          .max(8),
      })
      .strict(),
    coordinateSystem: z.literal("right-handed-y-up"),
    units: z
      .object({
        kind: z.enum(["illustrative", "meter", "millimeter"]),
        scaleToMeters: z.number().finite().positive().max(1000),
      })
      .strict(),
    bounds,
    boundsPart: MechanismIdSchema,
    parts: z.array(MechanismPartSchema).min(1).max(MECHANISM_LIMITS.parts),
    meshes: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            part: MechanismIdSchema,
            material: MechanismIdSchema,
            vertices: z
              .number()
              .int()
              .positive()
              .max(MECHANISM_LIMITS.vertices),
            triangles: z
              .number()
              .int()
              .positive()
              .max(MECHANISM_LIMITS.triangles),
            bounds,
          })
          .strict(),
      )
      .min(1)
      .max(MECHANISM_LIMITS.parts),
    materialSlots: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            description: z.string().min(1).max(128),
          })
          .strict(),
      )
      .min(1)
      .max(MECHANISM_LIMITS.materials),
    anchors: z.array(MechanismAnchorV2Schema).max(MECHANISM_LIMITS.anchors),
    rigs: z.array(MechanismRigV2Schema).min(1).max(MECHANISM_LIMITS.rigs),
    parameters: z.array(parameter).min(1).max(MECHANISM_PACK_LIMITS.parameters),
    cameraTargets: z.array(target).min(1).max(MECHANISM_PACK_LIMITS.targets),
    details: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            description: z.string().min(1).max(512),
          })
          .strict(),
      )
      .min(1)
      .max(MECHANISM_PACK_LIMITS.details),
    variants: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            details: z
              .array(MechanismIdSchema)
              .min(1)
              .max(MECHANISM_PACK_LIMITS.details),
          })
          .strict(),
      )
      .min(1)
      .max(MECHANISM_PACK_LIMITS.variants),
    neutralPose: z
      .array(
        z
          .object({ rig: MechanismIdSchema, value: z.number().finite() })
          .strict(),
      )
      .max(MECHANISM_LIMITS.rigs),
    thumbnail: z
      .object({
        kind: z.literal("native-preview-recipe"),
        cameraTarget: MechanismIdSchema,
        sourceFrame: z.literal(0),
        width: z.number().int().min(16).max(2048),
        height: z.number().int().min(16).max(2048),
      })
      .strict(),
    diagnosticViews: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            cameraTarget: MechanismIdSchema,
            rigValues: z
              .array(
                z
                  .object({
                    rig: MechanismIdSchema,
                    value: z.number().finite(),
                  })
                  .strict(),
              )
              .max(MECHANISM_LIMITS.rigs),
          })
          .strict(),
      )
      .min(1)
      .max(16),
    compatibility: z
      .object({
        sceneVersion: z.literal("mechanism-scene-2"),
        nativeFrameVersion: z.literal("native3d-frame-2"),
        backend: z.literal("webgl2"),
        /** The composition must supply this verified font for surface markings. */
        textureFont: z
          .object({
            sha256: MechanismHashSchema,
            weight: z.string().regex(/^(?:[1-8]\d{2}|900)$/),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((pack, context) => {
    const ids = (rows: readonly { id: string }[], path: string) => {
      checkUniqueIds(rows, context, [path]);
      return new Set(rows.map((row) => row.id));
    };
    const parts = ids(pack.parts, "parts"),
      materials = ids(pack.materialSlots, "materialSlots"),
      anchors = ids(pack.anchors, "anchors"),
      rigs = ids(pack.rigs, "rigs"),
      cameras = ids(pack.cameraTargets, "cameraTargets"),
      details = ids(pack.details, "details");
    ids(pack.meshes, "meshes");
    ids(pack.parameters, "parameters");
    ids(pack.variants, "variants");
    ids(pack.diagnosticViews, "diagnosticViews");
    const requireId = (
      inventory: Set<string>,
      id: string,
      path: (string | number)[],
    ) => {
      if (!inventory.has(id))
        mechanismIssue(
          context,
          "mechanism-pack-reference",
          `Unknown declared reference ${id}`,
          path,
        );
    };
    pack.parts.forEach((part, index) => {
      if (part.parent)
        requireId(parts, part.parent, ["parts", index, "parent"]);
      const seen = new Set<string>();
      let owner: typeof part | undefined = part;
      while (owner) {
        if (seen.has(owner.id)) {
          mechanismIssue(
            context,
            "mechanism-pack-cycle",
            "Part hierarchy contains a cycle",
            ["parts", index, "parent"],
          );
          break;
        }
        seen.add(owner.id);
        owner = pack.parts.find((candidate) => candidate.id === owner!.parent);
      }
    });
    requireId(parts, pack.boundsPart, ["boundsPart"]);
    pack.meshes.forEach((mesh, index) => {
      requireId(parts, mesh.part, ["meshes", index, "part"]);
      requireId(materials, mesh.material, ["meshes", index, "material"]);
    });
    pack.anchors.forEach((anchor, index) => {
      if (anchor.source.kind === "part-local")
        requireId(parts, anchor.source.part, [
          "anchors",
          index,
          "source",
          "part",
        ]);
    });
    pack.cameraTargets.forEach((camera, index) =>
      requireId(
        camera.target.kind === "part" ? parts : anchors,
        camera.target.id,
        ["cameraTargets", index, "target", "id"],
      ),
    );
    pack.variants.forEach((variant, index) =>
      variant.details.forEach((detail, j) =>
        requireId(details, detail, ["variants", index, "details", j]),
      ),
    );
    pack.neutralPose.forEach((pose, index) =>
      requireId(rigs, pose.rig, ["neutralPose", index, "rig"]),
    );
    requireId(cameras, pack.thumbnail.cameraTarget, [
      "thumbnail",
      "cameraTarget",
    ]);
    pack.diagnosticViews.forEach((view, index) => {
      requireId(cameras, view.cameraTarget, [
        "diagnosticViews",
        index,
        "cameraTarget",
      ]);
      view.rigValues.forEach((pose, j) =>
        requireId(rigs, pose.rig, [
          "diagnosticViews",
          index,
          "rigValues",
          j,
          "rig",
        ]),
      );
    });
    if (
      pack.meshes.reduce((n, m) => n + m.vertices, 0) >
        MECHANISM_LIMITS.vertices ||
      pack.meshes.reduce((n, m) => n + m.triangles, 0) >
        MECHANISM_LIMITS.triangles
    )
      mechanismIssue(
        context,
        "mechanism-pack-budget",
        "Aggregate mesh counts exceed the geometry budget",
        ["meshes"],
      );
    if (
      new TextEncoder().encode(JSON.stringify(pack)).length >
      MECHANISM_PACK_LIMITS.documentBytes
    )
      mechanismIssue(
        context,
        "mechanism-pack-budget",
        "Metadata exceeds the 32 KiB document budget",
        [],
      );
  });
export type MechanismPackDocument = z.infer<typeof MechanismPackDocumentSchema>;
export const MechanismPackMetadataReceiptSchema = z
  .object({
    schemaVersion: z.literal("mechanism-pack-metadata-1"),
    sha256: MechanismHashSchema,
    pack: MechanismPackDocumentSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(receipt)).length >
      MECHANISM_PACK_LIMITS.documentBytes
    )
      mechanismIssue(
        context,
        "mechanism-pack-budget",
        "Metadata response exceeds the 32 KiB budget",
        [],
      );
  });
export type MechanismPackMetadataReceipt = z.infer<
  typeof MechanismPackMetadataReceiptSchema
>;
