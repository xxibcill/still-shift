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
import { MechanismRigV2Schema, MechanismUnitAxisV2Schema } from "./rigs.ts";
import {
  MechanismAnchorV2Schema,
  MechanismRelationshipV2Schema,
} from "./scene-v2.ts";
import { MECHANISM_TEACHING_SHAPE_LIMITS } from "./teaching-shapes.ts";
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
export const MechanismPackCameraTargetSchema = z
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
    motionIntent: z.string().min(1).max(128),
    relationships: z.array(MechanismIdSchema).max(8),
    framing: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("parts"),
          ids: z.array(MechanismIdSchema).min(1).max(MECHANISM_LIMITS.parts),
        })
        .strict(),
      z
        .object({
          kind: z.literal("meshes"),
          ids: z.array(MechanismIdSchema).min(1).max(MECHANISM_LIMITS.parts),
        })
        .strict(),
    ]),
    fovDegrees: z.number().finite().min(14).max(65),
    viewDirections: z.array(MechanismUnitAxisV2Schema).min(1).max(8),
    proofSurfaces: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            mesh: MechanismIdSchema,
            nearAnchor: MechanismIdSchema,
            normal: MechanismUnitAxisV2Schema,
            offsetRatio: z
              .tuple([
                z.number().finite().min(-2).max(2),
                z.number().finite().min(-2).max(2),
                z.number().finite().min(-2).max(2),
              ])
              .default([0, 0, 0]),
          })
          .strict(),
      )
      .max(8),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("part"), id: MechanismIdSchema }).strict(),
      z.object({ kind: z.literal("anchor"), id: MechanismIdSchema }).strict(),
    ]),
  })
  .strict();
/** The declaration digest binds parameters and landmark membership without returning buffers. */
const shapeMetadata = z.discriminatedUnion("generator", [
  z
    .object({
      id: MechanismIdSchema,
      generator: z.literal("fixed-root-pawl-curve-1"),
      mesh: MechanismIdSchema,
      ownerPart: MechanismIdSchema,
      topologySha256: MechanismHashSchema,
      declarationSha256: MechanismHashSchema,
      landmarks: z
        .array(
          z
            .object({
              id: z.enum(["root", "tip", "trigger"]),
              vertices: z.number().int().min(1).max(16),
            })
            .strict(),
        )
        .min(2)
        .max(3)
        .refine(
          (landmarks) =>
            landmarks.some((l) => l.id === "root") &&
            landmarks.some((l) => l.id === "tip") &&
            (landmarks.length === 2 ||
              landmarks.some((l) => l.id === "trigger")),
          {
            message: "Pawl metadata requires root/tip and an optional trigger",
          },
        ),
      driver: z
        .object({
          rig: MechanismIdSchema,
          channel: z.literal("pawlDeflection"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      id: MechanismIdSchema,
      generator: z.literal("seated-torsion-spring-1"),
      mesh: MechanismIdSchema,
      ownerPart: MechanismIdSchema,
      topologySha256: MechanismHashSchema,
      declarationSha256: MechanismHashSchema,
      landmarks: z
        .array(
          z
            .object({
              id: z.enum(["seat-a", "seat-b", "coil-a", "coil-b"]),
              vertices: z.number().int().min(1).max(16),
            })
            .strict(),
        )
        .length(4),
      seats: z.tuple([MechanismIdSchema, MechanismIdSchema]),
    })
    .strict(),
]);
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
      .object({
        id: MechanismIdSchema,
        version: z.literal("1"),
        defaultSourceSha256: MechanismHashSchema,
        parameterSchemaSha256: MechanismHashSchema,
      })
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
            sha256: MechanismHashSchema,
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
    teachingShapes: z
      .array(shapeMetadata)
      .max(MECHANISM_TEACHING_SHAPE_LIMITS.meshes),
    relationships: z.array(MechanismRelationshipV2Schema).max(128),
    parameters: z.array(parameter).min(1).max(MECHANISM_PACK_LIMITS.parameters),
    cameraTargets: z
      .array(MechanismPackCameraTargetSchema)
      .min(6)
      .max(MECHANISM_PACK_LIMITS.targets),
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
    const meshes = ids(pack.meshes, "meshes"),
      shapes = ids(pack.teachingShapes, "teachingShapes");
    ids(pack.relationships, "relationships");
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
      else {
        requireId(shapes, anchor.source.shape, [
          "anchors",
          index,
          "source",
          "shape",
        ]);
        const shape = pack.teachingShapes.find(
          (shape) =>
            anchor.source.kind === "shape-landmark" &&
            shape.id === anchor.source.shape,
        );
        if (
          shape &&
          !shape.landmarks.some(
            (landmark) =>
              anchor.source.kind === "shape-landmark" &&
              landmark.id === anchor.source.landmark,
          )
        )
          mechanismIssue(
            context,
            "mechanism-pack-reference",
            "Unknown shape landmark",
            ["anchors", index, "source", "landmark"],
          );
      }
    });
    const driven = new Set<string>(),
      returns = new Set<string>();
    pack.rigs.forEach((rig, index) => {
      const path = ["rigs", index];
      if (rig.type === "spring-return") {
        requireId(rigs, rig.targetRig, [...path, "targetRig"]);
        const target = pack.rigs.find(
          (candidate) => candidate.id === rig.targetRig,
        );
        if (target && target.type !== "slider" && target.type !== "hinge")
          mechanismIssue(
            context,
            "mechanism-pack-reference",
            "Return requires a slider or hinge",
            [...path, "targetRig"],
          );
        if (target?.type === "slider" || target?.type === "hinge") {
          const range =
            target.type === "slider" ? target.range : target.angleRange;
          if (rig.restValue < range[0] || rig.restValue > range[1])
            mechanismIssue(
              context,
              "mechanism-pack-pose",
              "Return rest exceeds target limits",
              [...path, "restValue"],
            );
        }
        if (returns.has(rig.targetRig))
          mechanismIssue(
            context,
            "mechanism-pack-reference",
            "Duplicate return writer",
            [...path, "targetRig"],
          );
        returns.add(rig.targetRig);
      } else {
        requireId(parts, rig.movingPart, [...path, "movingPart"]);
        requireId(parts, rig.referencePart, [...path, "referencePart"]);
        if (driven.has(rig.movingPart))
          mechanismIssue(
            context,
            "mechanism-pack-reference",
            "Duplicate physical writer",
            [...path, "movingPart"],
          );
        driven.add(rig.movingPart);
        if (rig.type === "ratchet") {
          requireId(shapes, rig.pawlShape, [...path, "pawlShape"]);
          requireId(anchors, rig.pawlTipAnchor, [...path, "pawlTipAnchor"]);
          requireId(anchors, rig.toothDatumAnchor, [
            ...path,
            "toothDatumAnchor",
          ]);
          const shape = pack.teachingShapes.find(
            (shape) => shape.id === rig.pawlShape,
          );
          if (
            shape &&
            (shape.generator !== "fixed-root-pawl-curve-1" ||
              shape.driver.rig !== rig.id)
          )
            mechanismIssue(
              context,
              "mechanism-pack-reference",
              "Ratchet requires its driven pawl",
              [...path, "pawlShape"],
            );
        }
      }
    });
    pack.teachingShapes.forEach((shape, index) => {
      requireId(meshes, shape.mesh, ["teachingShapes", index, "mesh"]);
      requireId(parts, shape.ownerPart, ["teachingShapes", index, "ownerPart"]);
      const mesh = pack.meshes.find((mesh) => mesh.id === shape.mesh);
      if (
        mesh &&
        (mesh.part !== shape.ownerPart ||
          mesh.vertices > MECHANISM_TEACHING_SHAPE_LIMITS.vertices ||
          mesh.triangles > MECHANISM_TEACHING_SHAPE_LIMITS.triangles)
      )
        mechanismIssue(
          context,
          "mechanism-pack-reference",
          "Shape mesh owner or topology budget differs",
          ["teachingShapes", index, "mesh"],
        );
      checkUniqueIds(shape.landmarks, context, [
        "teachingShapes",
        index,
        "landmarks",
      ]);
      if (shape.generator === "fixed-root-pawl-curve-1") {
        requireId(rigs, shape.driver.rig, [
          "teachingShapes",
          index,
          "driver",
          "rig",
        ]);
        const rig = pack.rigs.find((rig) => rig.id === shape.driver.rig);
        if (rig && (rig.type !== "ratchet" || rig.pawlShape !== shape.id))
          mechanismIssue(
            context,
            "mechanism-pack-reference",
            "Pawl requires its owning ratchet",
            ["teachingShapes", index, "driver", "rig"],
          );
      } else
        shape.seats.forEach((seat, j) =>
          requireId(anchors, seat, ["teachingShapes", index, "seats", j]),
        );
    });
    pack.relationships.forEach((relationship, index) => {
      const pair =
        relationship.type === "engagement"
          ? [relationship.pawlTip, relationship.toothDatum]
          : relationship.anchors;
      pair.forEach((anchor, j) =>
        requireId(anchors, anchor, [
          "relationships",
          index,
          relationship.type === "engagement"
            ? j === 0
              ? "pawlTip"
              : "toothDatum"
            : "anchors",
          ...(relationship.type === "engagement" ? [] : [j]),
        ]),
      );
      if (relationship.type === "engagement") {
        requireId(rigs, relationship.rig, ["relationships", index, "rig"]);
        if (
          pack.rigs.find((rig) => rig.id === relationship.rig)?.type !==
          "ratchet"
        )
          mechanismIssue(
            context,
            "mechanism-pack-reference",
            "Engagement requires a ratchet",
            ["relationships", index, "rig"],
          );
      } else if (relationship.type === "fixed-offset")
        requireId(parts, relationship.referencePart, [
          "relationships",
          index,
          "referencePart",
        ]);
      else if (relationship.type === "signed-gap")
        requireId(parts, relationship.axisPart, [
          "relationships",
          index,
          "axisPart",
        ]);
    });
    const changingMeshes = pack.teachingShapes.map((shape) =>
      pack.meshes.find((mesh) => mesh.id === shape.mesh),
    );
    if (
      changingMeshes.reduce((n, mesh) => n + (mesh?.vertices ?? 0), 0) >
        MECHANISM_TEACHING_SHAPE_LIMITS.vertices ||
      changingMeshes.reduce((n, mesh) => n + (mesh?.triangles ?? 0), 0) >
        MECHANISM_TEACHING_SHAPE_LIMITS.triangles
    )
      mechanismIssue(
        context,
        "mechanism-pack-budget",
        "Aggregate changing mesh topology exceeds its fixed budget",
        ["teachingShapes"],
      );
    const relationshipIds = new Set(
      pack.relationships.map((relationship) => relationship.id),
    );
    pack.cameraTargets.forEach((camera, index) => {
      requireId(
        camera.target.kind === "part" ? parts : anchors,
        camera.target.id,
        ["cameraTargets", index, "target", "id"],
      );
      camera.framing.ids.forEach((id, j) =>
        requireId(camera.framing.kind === "parts" ? parts : meshes, id, [
          "cameraTargets",
          index,
          "framing",
          "ids",
          j,
        ]),
      );
      camera.relationships.forEach((id, j) =>
        requireId(relationshipIds, id, [
          "cameraTargets",
          index,
          "relationships",
          j,
        ]),
      );
      checkUniqueIds(camera.proofSurfaces, context, [
        "cameraTargets",
        index,
        "proofSurfaces",
      ]);
      camera.proofSurfaces.forEach((surface, j) => {
        requireId(meshes, surface.mesh, [
          "cameraTargets",
          index,
          "proofSurfaces",
          j,
          "mesh",
        ]);
        requireId(anchors, surface.nearAnchor, [
          "cameraTargets",
          index,
          "proofSurfaces",
          j,
          "nearAnchor",
        ]);
      });
    });
    for (const intent of [
      "recognition",
      "contact-approach",
      "macro",
      "aligned-comparison",
      "controlled-orbit",
      "return",
    ]) {
      if (!pack.cameraTargets.some((camera) => camera.intent === intent))
        mechanismIssue(
          context,
          "mechanism-pack-camera",
          "Pack must declare all six camera intents",
          ["cameraTargets"],
        );
    }
    pack.variants.forEach((variant, index) =>
      variant.details.forEach((detail, j) =>
        requireId(details, detail, ["variants", index, "details", j]),
      ),
    );
    const validatePose = (
      pose: { rig: string; value: number },
      path: (string | number)[],
    ) => {
      requireId(rigs, pose.rig, [...path, "rig"]);
      const rig = pack.rigs.find((rig) => rig.id === pose.rig);
      if (!rig) return;
      if (rig.type === "spring-return") {
        mechanismIssue(
          context,
          "mechanism-pack-pose",
          "Use the physical target rig for a pose",
          [...path, "rig"],
        );
        return;
      }
      const range = rig.type === "hinge" ? rig.angleRange : rig.range;
      if (pose.value < range[0] || pose.value > range[1])
        mechanismIssue(
          context,
          "mechanism-pack-pose",
          "Pose exceeds physical rig limits",
          [...path, "value"],
        );
    };
    const neutralIds = new Set<string>();
    pack.neutralPose.forEach((pose, index) => {
      validatePose(pose, ["neutralPose", index]);
      if (neutralIds.has(pose.rig))
        mechanismIssue(
          context,
          "mechanism-pack-pose",
          "Duplicate neutral rig value",
          ["neutralPose", index, "rig"],
        );
      neutralIds.add(pose.rig);
      const rig = pack.rigs.find((rig) => rig.id === pose.rig);
      if (rig && rig.type !== "spring-return") {
        const neutral =
          rig.type === "hinge"
            ? rig.neutralAngle
            : rig.type === "slider"
              ? rig.neutral
              : rig.range[0] + rig.neutralTooth * rig.pitch;
        if (pose.value !== neutral)
          mechanismIssue(
            context,
            "mechanism-pack-pose",
            "Neutral pose must equal the source rig's default",
            ["neutralPose", index, "value"],
          );
      }
    });
    pack.rigs.forEach((rig, index) => {
      if (rig.type !== "spring-return" && !neutralIds.has(rig.id))
        mechanismIssue(
          context,
          "mechanism-pack-pose",
          "Neutral pose must include every physical rig",
          ["rigs", index, "id"],
        );
    });
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
        validatePose(pose, ["diagnosticViews", index, "rigValues", j]),
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
